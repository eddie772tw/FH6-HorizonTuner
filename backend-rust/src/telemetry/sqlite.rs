use super::contract::{decoded_point, LEGACY_POINT_SCHEMA};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

pub struct TelemetryStore {
    path: PathBuf,
}
impl TelemetryStore {
    pub fn new(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?
        }
        let s = Self {
            path: path.to_path_buf(),
        };
        s.init()?;
        Ok(s)
    }
    fn conn(&self) -> Result<Connection, String> {
        let c = Connection::open(&self.path).map_err(|e| e.to_string())?;
        c.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
        )
        .map_err(|e| e.to_string())?;
        Ok(c)
    }
    fn init(&self) -> Result<(), String> {
        let c = self.conn()?;
        c.execute_batch(r#"CREATE TABLE IF NOT EXISTS sessions(session_id TEXT PRIMARY KEY,car_ordinal INTEGER DEFAULT 0,car_name TEXT DEFAULT 'Unknown Car',car_class INTEGER DEFAULT 0,car_pi INTEGER DEFAULT 0,start_time REAL NOT NULL,total_laps INTEGER DEFAULT 0,best_lap_time REAL DEFAULT 0.0,total_distance REAL DEFAULT 0.0,metadata_json TEXT);CREATE TABLE IF NOT EXISTS laps(session_id TEXT NOT NULL,lap_number INTEGER NOT NULL,lap_time REAL DEFAULT 0.0,start_distance REAL DEFAULT 0.0,end_distance REAL DEFAULT 0.0,max_speed_kmh REAL DEFAULT 0.0,avg_speed_kmh REAL DEFAULT 0.0,lap_time_source TEXT DEFAULT 'sample-span-estimate',complete INTEGER DEFAULT 0,observed_span REAL,PRIMARY KEY(session_id,lap_number),FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS telemetry_channels(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,lap_number INTEGER NOT NULL,relative_time REAL NOT NULL,lap_distance REAL DEFAULT 0.0,speed REAL DEFAULT 0.0,rpm REAL DEFAULT 0.0,gear INTEGER DEFAULT 0,accel_pct REAL DEFAULT 0.0,brake_pct REAL DEFAULT 0.0,steer_pct REAL DEFAULT 0.0,clutch_pct REAL DEFAULT 0.0,handbrake_pct REAL DEFAULT 0.0,accel_x REAL DEFAULT 0.0,accel_y REAL DEFAULT 0.0,accel_z REAL DEFAULT 0.0,yaw REAL DEFAULT 0.0,pitch REAL DEFAULT 0.0,roll REAL DEFAULT 0.0,pos_x REAL DEFAULT 0.0,pos_y REAL DEFAULT 0.0,pos_z REAL DEFAULT 0.0,susp_fl REAL DEFAULT 0.0,susp_fr REAL DEFAULT 0.0,susp_rl REAL DEFAULT 0.0,susp_rr REAL DEFAULT 0.0,slip_angle_fl REAL DEFAULT 0.0,slip_angle_fr REAL DEFAULT 0.0,slip_angle_rl REAL DEFAULT 0.0,slip_angle_rr REAL DEFAULT 0.0,slip_ratio_fl REAL DEFAULT 0.0,slip_ratio_fr REAL DEFAULT 0.0,slip_ratio_rl REAL DEFAULT 0.0,slip_ratio_rr REAL DEFAULT 0.0,temp_fl REAL DEFAULT 0.0,temp_fr REAL DEFAULT 0.0,temp_rl REAL DEFAULT 0.0,temp_rr REAL DEFAULT 0.0,susp_meters_fl REAL DEFAULT 0.0,susp_meters_fr REAL DEFAULT 0.0,susp_meters_rl REAL DEFAULT 0.0,susp_meters_rr REAL DEFAULT 0.0,power_watts REAL DEFAULT 0.0,torque_newtons REAL DEFAULT 0.0,boost REAL DEFAULT 0.0,fuel REAL DEFAULT 1.0,raw_json TEXT,FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE);CREATE INDEX IF NOT EXISTS idx_telemetry_session_lap ON telemetry_channels(session_id,lap_number);CREATE INDEX IF NOT EXISTS idx_telemetry_distance ON telemetry_channels(session_id,lap_distance);"#).map_err(|e|e.to_string())?;
        for (table, columns) in [
            ("sessions", vec![("metadata_json", "TEXT")]),
            (
                "laps",
                vec![
                    ("lap_time_source", "TEXT DEFAULT 'sample-span-estimate'"),
                    ("complete", "INTEGER DEFAULT 0"),
                    ("observed_span", "REAL"),
                ],
            ),
            (
                "telemetry_channels",
                vec![
                    ("raw_json", "TEXT"),
                    ("susp_meters_fl", "REAL DEFAULT 0.0"),
                    ("susp_meters_fr", "REAL DEFAULT 0.0"),
                    ("susp_meters_rl", "REAL DEFAULT 0.0"),
                    ("susp_meters_rr", "REAL DEFAULT 0.0"),
                    ("power_watts", "REAL DEFAULT 0.0"),
                    ("torque_newtons", "REAL DEFAULT 0.0"),
                    ("boost", "REAL DEFAULT 0.0"),
                    ("fuel", "REAL DEFAULT 1.0"),
                ],
            ),
        ] {
            let sql = format!("PRAGMA table_info({table})");
            let existing = c
                .prepare(&sql)
                .map_err(|e| e.to_string())?
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect::<std::collections::HashSet<_>>();
            for (name, definition) in columns {
                if !existing.contains(name) {
                    c.execute(
                        &format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"),
                        [],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        c.execute_batch("CREATE INDEX IF NOT EXISTS idx_telemetry_session_lap ON telemetry_channels(session_id,lap_number);CREATE INDEX IF NOT EXISTS idx_telemetry_distance ON telemetry_channels(session_id,lap_distance);").map_err(|e| e.to_string())
    }
    pub fn create_session(
        &self,
        session_id: &str,
        car_ordinal: i64,
        car_name: &str,
        car_class: i64,
        car_pi: i64,
        start_time: f64,
    ) -> Result<(), String> {
        let c = self.conn()?;
        c.execute("INSERT OR REPLACE INTO sessions(session_id,car_ordinal,car_name,car_class,car_pi,start_time) VALUES(?,?,?,?,?,?)",params![session_id,car_ordinal,car_name,car_class,car_pi,start_time]).map_err(|e|e.to_string()).map(|_|())
    }
    pub fn insert_points_batch(&self, session_id: &str, points: &[Value]) -> Result<(), String> {
        if points.is_empty() {
            return Ok(());
        }
        let mut c = self.conn()?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let mut insert = tx
            .prepare("INSERT INTO telemetry_channels(session_id,lap_number,relative_time,lap_distance,speed,rpm,gear,accel_pct,brake_pct,steer_pct,clutch_pct,handbrake_pct,accel_x,accel_y,accel_z,yaw,pitch,roll,pos_x,pos_y,pos_z,susp_fl,susp_fr,susp_rl,susp_rr,slip_angle_fl,slip_angle_fr,slip_angle_rl,slip_angle_rr,slip_ratio_fl,slip_ratio_fr,slip_ratio_rl,slip_ratio_rr,temp_fl,temp_fr,temp_rl,temp_rr,susp_meters_fl,susp_meters_fr,susp_meters_rl,susp_meters_rr,power_watts,torque_newtons,boost,fuel,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .map_err(|e| e.to_string())?;
        for source in points {
            let p = decoded_point(source);
            let a = |k: &str| p.get(k).and_then(Value::as_f64);
            let arr = |k: &str, i: usize| {
                p.get(k)
                    .and_then(Value::as_array)
                    .and_then(|x| x.get(i))
                    .and_then(Value::as_f64)
            };
            insert
                .execute(params![
                    session_id,
                    i64v(&p, "LapNumber", 0),
                    a("time").unwrap_or(0.0),
                    a("DistanceTraveled"),
                    a("SpeedMetersPerSecond").map(|x| x * 3.6),
                    a("CurrentEngineRpm"),
                    i64v(&p, "Gear", 0),
                    a("accel_pct"),
                    a("brake_pct"),
                    a("steer_pct"),
                    a("clutch_pct"),
                    a("handbrake_pct"),
                    a("AccelerationX").map(|x| x / 9.81),
                    a("AccelerationY").map(|x| x / 9.81),
                    a("AccelerationZ").map(|x| x / 9.81),
                    a("Yaw"),
                    a("Pitch"),
                    a("Roll"),
                    a("PositionX"),
                    a("PositionY"),
                    a("PositionZ"),
                    arr("NormalizedSuspensionTravel", 0),
                    arr("NormalizedSuspensionTravel", 1),
                    arr("NormalizedSuspensionTravel", 2),
                    arr("NormalizedSuspensionTravel", 3),
                    arr("TireSlipAngle", 0).map(|x| x * 57.29578),
                    arr("TireSlipAngle", 1).map(|x| x * 57.29578),
                    arr("TireSlipAngle", 2).map(|x| x * 57.29578),
                    arr("TireSlipAngle", 3).map(|x| x * 57.29578),
                    arr("TireSlipRatio", 0),
                    arr("TireSlipRatio", 1),
                    arr("TireSlipRatio", 2),
                    arr("TireSlipRatio", 3),
                    arr("TireTemp", 0),
                    arr("TireTemp", 1),
                    arr("TireTemp", 2),
                    arr("TireTemp", 3),
                    arr("SuspensionTravelMeters", 0),
                    arr("SuspensionTravelMeters", 1),
                    arr("SuspensionTravelMeters", 2),
                    arr("SuspensionTravelMeters", 3),
                    a("PowerWatts"),
                    a("TorqueNewtons"),
                    a("Boost"),
                    a("Fuel").unwrap_or(1.0),
                    serde_json::to_string(&p).map_err(|e| e.to_string())?
                ])
                .map_err(|e| e.to_string())?;
        }
        drop(insert);
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn get_session_metadata(&self, id: &str) -> Result<Value, String> {
        let c = self.conn()?;
        let raw: Option<String> = c
            .query_row(
                "SELECT metadata_json FROM sessions WHERE session_id=?",
                params![id],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        Ok(raw
            .and_then(|x| serde_json::from_str(&x).ok())
            .unwrap_or_else(|| Value::Object(Map::new())))
    }
    pub fn get_session_laps(&self, id: &str) -> Result<Vec<Value>, String> {
        let c = self.conn()?;
        let mut st = c.prepare("SELECT lap_number,lap_time,start_distance,end_distance,max_speed_kmh,avg_speed_kmh,lap_time_source,complete,observed_span FROM laps WHERE session_id=? ORDER BY lap_number ASC").map_err(|e| e.to_string())?;
        let rows = st.query_map(params![id], |r| Ok(serde_json::json!({
            "lap_number": r.get::<_, i64>(0)?, "lap_time": r.get::<_, Option<f64>>(1)?,
            "start_distance": r.get::<_, Option<f64>>(2)?, "end_distance": r.get::<_, Option<f64>>(3)?,
            "max_speed_kmh": r.get::<_, Option<f64>>(4)?, "avg_speed_kmh": r.get::<_, Option<f64>>(5)?,
            "lap_time_source": r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "sample-span-estimate".into()),
            "complete": r.get::<_, i64>(7)?, "observed_span": r.get::<_, Option<f64>>(8)?
        }))).map_err(|e| e.to_string())?;
        rows.map(|r| r.map_err(|e| e.to_string())).collect()
    }
    pub fn set_session_metadata(&self, id: &str, metadata: &Value) -> Result<(), String> {
        let c = self.conn()?;
        c.execute(
            "UPDATE sessions SET metadata_json=? WHERE session_id=?",
            params![
                serde_json::to_string(metadata).map_err(|e| e.to_string())?,
                id
            ],
        )
        .map_err(|e| e.to_string())
        .map(|_| ())
    }
    pub fn get_telemetry_points(&self, id: &str, lap: Option<i64>) -> Result<Vec<Value>, String> {
        let c = self.conn()?;
        let mut q="SELECT relative_time,lap_number,lap_distance,speed,rpm,gear,accel_pct,brake_pct,steer_pct,accel_x,accel_y,accel_z,pos_x,pos_y,pos_z,susp_fl,susp_fr,susp_rl,susp_rr,slip_angle_fl,slip_angle_fr,slip_angle_rl,slip_angle_rr,slip_ratio_fl,slip_ratio_fr,slip_ratio_rl,slip_ratio_rr,temp_fl,temp_fr,temp_rl,temp_rr,clutch_pct,handbrake_pct,susp_meters_fl,susp_meters_fr,susp_meters_rl,susp_meters_rr,power_watts,torque_newtons,boost,fuel,raw_json FROM telemetry_channels WHERE session_id=?".to_string();
        if lap.is_some() {
            q.push_str(" AND lap_number=?")
        }
        q.push_str(" ORDER BY id ASC");
        let mut st = c.prepare(&q).map_err(|e| e.to_string())?;
        let rows = if let Some(l) = lap {
            st.query_map(params![id, l], row_value)
                .map_err(|e| e.to_string())?
        } else {
            st.query_map(params![id], row_value)
                .map_err(|e| e.to_string())?
        };
        let mut out = Vec::new();
        for x in rows {
            out.push(x.map_err(|e| e.to_string())?)
        }
        Ok(out)
    }
    pub fn finalize_session(&self, id: &str, metadata: Value) -> Result<Value, String> {
        let points = self.get_telemetry_points(id, None)?;
        let mut distances = Vec::new();
        let mut complete = 0;
        let mut best = f64::INFINITY;
        #[derive(Default)]
        struct LapAgg {
            times: Vec<f64>,
            speeds: Vec<f64>,
            start_observed: bool,
            lap_time: Option<f64>,
        }
        let mut laps = std::collections::BTreeMap::<i64, LapAgg>::new();
        let mut previous_lap: Option<i64> = None;
        let mut pending_lap: Option<i64> = None;
        let mut previous_last: Option<f64> = None;
        for p in &points {
            let lap = i64v(p, "LapNumber", 0);
            if let Some(previous) = previous_lap {
                if lap < previous {
                    break;
                }
                if lap == previous + 1 {
                    pending_lap = Some(previous);
                } else if lap > previous + 1 {
                    pending_lap = None;
                }
            }
            if let Some(pending) = pending_lap {
                if let Some(last) = p.get("LastLap").and_then(Value::as_f64) {
                    if last > 0.0 && Some(last) != previous_last {
                        laps.entry(pending).or_default().lap_time = Some(last);
                        pending_lap = None;
                    }
                }
            }
            let last_value = p.get("LastLap").and_then(Value::as_f64);
            if last_value.is_some() {
                previous_last = last_value;
            }
            previous_lap = Some(lap);
            let entry = laps.entry(lap).or_default();
            if p.get("IsRaceOn") != Some(&Value::from(0)) {
                if let Some(current) = p.get("CurrentLap").and_then(Value::as_f64) {
                    if (0.0..=5.0).contains(&current) {
                        entry.start_observed = true;
                    }
                }
                if let Some(t) = p.get("TimestampMS").and_then(Value::as_f64) {
                    entry.times.push(t / 1000.0);
                } else if let Some(t) = p.get("time").and_then(Value::as_f64) {
                    entry.times.push(t);
                }
                if let Some(speed) = p.get("SpeedMetersPerSecond").and_then(Value::as_f64) {
                    entry.speeds.push(speed * 3.6);
                }
            }
            if let Some(d) = p.get("lap_distance").and_then(Value::as_f64) {
                distances.push(d)
            }
        }
        let mut lap_rows = Vec::new();
        for (lap_number, entry) in &laps {
            let observed_span = entry
                .times
                .iter()
                .copied()
                .reduce(f64::max)
                .zip(entry.times.iter().copied().reduce(f64::min))
                .map(|(max, min)| max - min);
            let is_complete = entry.start_observed && entry.lap_time.is_some();
            if is_complete {
                complete += 1;
                best = best.min(entry.lap_time.unwrap());
            }
            let max_speed = entry.speeds.iter().copied().reduce(f64::max);
            // road_analysis weights speed by positive exposure intervals. A
            // lone timestamped point therefore has no observed mean speed.
            let has_exposure = entry.times.windows(2).any(|window| window[1] > window[0]);
            let avg_speed = if entry.speeds.len() < 2 || !has_exposure {
                None
            } else {
                Some(entry.speeds.iter().sum::<f64>() / entry.speeds.len() as f64)
            };
            lap_rows.push((
                *lap_number,
                entry.lap_time,
                observed_span,
                max_speed,
                avg_speed,
                is_complete,
            ));
        }
        let total = if distances.is_empty() {
            0.0
        } else {
            distances.iter().copied().fold(f64::NEG_INFINITY, f64::max)
                - distances.iter().copied().fold(f64::INFINITY, f64::min)
        };
        let mut summary = metadata.as_object().cloned().unwrap_or_default();
        summary.insert("state".into(), Value::from("finalized"));
        summary.insert(
            "lapTimingVersion".into(),
            Value::from("road-observations/v1"),
        );
        summary.insert("completeLaps".into(), Value::from(complete));
        summary.insert("observedLaps".into(), Value::from(laps.len()));
        let summary_json =
            serde_json::to_string(&Value::Object(summary)).map_err(|e| e.to_string())?;
        let mut c = self.conn()?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let mut insert = tx
            .prepare("INSERT OR REPLACE INTO laps(session_id,lap_number,lap_time,start_distance,end_distance,max_speed_kmh,avg_speed_kmh,lap_time_source,complete,observed_span) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .map_err(|e| e.to_string())?;
        for (lap_number, lap_time, observed_span, max_speed, avg_speed, is_complete) in lap_rows {
            insert
                .execute(params![
                    id,
                    lap_number,
                    lap_time,
                    None::<f64>,
                    None::<f64>,
                    max_speed,
                    avg_speed,
                    if lap_time.is_some() {
                        "game-lastlap"
                    } else {
                        "unavailable"
                    },
                    if is_complete { 1 } else { 0 },
                    observed_span
                ])
                .map_err(|e| e.to_string())?;
        }
        drop(insert);
        tx.execute(
            "UPDATE sessions SET metadata_json=? WHERE session_id=?",
            params![summary_json, id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE sessions SET total_laps=?,best_lap_time=?,total_distance=? WHERE session_id=?",
            params![
                complete,
                if best.is_finite() { best } else { 0.0 },
                total,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(
            serde_json::json!({"session_id":id,"total_laps":complete,"best_lap_time":if best.is_finite(){best}else{0.0},"total_distance":total}),
        )
    }
    pub fn list_all_sessions(&self) -> Result<Vec<Value>, String> {
        let c = self.conn()?;
        let mut st=c.prepare("SELECT session_id,car_ordinal,car_name,car_class,car_pi,start_time,total_laps,best_lap_time,total_distance FROM sessions ORDER BY start_time DESC").map_err(|e|e.to_string())?;
        let rows=st.query_map([],|r|Ok(serde_json::json!({"session_id":r.get::<_,String>(0)?,"car_ordinal":r.get::<_,i64>(1)?,"car_name":r.get::<_,String>(2)?,"car_class":r.get::<_,i64>(3)?,"car_pi":r.get::<_,i64>(4)?,"start_time":r.get::<_,f64>(5)?,"total_laps":r.get::<_,i64>(6)?,"best_lap_time":r.get::<_,f64>(7)?,"total_distance":r.get::<_,f64>(8)?}))).map_err(|e|e.to_string())?;
        rows.map(|x| x.map_err(|e| e.to_string())).collect()
    }
    pub fn delete_session(&self, id: &str) -> Result<bool, String> {
        let c = self.conn()?;
        Ok(
            c.execute("DELETE FROM sessions WHERE session_id=?", params![id])
                .map_err(|e| e.to_string())?
                > 0,
        )
    }
}
fn row_value(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let raw: Option<String> = r.get(41)?;
    if let Some(s) = raw {
        if let Ok(v) = serde_json::from_str(&s) {
            return Ok(v);
        }
    }
    let mut m = Map::new();
    m.insert("sourceSchema".into(), Value::from(LEGACY_POINT_SCHEMA));
    m.insert("time".into(), Value::from(r.get::<_, f64>(0)?));
    m.insert("LapNumber".into(), Value::from(r.get::<_, i64>(1)?));
    m.insert("lap_distance".into(), rf(r, 2)?);
    m.insert("SpeedMetersPerSecond".into(), rfo(r, 3, |x| x / 3.6)?);
    m.insert("CurrentEngineRpm".into(), rf(r, 4)?);
    m.insert("Gear".into(), ri(r, 5)?);
    m.insert("accel_pct".into(), rf(r, 6)?);
    m.insert("brake_pct".into(), rf(r, 7)?);
    m.insert("steer_pct".into(), rf(r, 8)?);
    let accel_pct = r.get::<_, Option<f64>>(6)?.unwrap_or(0.0);
    let brake_pct = r.get::<_, Option<f64>>(7)?.unwrap_or(0.0);
    let clutch_pct = r.get::<_, Option<f64>>(31)?.unwrap_or(0.0);
    let handbrake_pct = r.get::<_, Option<f64>>(32)?.unwrap_or(0.0);
    m.insert(
        "AccelInput".into(),
        Value::from(((accel_pct / 100.0) * 255.0) as i64),
    );
    m.insert(
        "BrakeInput".into(),
        Value::from(((brake_pct / 100.0) * 255.0) as i64),
    );
    m.insert(
        "ClutchInput".into(),
        Value::from(((clutch_pct / 100.0) * 255.0) as i64),
    );
    m.insert(
        "HandBrakeInput".into(),
        Value::from(((handbrake_pct / 100.0) * 255.0) as i64),
    );
    m.insert("clutch_pct".into(), Value::from(clutch_pct));
    m.insert("handbrake_pct".into(), Value::from(handbrake_pct));
    m.insert("AccelerationX".into(), rfo(r, 9, |x| x * 9.81)?);
    m.insert("AccelerationY".into(), rfo(r, 10, |x| x * 9.81)?);
    m.insert("AccelerationZ".into(), rfo(r, 11, |x| x * 9.81)?);
    for (k, idx) in [("PositionX", 12), ("PositionY", 13), ("PositionZ", 14)] {
        m.insert(k.into(), rf(r, idx)?);
    }
    for (k, start) in [
        ("SuspTravel", 15),
        ("TireSlipAngle", 19),
        ("TireSlipRatio", 23),
        ("TireTemp", 27),
        ("SuspensionTravelMeters", 33),
    ] {
        let a: Vec<Value> = (0..4)
            .map(|i| {
                let value = rf(r, start + i).unwrap_or(Value::Null);
                if k == "TireSlipAngle" {
                    value
                        .as_f64()
                        .map(|x| Value::from(x / 57.29578))
                        .unwrap_or(Value::Null)
                } else {
                    value
                }
            })
            .collect();
        m.insert(k.into(), Value::Array(a));
    }
    m.insert("PowerWatts".into(), rf(r, 37)?);
    m.insert("Power".into(), rf(r, 37)?);
    m.insert("TorqueNewtons".into(), rf(r, 38)?);
    m.insert("Torque".into(), rf(r, 38)?);
    m.insert("Boost".into(), rf(r, 39)?);
    m.insert(
        "Fuel".into(),
        rfo(r, 40, |x| x).map(|v| if v.is_null() { Value::from(1.0) } else { v })?,
    );
    Ok(Value::Object(m))
}
fn rf(r: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Value> {
    Ok(r.get::<_, Option<f64>>(index)?
        .map(Value::from)
        .unwrap_or(Value::Null))
}
fn ri(r: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Value> {
    Ok(r.get::<_, Option<i64>>(index)?
        .map(Value::from)
        .unwrap_or(Value::Null))
}
fn rfo<F: FnOnce(f64) -> f64>(
    r: &rusqlite::Row<'_>,
    index: usize,
    f: F,
) -> rusqlite::Result<Value> {
    Ok(r.get::<_, Option<f64>>(index)?
        .map(f)
        .map(Value::from)
        .unwrap_or(Value::Null))
}
fn i64v(v: &Value, k: &str, d: i64) -> i64 {
    v.get(k)
        .and_then(Value::as_i64)
        .or_else(|| v.get(k).and_then(Value::as_f64).map(|x| x as i64))
        .unwrap_or(d)
}
