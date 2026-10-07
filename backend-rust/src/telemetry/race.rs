use serde_json::{Map, Value};
use std::collections::VecDeque;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub enum RecorderCommand {
    CreateSession {
        session_id: String,
        car_ordinal: i64,
        car_name: String,
        car_class: i64,
        car_pi: i64,
        start_time: f64,
    },
    WritePoints {
        session_id: String,
        points: Vec<Value>,
    },
    Finalize {
        session_id: String,
        metadata: Value,
    },
}
#[derive(Clone, Debug)]
pub struct RaceRecorderConfig {
    pub automatic: bool,
    pub race_recording: bool,
    pub max_samples: usize,
    pub downsample_interval_ms: f64,
}
impl Default for RaceRecorderConfig {
    fn default() -> Self {
        Self {
            automatic: true,
            race_recording: true,
            max_samples: 50_000,
            downsample_interval_ms: 100.0,
        }
    }
}
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct ActiveRoute {
    pub route_id: String,
    pub name: String,
    #[serde(default = "default_circuit_mode")]
    pub mode: String, // "circuit" | "time_trial" | "roaming"
    pub start_x: f64,
    pub start_y: f64,
    pub start_z: f64,
    #[serde(default = "default_radius")]
    pub start_radius: f64,
    pub end_x: Option<f64>,
    pub end_y: Option<f64>,
    pub end_z: Option<f64>,
    pub end_radius: Option<f64>,
}
fn default_circuit_mode() -> String {
    "circuit".into()
}
fn default_radius() -> f64 {
    15.0
}

#[derive(Clone, Debug, Default)]
pub struct RaceRecorderStatus {
    pub is_recording: bool,
    pub manual_mode: bool,
    pub recording_mode: String,
    pub armed: bool,
    pub armed_route_id: Option<String>,
    pub current_session_id: Option<String>,
    pub total_count: usize,
    pub pending_commands: usize,
    pub dropped_samples: usize,
}
pub struct RaceRecorder {
    config: RaceRecorderConfig,
    settings: Map<String, Value>,
    car_database: Map<String, Value>,
    status: RaceRecorderStatus,
    batch: Vec<Value>,
    first_timestamp: Option<f64>,
    sample_timestamp: Option<f64>,
    last_timestamp: Option<f64>,
    last_race_time: Option<f64>,
    last_lap: Option<i64>,
    last_reported_lap: Option<Value>,
    identity: Option<(i64, i64, i64)>,
    last_progress_at: Option<f64>,
    awaiting_since: Option<f64>,
    race_clock_regressions: usize,
    commands: VecDeque<RecorderCommand>,
    lap_start_times: Map<String, Value>,
    armed_route: Option<ActiveRoute>,
    was_inside_start: bool,
    recording_mode: String,
    time_trial_lap: i64,
    last_pos: Option<(f64, f64, f64)>,
}
impl RaceRecorder {
    pub fn new(config: RaceRecorderConfig) -> Self {
        Self::new_with_context(config, Value::Object(Map::new()), Value::Object(Map::new()))
    }
    pub fn new_with_context(
        config: RaceRecorderConfig,
        settings: Value,
        car_database: Value,
    ) -> Self {
        let mut c = config;
        c.automatic = true;
        if c.max_samples == 0 {
            c.max_samples = 50_000
        }
        Self {
            config: c,
            settings: settings.as_object().cloned().unwrap_or_default(),
            car_database: car_database.as_object().cloned().unwrap_or_default(),
            status: RaceRecorderStatus::default(),
            batch: vec![],
            first_timestamp: None,
            sample_timestamp: None,
            last_timestamp: None,
            last_race_time: None,
            last_lap: None,
            last_reported_lap: None,
            identity: None,
            last_progress_at: None,
            awaiting_since: None,
            race_clock_regressions: 0,
            commands: VecDeque::new(),
            lap_start_times: Map::new(),
            armed_route: None,
            was_inside_start: false,
            recording_mode: "circuit".into(),
            time_trial_lap: 1,
            last_pos: None,
        }
    }
    pub fn update_settings(&mut self, settings: &Value) {
        if let Some(m) = settings.as_object() {
            self.settings = m.clone();
            if let Some(v) = m.get("race_recording").and_then(Value::as_bool) {
                self.config.race_recording = v
            }
            if let Some(v) = m.get("max_samples").and_then(Value::as_u64) {
                self.config.max_samples = v as usize
            }
            if let Some(v) = m.get("downsample_interval").and_then(Value::as_f64) {
                self.config.downsample_interval_ms = v * 1000.0
            }
        }
    }
    pub fn set_car_database(&mut self, car_database: &Value) {
        if let Some(m) = car_database.as_object() {
            self.car_database = m.clone()
        }
    }
    pub fn status(&self) -> RaceRecorderStatus {
        let mut s = self.status.clone();
        s.pending_commands = self.commands.len();
        s.recording_mode = self.recording_mode.clone();
        s.armed_route_id = self.armed_route.as_ref().map(|r| r.route_id.clone());
        s
    }
    pub fn drain_commands(&mut self) -> Vec<RecorderCommand> {
        self.commands.drain(..).collect()
    }
    pub fn clear(&mut self) {
        self.status = RaceRecorderStatus::default();
        self.status.recording_mode = "circuit".into();
        self.recording_mode = "circuit".into();
        self.armed_route = None;
        self.was_inside_start = false;
        self.time_trial_lap = 1;
        self.batch.clear();
        self.first_timestamp = None;
        self.sample_timestamp = None;
        self.last_timestamp = None;
        self.last_race_time = None;
        self.last_lap = None;
        self.last_reported_lap = None;
        self.identity = None;
        self.last_progress_at = None;
        self.awaiting_since = None;
        self.race_clock_regressions = 0;
        self.lap_start_times.clear();
        self.last_pos = None;
    }
    pub fn arm_route(&mut self, route: ActiveRoute) {
        self.status.armed = true;
        self.status.armed_route_id = Some(route.route_id.clone());
        self.status.recording_mode = route.mode.clone();
        self.recording_mode = route.mode.clone();
        self.armed_route = Some(route);
        self.was_inside_start = false;
    }
    pub fn disarm_route(&mut self) {
        self.status.armed = false;
        self.status.armed_route_id = None;
        self.armed_route = None;
    }
    pub fn start_manual_with_mode(
        &mut self,
        car_ordinal: i64,
        car_name: String,
        car_class: i64,
        car_pi: i64,
        start_time: f64,
        mode: &str,
        route: Option<ActiveRoute>,
    ) -> Result<String, String> {
        if self.status.current_session_id.is_some() {
            self.save_latest_and_clear("superseded");
        }
        self.clear();
        let resolved_name = if car_ordinal > 0
            && (car_name.is_empty()
                || car_name == "Unknown Car"
                || car_name == "Manual Session"
                || car_name == "Armed Route Session")
        {
            self.car_database
                .get(&car_ordinal.to_string())
                .and_then(Value::as_object)
                .map(|x| {
                    ["year", "make", "model"]
                        .iter()
                        .filter_map(|k| {
                            x.get(*k)
                                .map(|v| v.to_string().trim_matches('"').to_string())
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|x| !x.is_empty())
                .unwrap_or(car_name)
        } else {
            car_name
        };
        let id = format!("session_{}", Uuid::new_v4().simple());
        self.status.is_recording = true;
        self.status.manual_mode = true;
        let rec_mode = if mode.is_empty() { "circuit" } else { mode };
        self.recording_mode = rec_mode.to_string();
        self.status.recording_mode = rec_mode.to_string();
        self.armed_route = route;
        self.time_trial_lap = 1;
        self.status.current_session_id = Some(id.clone());
        self.commands.push_back(RecorderCommand::CreateSession {
            session_id: id.clone(),
            car_ordinal,
            car_name: resolved_name,
            car_class,
            car_pi,
            start_time,
        });
        Ok(id)
    }
    pub fn start_manual(
        &mut self,
        car_ordinal: i64,
        car_name: String,
        car_class: i64,
        car_pi: i64,
        start_time: f64,
    ) -> Result<String, String> {
        self.start_manual_with_mode(car_ordinal, car_name, car_class, car_pi, start_time, "circuit", None)
    }
    pub fn record(&mut self, data: &Value) {
        self.record_at(data, now_seconds());
    }
    /// Record with an injected monotonic clock. `tick` must receive values
    /// from the same clock domain.
    pub fn record_at(&mut self, data: &Value, now: f64) {
        let Some(m) = data.as_object() else { return };
        if !self.status.manual_mode
            && !self
                .settings
                .get("race_recording")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        {
            if self.status.is_recording {
                self.save_latest_and_clear("recording-disabled")
            }
            return;
        }

        let pos_x = m.get("PositionX").and_then(Value::as_f64);
        let pos_y = m.get("PositionY").and_then(Value::as_f64);
        let pos_z = m.get("PositionZ").and_then(Value::as_f64);
        let current_pos = match (pos_x, pos_y, pos_z) {
            (Some(x), Some(y), Some(z)) => Some((x, y, z)),
            _ => None,
        };

        if self.status.armed {
            if let Some(route) = self.armed_route.clone() {
                if let Some(curr) = current_pos {
                    let entered = match self.last_pos {
                        Some(prev) => segment_intersects_sphere(
                            prev,
                            curr,
                            (route.start_x, route.start_y, route.start_z),
                            route.start_radius,
                        ),
                        None => is_inside_sphere(
                            curr.0,
                            curr.1,
                            curr.2,
                            route.start_x,
                            route.start_y,
                            route.start_z,
                            route.start_radius,
                        ),
                    };
                    if entered {
                        self.status.armed = false;
                        self.status.armed_route_id = None;
                        let ordinal = i(m, "CarOrdinal", 0);
                        let name = self
                            .car_database
                            .get(&ordinal.to_string())
                            .and_then(Value::as_object)
                            .map(|x| {
                                ["year", "make", "model"]
                                    .iter()
                                    .filter_map(|k| {
                                        x.get(*k)
                                            .map(|v| v.to_string().trim_matches('"').to_string())
                                    })
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            })
                            .filter(|x| !x.is_empty())
                            .unwrap_or_else(|| {
                                if ordinal > 0 {
                                    format!("Car #{}", ordinal)
                                } else {
                                    "Armed Route Session".into()
                                }
                            });
                        let mode = route.mode.clone();
                        let _ = self.start_manual_with_mode(
                            ordinal,
                            name,
                            i(m, "CarClass", 0),
                            i(m, "CarPerformanceIndex", 0),
                            now,
                            &mode,
                            Some(route),
                        );
                        self.was_inside_start = true;
                    }
                }
            }
        }

        if self.status.is_recording {
            if self.recording_mode == "time_trial" {
                if let Some(route) = &self.armed_route {
                    if let Some(curr) = current_pos {
                        let dist_sq = (curr.0 - route.start_x).powi(2)
                            + (curr.1 - route.start_y).powi(2)
                            + (curr.2 - route.start_z).powi(2);
                        let r = route.start_radius;
                        let hyst_r = r * 1.2;
                        if dist_sq > hyst_r * hyst_r {
                            self.was_inside_start = false;
                        } else if !self.was_inside_start {
                            let entered = match self.last_pos {
                                Some(prev) => segment_intersects_sphere(
                                    prev,
                                    curr,
                                    (route.start_x, route.start_y, route.start_z),
                                    r,
                                ),
                                None => dist_sq <= r * r,
                            };
                            if entered {
                                self.was_inside_start = true;
                                self.time_trial_lap += 1;
                            }
                        }
                    }
                }
            } else if self.recording_mode == "roaming" {
                if let Some(route) = &self.armed_route {
                    if let (Some(ex), Some(ey), Some(ez), Some(er)) =
                        (route.end_x, route.end_y, route.end_z, route.end_radius)
                    {
                        if let Some(curr) = current_pos {
                            let reached = match self.last_pos {
                                Some(prev) => segment_intersects_sphere(
                                    prev,
                                    curr,
                                    (ex, ey, ez),
                                    er,
                                ),
                                None => is_inside_sphere(curr.0, curr.1, curr.2, ex, ey, ez, er),
                            };
                            if reached {
                                self.save_latest_and_clear("destination-reached");
                                self.last_pos = current_pos;
                                return;
                            }
                        }
                    }
                }
            }
        }

        let race = i(m, "IsRaceOn", 0) == 1;
        let race_time = f(m, "CurrentRaceTime", 0.0);
        let lap = i(m, "LapNumber", 0);
        let ts = m.get("TimestampMS").and_then(Value::as_f64);
        let identity = (
            i(m, "CarOrdinal", 0),
            i(m, "CarPerformanceIndex", 0),
            i(m, "DrivetrainType", 0),
        );
        if self.identity.is_some() && self.identity != Some(identity) {
            self.save_latest_and_clear("identity-changed")
        }
        if let (Some(last), Some(now)) = (self.last_timestamp, ts) {
            if now < last {
                self.save_latest_and_clear("timestamp-regressed")
            }
        }
        if let Some(previous_race_time) = self.last_race_time {
            if race && race_time < previous_race_time {
                if self
                    .last_lap
                    .map(|previous| lap < previous)
                    .unwrap_or(false)
                {
                    self.save_latest_and_clear("race-restarted");
                } else {
                    self.race_clock_regressions += 1;
                    self.last_race_time = Some(race_time);
                }
            }
        }
        let should_skip = if self.status.manual_mode {
            false
        } else {
            !race || !(race_time > 0.0 && lap >= 0)
        };
        if should_skip {
            if self.status.is_recording {
                if self.awaiting_since.is_none() {
                    self.awaiting_since = Some(now)
                }
                if let Some(t) = ts {
                    if self.first_timestamp.is_some()
                        && self.sample_timestamp.map(|x| t > x).unwrap_or(true)
                    {
                        self.append(data, t)
                    }
                }
            }
            self.last_pos = current_pos;
            return;
        }
        let Some(ts) = ts else {
            self.last_pos = current_pos;
            return;
        };
        if self.last_timestamp.map(|x| ts <= x).unwrap_or(false) {
            self.last_pos = current_pos;
            return;
        };
        if !self.status.is_recording {
            if !self.config.automatic {
                self.last_pos = current_pos;
                return;
            }
            self.start_auto(m)
        }
        if !self.status.is_recording {
            self.last_pos = current_pos;
            return;
        };
        self.last_timestamp = Some(ts);
        self.last_race_time = Some(race_time);
        self.last_progress_at = Some(now);
        self.awaiting_since = None;
        self.identity = Some(identity);
        if self.status.total_count >= self.config.max_samples {
            self.save_latest_and_clear("sample-limit");
            self.last_pos = current_pos;
            return;
        }
        let boundary = if self.recording_mode == "time_trial" {
            self.last_lap != Some(self.time_trial_lap)
        } else {
            self.last_lap != Some(lap) || self.last_reported_lap.as_ref() != m.get("LastLap")
        };
        self.last_lap = if self.recording_mode == "time_trial" {
            Some(self.time_trial_lap)
        } else {
            Some(lap)
        };
        self.last_reported_lap = m.get("LastLap").cloned();
        if !boundary
            && self
                .sample_timestamp
                .map(|x| ts - x < self.config.downsample_interval_ms)
                .unwrap_or(false)
        {
            self.last_pos = current_pos;
            return;
        }
        self.append(data, ts);
        self.last_pos = current_pos;
    }
    pub fn tick(&mut self, now: f64) {
        if !now.is_finite() {
            return;
        }
        if !self.status.manual_mode && self.awaiting_since.map(|x| now - x >= 3.0).unwrap_or(false) {
            self.save_latest_and_clear("race-stopped")
        } else if self
            .last_progress_at
            .map(|x| now - x >= 3.0)
            .unwrap_or(false)
        {
            self.save_latest_and_clear("telemetry-stopped")
        }
    }
    pub fn last_progress_at(&self) -> Option<f64> {
        self.last_progress_at
    }
    fn start_auto(&mut self, m: &Map<String, Value>) {
        self.clear();
        let id = format!("session_{}", Uuid::new_v4().simple());
        let ordinal = i(m, "CarOrdinal", 0);
        let car = self
            .car_database
            .get(&ordinal.to_string())
            .and_then(Value::as_object);
        let name = car
            .map(|x| {
                ["year", "make", "model"]
                    .iter()
                    .filter_map(|k| {
                        x.get(*k)
                            .map(|v| v.to_string().trim_matches('"').to_string())
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|x| !x.is_empty())
            .unwrap_or_else(|| {
                if ordinal > 0 {
                    format!("Car #{}", ordinal)
                } else {
                    "Unknown Car".into()
                }
            });
        self.status.is_recording = true;
        self.status.current_session_id = Some(id.clone());
        self.commands.push_back(RecorderCommand::CreateSession {
            session_id: id,
            car_ordinal: ordinal,
            car_name: name,
            car_class: i(m, "CarClass", 0),
            car_pi: i(m, "CarPerformanceIndex", 0),
            start_time: now_seconds(),
        })
    }
    fn append(&mut self, data: &Value, ts: f64) {
        let Some(id) = self.status.current_session_id.clone() else {
            return;
        };
        if self.first_timestamp.is_none() {
            self.first_timestamp = Some(ts)
        }
        let rel = (ts - self.first_timestamp.unwrap()) / 1000.0;
        let mut p = data.clone();
        if let Some(m) = p.as_object_mut() {
            m.insert("time".into(), Value::from((rel * 100.0).round() / 100.0));
            if self.recording_mode == "time_trial" {
                m.insert("LapNumber".into(), Value::from(self.time_trial_lap));
            }
            let lap = m.get("LapNumber").and_then(Value::as_i64).unwrap_or(0);
            self.lap_start_times
                .entry(lap.to_string())
                .or_insert_with(|| Value::from(rel));
        }
        self.batch.push(p);
        self.status.total_count += 1;
        self.sample_timestamp = Some(ts);
        if self.batch.len() >= 50 {
            self.flush(id)
        }
    }
    fn flush(&mut self, id: String) {
        if self.batch.is_empty() {
            return;
        }
        let p = std::mem::take(&mut self.batch);
        self.commands.push_back(RecorderCommand::WritePoints {
            session_id: id,
            points: p,
        })
    }
    pub fn save_latest_and_clear(&mut self, reason: &str) {
        let Some(id) = self.status.current_session_id.clone() else {
            self.clear();
            return;
        };
        self.flush(id.clone());
        let mode = self.recording_mode.clone();
        let route_id = self.armed_route.as_ref().map(|r| r.route_id.clone());
        let route_name = self.armed_route.as_ref().map(|r| r.name.clone());
        let mut meta = serde_json::json!({
            "recordingSchema": "decoded-fh6/v1",
            "endReason": reason,
            "capturedSamples": self.status.total_count,
            "droppedSamples": self.status.dropped_samples,
            "sampleIntervalSeconds": self.config.downsample_interval_ms / 1000.0,
            "raceClockRegressions": self.race_clock_regressions,
        });
        if mode != "circuit" {
            meta["recording_mode"] = Value::String(mode);
        }
        if let Some(rid) = route_id {
            meta["route_id"] = Value::String(rid);
        }
        if let Some(rname) = route_name {
            meta["route_name"] = Value::String(rname);
        }
        self.commands.push_back(RecorderCommand::Finalize {
            session_id: id,
            metadata: meta,
        });
        self.clear();
    }
}
fn f(m: &Map<String, Value>, k: &str, d: f64) -> f64 {
    m.get(k).and_then(Value::as_f64).unwrap_or(d)
}
fn i(m: &Map<String, Value>, k: &str, d: i64) -> i64 {
    m.get(k)
        .and_then(Value::as_i64)
        .or_else(|| m.get(k).and_then(Value::as_f64).map(|x| x as i64))
        .unwrap_or(d)
}
fn now_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_secs_f64())
        .unwrap_or(0.0)
}

pub fn is_inside_sphere(x: f64, y: f64, z: f64, cx: f64, cy: f64, cz: f64, r: f64) -> bool {
    let dist_sq = (x - cx).powi(2) + (y - cy).powi(2) + (z - cz).powi(2);
    dist_sq <= r * r
}

pub fn segment_intersects_sphere(
    p0: (f64, f64, f64),
    p1: (f64, f64, f64),
    center: (f64, f64, f64),
    radius: f64,
) -> bool {
    if is_inside_sphere(p0.0, p0.1, p0.2, center.0, center.1, center.2, radius)
        || is_inside_sphere(p1.0, p1.1, p1.2, center.0, center.1, center.2, radius)
    {
        return true;
    }
    let (vx, vy, vz) = (p1.0 - p0.0, p1.1 - p0.1, p1.2 - p0.2);
    let (wx, wy, wz) = (center.0 - p0.0, center.1 - p0.1, center.2 - p0.2);
    let c1 = wx * vx + wy * vy + wz * vz;
    let c2 = vx * vx + vy * vy + vz * vz;
    if c2 <= f64::EPSILON {
        return false;
    }
    let t = (c1 / c2).clamp(0.0, 1.0);
    let closest_x = p0.0 + t * vx;
    let closest_y = p0.1 + t * vy;
    let closest_z = p0.2 + t * vz;
    is_inside_sphere(closest_x, closest_y, closest_z, center.0, center.1, center.2, radius)
}
