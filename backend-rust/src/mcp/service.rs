//! Read-only MCP service.  This module intentionally mirrors `backend/mcp/service.py`.
use crate::{app::App, config_service::json_files, storage};
use serde_json::{json, Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub struct McpService<'a> {
    pub app: &'a App,
}
impl<'a> McpService<'a> {
    pub fn new(app: &'a App) -> Self {
        Self { app }
    }
    fn n(p: &Value, keys: &[&str], default: f64) -> f64 {
        keys.iter()
            .find_map(|k| p.get(*k).and_then(Value::as_f64))
            .unwrap_or(default)
    }
    fn round(v: f64, places: i32) -> f64 {
        // Rust's formatter and Python's built-in round share the required
        // ties-to-even behavior for these decimal display precisions.  This
        // also preserves Python's binary-float edge cases (for example
        // round(88.35, 1) == 88.3) that a scaled f64::round loses.
        let precision = places.max(0) as usize;
        format!("{v:.precision$}").parse().unwrap_or(v)
    }
    fn live_sample(&self) -> Option<Value> {
        let settings = self.app.config.settings();
        if settings
            .get("mcp_allow_live")
            .and_then(Value::as_bool)
            .unwrap_or(true)
        {
            self.app.live().map(|v| (*v).clone())
        } else {
            None
        }
    }
    fn telemetry(&self) -> Value {
        if let Some(sample) = self.live_sample() {
            return json!({"status":"live","source":"udp_memory_stream","latest_sample":sample});
        }
        let sessions = self.app.database.list_all_sessions().unwrap_or_default();
        let id = sessions
            .first()
            .and_then(|s| s.get("session_id"))
            .cloned()
            .unwrap_or(Value::Null);
        let point = id
            .as_str()
            .and_then(|id| self.app.database.get_telemetry_points(id, None).ok())
            .and_then(|v| v.into_iter().last());
        json!({"status":if point.is_some(){"ready"}else{"idle"},"active_session_id":id,"total_recorded_sessions":sessions.len(),"latest_sample":point})
    }
    fn sample(&self) -> Value {
        self.live_sample()
            .or_else(|| self.telemetry().get("latest_sample").cloned())
            .unwrap_or(Value::Null)
    }
    pub fn get_live_telemetry_snapshot(&self) -> Value {
        self.telemetry()
    }
    pub fn get_driver_cockpit_telemetry(&self) -> Value {
        self.format_driver_cockpit(&self.sample())
    }
    pub fn format_driver_cockpit(&self, p: &Value) -> Value {
        let rpm = Self::n(p, &["CurrentEngineRpm", "rpm"], 0.0);
        let max = Self::n(p, &["EngineMaxRpm"], 8000.0);
        let idle = Self::n(p, &["EngineIdleRpm"], 800.0);
        let speed = Self::n(p, &["SpeedMetersPerSecond", "speed"], 0.0);
        let gear = Self::n(p, &["Gear", "gear"], 0.0) as i64;
        let gear_display = match gear {
            0 => "R".to_string(),
            11 => "N".to_string(),
            x => x.to_string(),
        };
        let pct = |explicit: &str, raw: &str, scale: f64| {
            p.get(explicit)
                .and_then(Value::as_f64)
                .unwrap_or_else(|| Self::n(p, &[raw], 0.0) / scale * 100.0)
        };
        let accel = pct("accel_pct", "AccelInput", 255.0);
        let brake = pct("brake_pct", "BrakeInput", 255.0);
        let clutch = pct("clutch_pct", "ClutchInput", 255.0);
        let handbrake = pct("handbrake_pct", "HandBrakeInput", 255.0);
        let steer = pct("steer_pct", "SteerInput", 127.0);
        json!({"engine":{"rpm":Self::round(rpm,1),"idle_rpm":Self::round(idle,1),"max_rpm":Self::round(max,1),"rpm_ratio":if max>0.0{Self::round(rpm/max,3).clamp(0.0,1.0)}else{0.0},"is_shift_alert":rpm>=max*0.95&&max>1000.0,"is_ev":idle==0.0},"transmission":{"gear_raw":gear,"gear_display":gear_display},"speed":{"meters_per_second":Self::round(speed,2),"kmh":Self::round(speed*3.6,1),"mph":Self::round(speed*2.23694,1)},"driver_inputs":{"throttle_pct":Self::round(accel,1),"brake_pct":Self::round(brake,1),"clutch_pct":Self::round(clutch,1),"handbrake_pct":Self::round(handbrake,1),"steer_pct":Self::round(steer,1),"steer_angle_deg":Self::round(steer*0.45,1)}})
    }
    pub fn get_vehicle_dynamics_telemetry(&self) -> Value {
        self.format_vehicle_dynamics(&self.sample())
    }
    pub fn format_vehicle_dynamics(&self, p: &Value) -> Value {
        let ax = Self::n(p, &["AccelerationX", "accel_x"], 0.0);
        let ay = Self::n(p, &["AccelerationY", "accel_y"], 0.0);
        let az = Self::n(p, &["AccelerationZ", "accel_z"], 0.0);
        let pw = Self::n(p, &["PowerWatts", "power_watts"], 0.0);
        let tq = Self::n(p, &["TorqueNewtons", "torque_nm"], 0.0);
        let boost = Self::n(p, &["Boost", "boost"], 0.0);
        let yaw = Self::n(p, &["Yaw", "yaw"], 0.0);
        let pitch = Self::n(p, &["Pitch", "pitch"], 0.0);
        let roll = Self::n(p, &["Roll", "roll"], 0.0);
        let idle = Self::n(p, &["EngineIdleRpm"], 800.0);
        let g = |v: f64| Self::round(v / 9.81, 3);
        let bpsi = boost * 0.0001450377;
        let bbar = boost / 100000.0;
        json!({"g_forces":{"lateral_g":g(ax),"longitudinal_g":g(az),"vertical_g":g(ay)},"orientation":{"yaw_rad":Self::round(yaw,4),"yaw_deg":Self::round(yaw.to_degrees(),2),"pitch_rad":Self::round(pitch,4),"pitch_deg":Self::round(pitch.to_degrees(),2),"roll_rad":Self::round(roll,4),"roll_deg":Self::round(roll.to_degrees(),2)},"power_train":{"power_kw":Self::round(pw/1000.0,1),"power_hp":Self::round(pw/745.699872,1),"torque_nm":Self::round(tq,1),"torque_ftlb":Self::round(tq*0.737562,1),"boost_psi":Self::round(bpsi,2),"boost_bar":Self::round(bbar,3),"is_ev":idle==0.0,"is_regen_active":idle==0.0&&(pw<0.0||tq<0.0)},"position":{"x":Self::round(Self::n(p,&["PositionX","pos_x"],0.0),2),"y":Self::round(Self::n(p,&["PositionY","pos_y"],0.0),2),"z":Self::round(Self::n(p,&["PositionZ","pos_z"],0.0),2)}})
    }
    fn arr(p: &Value, keys: &[&str], defaults: [f64; 4]) -> [f64; 4] {
        for key in keys {
            if let Some(v) = p
                .get(*key)
                .and_then(Value::as_array)
                .filter(|v| v.len() >= 4)
            {
                return [0, 1, 2, 3].map(|i| v[i].as_f64().unwrap_or(0.0));
            }
        }
        defaults
    }
    pub fn get_tires_status_telemetry(&self) -> Value {
        self.format_tires_status(&self.sample())
    }
    pub fn format_tires_status(&self, p: &Value) -> Value {
        let temps = Self::arr(
            p,
            &["TireTemp"],
            [
                Self::n(p, &["temp_fl"], 180.0),
                Self::n(p, &["temp_fr"], 180.0),
                Self::n(p, &["temp_rl"], 180.0),
                Self::n(p, &["temp_rr"], 180.0),
            ],
        );
        let sa = Self::arr(
            p,
            &["TireSlipAngle"],
            [
                Self::n(p, &["slip_angle_fl"], 0.0),
                Self::n(p, &["slip_angle_fr"], 0.0),
                Self::n(p, &["slip_angle_rl"], 0.0),
                Self::n(p, &["slip_angle_rr"], 0.0),
            ],
        );
        let sr = Self::arr(
            p,
            &["TireSlipRatio"],
            [
                Self::n(p, &["slip_ratio_fl"], 0.0),
                Self::n(p, &["slip_ratio_fr"], 0.0),
                Self::n(p, &["slip_ratio_rl"], 0.0),
                Self::n(p, &["slip_ratio_rr"], 0.0),
            ],
        );
        let c = ["front_left", "front_right", "rear_left", "rear_right"];
        let mut corners = Map::new();
        let mut tc = [0.; 4];
        for i in 0..4 {
            tc[i] = Self::round((temps[i] - 32.0) * 5.0 / 9.0, 1);
            let ad = Self::round(sa[i].to_degrees(), 2);
            let rp = Self::round(sr[i] * 100.0, 1);
            let slip = (rp * rp + ad * ad).sqrt();
            corners.insert(c[i].into(),json!({"temp_c":tc[i],"temp_f":Self::round(temps[i],1),"slip_angle_deg":ad,"slip_ratio_pct":rp,"combined_slip":Self::round(slip,2),"is_slipping":slip>15.0,"is_overheating":tc[i]>110.0}));
        }
        json!({"summary":{"front_avg_temp_c":Self::round((tc[0]+tc[1])/2.0,1),"rear_avg_temp_c":Self::round((tc[2]+tc[3])/2.0,1),"axle_temp_delta_c":Self::round((tc[0]+tc[1]-tc[2]-tc[3])/2.0,1)},"corners":corners})
    }
    pub fn get_suspension_telemetry(&self) -> Value {
        self.format_suspension(&self.sample())
    }
    pub fn format_suspension(&self, p: &Value) -> Value {
        let t = Self::arr(
            p,
            &["NormalizedSuspensionTravel", "SuspTravel"],
            [
                Self::n(p, &["susp_fl"], 0.0),
                Self::n(p, &["susp_fr"], 0.0),
                Self::n(p, &["susp_rl"], 0.0),
                Self::n(p, &["susp_rr"], 0.0),
            ],
        );
        let names = ["front_left", "front_right", "rear_left", "rear_right"];
        let mut c = Map::new();
        for i in 0..4 {
            let x = t[i].clamp(0., 1.);
            c.insert(names[i].into(),json!({"travel_ratio":Self::round(x,3),"travel_pct":Self::round(x*100.,1),"is_bottoming":x>=0.95}));
        }
        json!({"corners":c,"dynamics":{"roll_deflection":Self::round((t[0]-t[1])+(t[2]-t[3]),3),"pitch_dive":Self::round((t[0]+t[1])-(t[2]+t[3]),3)}})
    }

    pub fn list_race_sessions(&self, limit: i64, offset: i64) -> Vec<Value> {
        let all = self.app.database.list_all_sessions().unwrap_or_default();
        let start = offset.max(0) as usize;
        all.into_iter()
            .skip(start)
            .take(limit.max(0) as usize)
            .collect()
    }
    pub fn session_summary(&self, id: &str) -> Option<Value> {
        let sessions = self.app.database.list_all_sessions().ok()?;
        let s = sessions
            .into_iter()
            .find(|x| x["session_id"].as_str() == Some(id))?;
        let laps = self.app.database.get_session_laps(id).ok()?;
        Some(json!({"session":s,"laps":laps,"total_laps_count":laps.len()}))
    }
    pub fn session_points(
        &self,
        id: &str,
        lap: Option<i64>,
        downsample: i64,
        channels: Option<&Vec<Value>>,
    ) -> Vec<Value> {
        let mut p = self
            .app
            .database
            .get_telemetry_points(id, lap)
            .unwrap_or_default();
        let step = downsample.max(1) as usize;
        if step > 1 {
            p = p.into_iter().step_by(step).collect();
        }
        if let Some(ch) = channels {
            let set = ch
                .iter()
                .filter_map(Value::as_str)
                .collect::<std::collections::HashSet<_>>();
            p = p
                .into_iter()
                .map(|v| {
                    v.as_object()
                        .map(|o| {
                            Value::Object(
                                o.iter()
                                    .filter(|(k, _)| set.contains(k.as_str()))
                                    .map(|(k, v)| (k.clone(), v.clone()))
                                    .collect(),
                            )
                        })
                        .unwrap_or(Value::Null)
                })
                .collect();
        }
        p
    }

    fn walk_json(dir: &Path, out: &mut Vec<PathBuf>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                let Ok(kind) = e.file_type() else {
                    continue;
                };
                // Never follow symlinks/junctions: they can escape the declared
                // preset/capture root or create an infinite recursion cycle.
                if kind.is_symlink() {
                    continue;
                }
                if kind.is_dir() {
                    Self::walk_json(&p, out)
                } else if kind.is_file() && p.extension().is_some_and(|x| x == "json") {
                    out.push(p)
                }
            }
        }
    }
    fn captures(&self) -> Vec<(PathBuf, Value)> {
        let mut paths = Vec::new();
        if let Some(project) = self.app.config.root.parent() {
            Self::walk_json(&project.join("docs").join("calibration"), &mut paths);
        }
        Self::walk_json(
            &self.app.config.root.join("docs").join("calibration"),
            &mut paths,
        );
        Self::walk_json(&self.app.config.root.join("captures"), &mut paths);
        paths
            .into_iter()
            .filter_map(|p| {
                storage::read_json(&p)
                    .ok()
                    .filter(|v| v["schemaVersion"] == "tuning-capture/v1")
                    .map(|v| (p, v))
            })
            .collect()
    }
    pub fn list_captures(
        &self,
        surface: Option<&str>,
        purpose: Option<&str>,
        confidence: Option<&str>,
    ) -> Vec<Value> {
        self.captures().into_iter().filter_map(|(p,d)|{let m=d["metadata"].clone();if surface.is_some_and(|x|m["surface"]!=x)||purpose.is_some_and(|x|m["purpose"]!=x)||confidence.is_some_and(|x|d["confidence"]!=x){return None} ;Some(json!({"capture_id":d["captureId"].as_str().unwrap_or_else(||p.file_name().and_then(|x|x.to_str()).unwrap_or("")),"file_path":p,"created_at":d["createdAt"],"metadata":m,"samples_count":d["samples"].as_array().map_or(0,Vec::len),"confidence":d["confidence"].as_str().unwrap_or("unverified")}))}).collect()
    }
    fn capture(&self, id: &str) -> Option<(PathBuf, Value)> {
        let clean = Path::new(id).file_name()?.to_str()?;
        self.captures().into_iter().find(|(p, d)| {
            d["captureId"].as_str() == Some(id)
                || d["captureId"].as_str() == Some(clean)
                || p.file_name().and_then(|x| x.to_str()) == Some(clean)
        })
    }
    pub fn capture_summary(&self, id: &str) -> Option<Value> {
        let (p, d) = self.capture(id)?;
        let samples = d["samples"].as_array().cloned().unwrap_or_default();
        let ts: Vec<f64> = samples
            .iter()
            .map(|s| s["timestampMs"].as_f64().unwrap_or(0.))
            .collect();
        let speeds: Vec<f64> = samples
            .iter()
            .map(|s| s["speedKmh"].as_f64().unwrap_or(0.))
            .collect();
        let max = speeds.iter().fold(0.0_f64, |a, &b| a.max(b));
        let avg = if speeds.is_empty() {
            0.
        } else {
            speeds.iter().sum::<f64>() / speeds.len() as f64
        };
        let m = d["metadata"].clone();
        let has_complete_metadata = ["carOrdinal", "installedParts", "surface"]
            .iter()
            .all(|key| {
                let value = &m[*key];
                !value.is_null() && value != "unknown" && value != ""
            });
        Some(
            json!({"capture_id":d["captureId"],"file_path":p,"metadata":m,"summary":{"sample_count":samples.len(),"duration_sec":if ts.len()>1{Self::round((ts[ts.len()-1]-ts[0])/1000.,2)}else{0.},"max_speed_kmh":Self::round(max,1),"avg_speed_kmh":Self::round(avg,1)},"hygiene":{"is_monotonic_timestamps":ts.windows(2).all(|x|x[0]<=x[1]),"has_complete_metadata":has_complete_metadata},"confidence":d["confidence"].as_str().unwrap_or("unverified")}),
        )
    }
    pub fn capture_window(
        &self,
        id: &str,
        start: i64,
        end: Option<i64>,
        channels: Option<&Vec<Value>>,
        max_samples: i64,
    ) -> Vec<Value> {
        let Some((_p, d)) = self.capture(id) else {
            return vec![];
        };
        let mut v = d["samples"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|s| {
                let t = s["timestampMs"].as_i64().unwrap_or(0);
                t >= start && end.is_none_or(|x| t <= x)
            })
            .collect::<Vec<_>>();
        if v.is_empty() {
            return v;
        };
        let step = (v.len() / max_samples.max(1) as usize).max(1);
        if step > 1 {
            v = v.into_iter().step_by(step).collect();
        }
        if let Some(ch) = channels {
            let set = ch
                .iter()
                .filter_map(Value::as_str)
                .collect::<std::collections::HashSet<_>>();
            v = v
                .into_iter()
                .map(|x| {
                    let Some(object) = x.as_object() else {
                        return Value::Object(Map::new());
                    };
                    Value::Object(
                        object
                            .iter()
                            .filter(|(k, _)| set.contains(k.as_str()))
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    )
                })
                .collect();
        }
        v
    }
    pub fn compare_captures(&self, b: &str, c: &str) -> Option<Value> {
        let a = self.capture_summary(b)?;
        let d = self.capture_summary(c)?;
        Some(
            json!({"baseline":{"id":a["capture_id"],"meta":a["metadata"],"summary":a["summary"]},"candidate":{"id":d["capture_id"],"meta":d["metadata"],"summary":d["summary"]},"delta":{"max_speed_diff_kmh":Self::round(d["summary"]["max_speed_kmh"].as_f64().unwrap_or(0.)-a["summary"]["max_speed_kmh"].as_f64().unwrap_or(0.),2),"avg_speed_diff_kmh":Self::round(d["summary"]["avg_speed_kmh"].as_f64().unwrap_or(0.)-a["summary"]["avg_speed_kmh"].as_f64().unwrap_or(0.),2),"duration_diff_sec":Self::round(d["summary"]["duration_sec"].as_f64().unwrap_or(0.)-a["summary"]["duration_sec"].as_f64().unwrap_or(0.),2)}}),
        )
    }

    pub fn drag_sessions(&self) -> Vec<Value> {
        let mut out = Vec::new();
        for p in json_files(&self.app.config.root.join("drag_sessions")) {
            if let Ok(d) = storage::read_json(&p) {
                let meta = d.get("metadata").filter(|v| v.is_object()).unwrap_or(&d);
                out.push(json!({"filename":p.file_name().and_then(|x|x.to_str()).unwrap_or(""),"file_path":p,"car_name":meta["car_name"].as_str().unwrap_or("Unknown Car"),"timestamp":meta["timestamp"],"times":meta["times"]}));
            }
        }
        out.sort_by(|a, b| b["timestamp"].to_string().cmp(&a["timestamp"].to_string()));
        out
    }
    pub fn drag_analysis(&self, name: &str) -> Option<Value> {
        let clean = Path::new(name).file_name()?.to_str()?;
        self.drag_sessions()
            .into_iter()
            .find(|x| x["filename"] == clean)
            .and_then(|x| storage::read_json(Path::new(x["file_path"].as_str()?)).ok())
    }
    pub fn search_cars(
        &self,
        q: Option<&str>,
        dt: Option<&str>,
        class: Option<&str>,
    ) -> Vec<Value> {
        let Some(db) = self.app.config.car_database.as_object() else {
            return vec![];
        };
        db.iter().filter_map(|(key,c)|{let name=Self::car_name(c).unwrap_or("");let drivetrain=c["drivetrain"].as_str().unwrap_or("");let cls=c["car_class"].as_str().or(c["class"].as_str()).unwrap_or("");if q.is_some_and(|x|!name.to_lowercase().contains(&x.to_lowercase())&&!key.contains(x))||dt.is_some_and(|x|x.to_uppercase()!=drivetrain.to_uppercase())||class.is_some_and(|x|x.to_uppercase()!=cls.to_uppercase()){return None}Some(json!({"ordinal":c["ordinal"].as_i64().or_else(||key.parse().ok()).unwrap_or(0),"car_id":key,"name":name,"year":c["year"],"drivetrain":drivetrain,"class":cls,"pi":c["pi"],"weight_kg":c["weight_kg"].as_f64().or(c["weight"].as_f64()),"front_weight_bias":c["front_weight_bias"].as_f64().or(c["weight_distribution"].as_f64()),"max_rpm":c["max_rpm"].as_f64().or(c["redline_rpm"].as_f64())}))}).take(50).collect()
    }
    fn car_name(car: &Value) -> Option<&str> {
        ["name", "car_name", "display_name"]
            .iter()
            .find_map(|key| car[*key].as_str().filter(|name| !name.trim().is_empty()))
    }
    pub fn car_details(&self, id: &str) -> Option<Value> {
        let db = self.app.config.car_database.as_object()?;
        let c = db.get(id).or_else(|| {
            db.values()
                .find(|x| x["ordinal"].to_string().trim_matches('"') == id)
        })?;
        Some(
            json!({"car_id":c["car_id"].as_str().unwrap_or(id),"name":Self::car_name(c),"class":c["class"].as_str().or(c["car_class"].as_str()),"pi":c["pi"],"drivetrain":c["drivetrain"],"weight_kg":c["weight_kg"].as_f64().or(c["weight"].as_f64()),"front_weight_bias":c["front_weight_bias"].as_f64().or(c["weight_distribution"].as_f64()),"max_rpm":c["max_rpm"].as_f64().or(c["redline_rpm"].as_f64()),"idle_rpm":c["idle_rpm"].as_f64().unwrap_or(800.),"torque_nm":c["torque_nm"].as_f64().or(c["torque"].as_f64()),"power_kw":c["power_kw"].as_f64().or(c["power"].as_f64())}),
        )
    }
    pub fn capabilities(&self, id: &str, parts: Option<&Map<String, Value>>) -> Value {
        let p = parts.cloned().unwrap_or_default();
        let race = |k: &str| p.get(k).and_then(Value::as_str) == Some("race");
        json!({"car_id":id,"installed_parts":p,"capabilities":{"tire_pressure":true,"camber":race("suspension"),"toe":race("suspension"),"caster":race("suspension"),"arb_front":race("arb"),"arb_rear":race("arb"),"springs":race("suspension"),"ride_height":race("suspension"),"damping_rebound":race("suspension"),"damping_bump":race("suspension"),"aero_downforce":race("aero"),"gearing_final_drive":race("transmission"),"gearing_individual":race("transmission"),"differential_lock":race("differential")}})
    }
    pub fn priors(&self, name: Option<&str>) -> Value {
        let p = json!({"target_hot_pressure_psi":32.0,"natural_frequency_hz":{"road_front":2.2,"road_rear":2.4,"rally_front":1.6,"rally_rear":1.7,"drift_front":2.5,"drift_rear":2.3},"critical_damping_ratio":{"rebound":0.65,"bump":0.35},"aego_gearing":{"max_step_ratio":0.85,"first_gear_traction_factor":1.15}});
        name.and_then(|x| p.get(x).map(|v| json!({x:v})))
            .unwrap_or(p)
    }
    pub fn presets(&self, id: Option<&str>) -> Vec<Value> {
        let mut paths = Vec::new();
        Self::walk_json(&self.app.config.root.join("tunings"), &mut paths);
        paths.into_iter().filter_map(|p| {
            let d = storage::read_json(&p).ok()?;
            let stem = p.file_stem()?.to_str()?;
            let cid = d.get("car_id").or_else(|| d.get("carId"))
                .filter(|v| v.is_string() || v.is_number())
                .map(|v| v.as_str().map(str::to_owned).unwrap_or_else(|| v.to_string()))
                .unwrap_or_else(|| stem.split_once('-').map(|(car, _)| car).unwrap_or("").to_owned());
            if id.is_some_and(|x| x != cid) { return None; }
            Some(json!({"preset_name":stem,"car_id":cid,"created_at":d.get("created_at").or_else(|| d.get("createdAt")),"schema_version":d["schema_version"].as_str().or(d["schemaVersion"].as_str()).unwrap_or("unknown"),"file_path":p}))
        }).collect()
    }
    pub fn preset(&self, car: &str, name: &str) -> Option<Value> {
        if car.is_empty()
            || name.is_empty()
            || car.contains(['/', '\\'])
            || name.contains(['/', '\\'])
        {
            return None;
        }
        let path = storage::safe_path(
            &self.app.config.root.join("tunings"),
            &format!("{car}-{name}.json"),
        )
        .ok()?;
        if path.is_file() {
            return storage::read_json(&path).ok();
        }
        self.presets(Some(car))
            .into_iter()
            .find(|p| p["preset_name"] == name)
            .and_then(|p| storage::read_json(Path::new(p["file_path"].as_str()?)).ok())
    }
    /// Legacy quick baseline tuning solver (tuning-dev/v1).
    /// Formal SSOT is defined by docs/contracts/tuning_responsibilities.md and tests/fixtures/tuning_golden_fixtures.json.
    pub fn dev_solver(
        &self,
        c: &Map<String, Value>,
        parts: Option<&Map<String, Value>>,
        purpose: &str,
    ) -> Value {
        let ordinal = c["ordinal"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| c["ordinal"].as_i64().map(|x| x.to_string()))
            .unwrap_or_else(|| "0".into());
        let w = c["weight_kg"].as_f64().unwrap_or(1400.) * 2.20462;
        let f0 = c["front_weight_bias"].as_f64().unwrap_or(0.52);
        let f = if f0 > 1. { f0 / 100. } else { f0 };
        let r = 1. - f;
        let dt = c["drivetrain"].as_str().unwrap_or("RWD").to_uppercase();
        let (af, ar) = match purpose {
            "drag" => (1., 65.),
            "drift" => (Self::round(f * 45. + 1., 1), Self::round(r * 45. + 1., 1)),
            _ => (Self::round(f * 64. + 1., 1), Self::round(r * 64. + 1., 1)),
        };
        let rf = Self::round(f * 12. + 3., 1);
        let rr = Self::round(r * 12. + 3., 1);
        let diff = if dt == "FWD" {
            json!({"front_accel":45,"front_decel":0,"rear_accel":0,"rear_decel":0,"center_balance":0})
        } else if dt == "AWD" {
            json!({"front_accel":30,"front_decel":0,"rear_accel":65,"rear_decel":15,"center_balance":65})
        } else if purpose == "drift" {
            json!({"front_accel":0,"front_decel":0,"rear_accel":100,"rear_decel":100,"center_balance":0})
        } else {
            json!({"front_accel":0,"front_decel":0,"rear_accel":60,"rear_decel":20,"center_balance":0})
        };
        json!({"schemaVersion":"tuning-dev/v1","purpose":purpose,"calculated_setup":{"tires":{"front_cold_psi":28.5,"rear_cold_psi":28.5,"target_hot_psi":32.0},"alignment":{"camber_front_deg":if purpose=="drag"{-0.5}else{-1.8},"camber_rear_deg":if purpose=="drag"{0.0}else{-1.2},"toe_front_deg":if purpose=="drift"{0.5}else{0.0},"toe_rear_deg":if purpose=="drift"{-0.2}else{0.0},"caster_deg":if purpose=="drift"{7.0}else{6.5}},"anti_roll_bars":{"front":af,"rear":ar},"springs":{"front_lbs_in":Self::round(w*f*0.7,1),"rear_lbs_in":Self::round(w*r*0.7,1)},"dampers":{"rebound_front":rf,"rebound_rear":rr,"bump_front":Self::round(rf*0.6,1),"bump_rear":Self::round(rr*0.6,1)},"differential":diff},"capabilities":self.capabilities(&ordinal,parts)})
    }
    /// Legacy quick gearing solver (tuning-dev/v1).
    pub fn gearing(&self, max: f64, peak: f64, top: f64, count: i64, tire: f64) -> Value {
        crate::tuning::legacy_cli::gearing(max, peak, top, count, tire)
    }
    pub fn diagnosis(&self, t: &[f64], symptom: Option<&str>) -> Value {
        if t.len() < 4 {
            return json!({"error":"Requires 4 tire temperatures (FL, FR, RL, RR)"});
        };
        let f = (t[0] + t[1]) / 2.;
        let r = (t[2] + t[3]) / 2.;
        let d = f - r;
        let mut a = Vec::new();
        if d > 5. {
            a.push(json!("Front axle overheat: Soften Front ARB (-2.0) or increase front cold tire pressure (+0.5 PSI)."))
        } else if d < -5. {
            a.push(json!("Rear axle overheat: Soften Rear ARB (-2.0) or increase rear cold tire pressure (+0.5 PSI)."))
        }
        if symptom == Some("understeer_entry") {
            a.push(json!("Entry Understeer: Increase front negative camber (-0.2°) and reduce front bump damping."))
        } else if symptom == Some("oversteer_exit") {
            a.push(json!("Exit Oversteer: Soften rear spring (-5%) or reduce rear acceleration differential lock (-10%)."))
        }
        if a.is_empty() {
            a.push(json!(
                "Tire thermal balance is nominal. No adjustments required."
            ))
        }
        json!({"front_avg_temp_c":Self::round(f,1),"rear_avg_temp_c":Self::round(r,1),"axle_delta_t_c":Self::round(d,1),"convergence_status":if d.abs()<=3.0{"converged"}else{"adjustment_required"},"actionable_directives":a})
    }
    pub fn settings(&self) -> Value {
        storage::read_json(&self.app.config.root.join("settings.json"))
            .unwrap_or_else(|_| json!({"language":"zh-tw","speedUnit":"kmh","telemetryPort":8000}))
    }
    pub fn hud(&self) -> Value {
        storage::read_json(&self.app.config.root.join("hud_config.json"))
            .unwrap_or_else(|_| json!({"enabled":true,"showTeleMaster":true}))
    }
    pub fn logs(&self, n: i64) -> Vec<Value> {
        let p = self.app.config.root.join("logs/backend.log");
        fs::read_to_string(p)
            .unwrap_or_default()
            .lines()
            .rev()
            .take(n.max(1) as usize)
            .map(|s| Value::from(s))
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }
}
