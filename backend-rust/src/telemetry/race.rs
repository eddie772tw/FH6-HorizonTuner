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
#[derive(Clone, Debug, Default)]
pub struct RaceRecorderStatus {
    pub is_recording: bool,
    pub manual_mode: bool,
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
        s
    }
    pub fn drain_commands(&mut self) -> Vec<RecorderCommand> {
        self.commands.drain(..).collect()
    }
    pub fn clear(&mut self) {
        self.status = RaceRecorderStatus::default();
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
        self.lap_start_times.clear()
    }
    pub fn start_manual(
        &mut self,
        car_ordinal: i64,
        car_name: String,
        car_class: i64,
        car_pi: i64,
        start_time: f64,
    ) -> Result<String, String> {
        if self.status.current_session_id.is_some() {
            self.save_latest_and_clear("superseded")
        }
        self.clear();
        let id = format!("session_{}", Uuid::new_v4().simple());
        self.status.is_recording = true;
        self.status.manual_mode = true;
        self.status.current_session_id = Some(id.clone());
        self.commands.push_back(RecorderCommand::CreateSession {
            session_id: id.clone(),
            car_ordinal,
            car_name,
            car_class,
            car_pi,
            start_time,
        });
        Ok(id)
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
        if !race || (!self.status.manual_mode && !(race_time > 0.0 && lap >= 0)) {
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
            return;
        }
        let Some(ts) = ts else { return };
        if self.last_timestamp.map(|x| ts <= x).unwrap_or(false) {
            return;
        };
        if !self.status.is_recording {
            if !self.config.automatic {
                return;
            }
            self.start_auto(m)
        }
        if !self.status.is_recording {
            return;
        };
        self.last_timestamp = Some(ts);
        self.last_race_time = Some(race_time);
        self.last_progress_at = Some(now);
        self.awaiting_since = None;
        self.identity = Some(identity);
        if self.status.total_count >= self.config.max_samples {
            self.save_latest_and_clear("sample-limit");
            return;
        }
        let boundary =
            self.last_lap != Some(lap) || self.last_reported_lap.as_ref() != m.get("LastLap");
        self.last_lap = Some(lap);
        self.last_reported_lap = m.get("LastLap").cloned();
        if !boundary
            && self
                .sample_timestamp
                .map(|x| ts - x < self.config.downsample_interval_ms)
                .unwrap_or(false)
        {
            return;
        }
        self.append(data, ts)
    }
    pub fn tick(&mut self, now: f64) {
        if !now.is_finite() {
            return;
        }
        if self.awaiting_since.map(|x| now - x >= 3.0).unwrap_or(false) {
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
        self.commands.push_back(RecorderCommand::Finalize{session_id:id,metadata:serde_json::json!({"recordingSchema":"decoded-fh6/v1","endReason":reason,"capturedSamples":self.status.total_count,"droppedSamples":self.status.dropped_samples,"sampleIntervalSeconds":self.config.downsample_interval_ms/1000.0,"raceClockRegressions":self.race_clock_regressions})});
        self.clear()
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
