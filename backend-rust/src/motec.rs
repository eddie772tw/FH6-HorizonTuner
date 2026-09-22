use crate::{
    diagnostics::round,
    error::{ApiError, ApiResult},
};
use serde_json::{json, Value};

pub const WORKSPACE: &str = include_str!("../resources/motec-workspace.xml");
const LAT: f64 = 19.432608;
const LON: f64 = -99.133209;
const LAT_SCALE: f64 = 111139.0;
const LON_SCALE: f64 = 104800.0;
fn number(value: &Value) -> Option<f64> {
    value.as_f64().filter(|n| n.is_finite())
}
fn values(point: &Value, key: &str) -> [Option<f64>; 4] {
    std::array::from_fn(|i| point[key].get(i).and_then(number))
}
pub fn debrief(points: &[Value]) -> Value {
    let mut temps: [Vec<f64>; 4] = std::array::from_fn(|_| Vec::new());
    let mut travel = Vec::new();
    let (mut bottom, mut under, mut over, mut corner) = (0, 0, 0, 0);
    for p in points {
        for (i, temp) in values(p, "TireTemp").into_iter().enumerate() {
            if let Some(temp) = temp {
                temps[i].push((temp - 32.0) * 5.0 / 9.0);
            }
        }
        for value in values(p, "SuspTravel").into_iter().flatten() {
            travel.push(value);
            if value >= 0.95 {
                bottom += 1;
            }
        }
        if number(&p["AccelerationX"]).is_some_and(|n| n.abs() >= 2.94)
            && number(&p["SpeedMetersPerSecond"]).is_some_and(|n| n >= 10.0)
        {
            let angles = values(p, "TireSlipAngle");
            let front: Vec<f64> = angles[..2].iter().flatten().map(|n| n.abs()).collect();
            let rear: Vec<f64> = angles[2..].iter().flatten().map(|n| n.abs()).collect();
            if !front.is_empty() && !rear.is_empty() {
                corner += 1;
                let f = front.iter().sum::<f64>() / front.len() as f64;
                let r = rear.iter().sum::<f64>() / rear.len() as f64;
                if f > r * 1.15 {
                    under += 1;
                } else if r > f * 1.15 {
                    over += 1;
                }
            }
        }
    }
    let averages: [Option<f64>; 4] = std::array::from_fn(|i| {
        (!temps[i].is_empty())
            .then(|| round(temps[i].iter().sum::<f64>() / temps[i].len() as f64, 1))
    });
    let peak_temp = averages.iter().flatten().copied().reduce(f64::max);
    let thermal = match peak_temp {
        None => "no_data",
        Some(t) if t > 105.0 => "Overheating",
        Some(t) if t < 65.0 => "Cold",
        _ => "Optimal",
    };
    let suspension = if travel.is_empty() {
        "no_data"
    } else if bottom > 10 {
        "Severe Bottoming"
    } else if bottom > 0 {
        "Occasional Bottoming"
    } else {
        "Optimal"
    };
    let up = (corner > 0).then(|| under as f64 / corner as f64 * 100.0);
    let op = (corner > 0).then(|| over as f64 / corner as f64 * 100.0);
    let tendency = if up.is_some_and(|v| v >= 58.0) {
        "Understeer Biased"
    } else if op.is_some_and(|v| v >= 58.0) {
        "Oversteer Biased"
    } else if corner > 0 {
        "Neutral / Balanced"
    } else {
        "no_data"
    };
    let valid_laps = crate::road::summarize_laps(points)
        .iter()
        .filter(|lap| lap["complete"] == true)
        .count();
    json!({"total_samples":points.len(),"valid_laps":valid_laps,"tire_thermals":{"fl_avg":averages[0],"fr_avg":averages[1],"rl_avg":averages[2],"rr_avg":averages[3],"status":thermal},"suspension":{"peak_travel_pct":travel.iter().copied().reduce(f64::max).map(|n|round(n*100.0,1)),"bottom_out_count":(!travel.is_empty()).then_some(bottom),"status":suspension},"handling_balance":{"understeer_pct":up.map(|v|round(v,1)),"oversteer_pct":op.map(|v|round(v,1)),"tendency":tendency}})
}
fn fmt(value: Option<&Value>, scale: f64, offset: f64, digits: usize) -> String {
    value
        .and_then(number)
        .map(|v| format!("{:.*}", digits, v * scale + offset))
        .unwrap_or_default()
}
pub fn export(metadata: &Value, points: &[Value]) -> ApiResult<Vec<u8>> {
    let mut writer = csv::WriterBuilder::new()
        .flexible(true)
        .terminator(csv::Terminator::CRLF)
        .from_writer(Vec::new());
    let id = metadata["session_id"].as_str().unwrap_or("session");
    let car = metadata["car_name"].as_str().unwrap_or("Unknown Vehicle");
    let mut record = |row: Vec<String>| {
        writer
            .write_record(row)
            .map_err(|e| ApiError::new(500, e.to_string()))
    };
    for row in [
        vec!["Format", "MoTeC CSV Log File", "Version", "1.00"],
        vec![
            "Device",
            "FH6 Horizon Tuner Telemetry",
            "Serial",
            "FH6-HORIZON-TUNER",
        ],
        vec!["Date", id, "Time", "00:00:00"],
        vec!["Driver", "Driver", "Vehicle", car],
    ] {
        record(row.into_iter().map(str::to_owned).collect())?;
    }
    record(vec![
        "Venue".into(),
        "Forza Circuit".into(),
        "Comment".into(),
        format!("Exported Telemetry Session {id} - Full 41 Channels"),
    ])?;
    let mut intervals: Vec<f64> = points
        .windows(2)
        .filter_map(|p| {
            let a = number(&p[0]["time"])?;
            let b = number(&p[1]["time"])?;
            (b > a).then_some(b - a)
        })
        .collect();
    intervals.sort_by(f64::total_cmp);
    let sample_rate = if intervals.is_empty() {
        "unknown".into()
    } else {
        let mid = intervals.len() / 2;
        let median = if intervals.len() % 2 == 0 {
            (intervals[mid - 1] + intervals[mid]) / 2.0
        } else {
            intervals[mid]
        };
        format!("{:.3}", 1.0 / median)
    };
    record(vec!["Sample Rate".into(), sample_rate])?;
    drop(record);
    let mut bytes = writer
        .into_inner()
        .map_err(|e| ApiError::new(500, e.to_string()))?;
    bytes.extend_from_slice(b"\r\n");
    let mut writer = csv::WriterBuilder::new()
        .flexible(true)
        .terminator(csv::Terminator::CRLF)
        .from_writer(bytes);
    let mut record = |row: Vec<String>| {
        writer
            .write_record(row)
            .map_err(|e| ApiError::new(500, e.to_string()))
    };
    let columns: Value =
        serde_json::from_str(include_str!("../resources/motec-columns.json")).unwrap();
    for key in ["headers", "units"] {
        record(
            columns[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().into())
                .collect(),
        )?;
    }
    for p in points {
        let mut row = Vec::new();
        for (key, scale, digits) in [
            ("time", 1.0, 3),
            ("lap_distance", 1.0, 3),
            ("LapNumber", 1.0, 0),
            ("SpeedMetersPerSecond", 3.6, 3),
            ("CurrentEngineRpm", 1.0, 0),
            ("Gear", 1.0, 0),
            ("AccelInput", 100.0 / 255.0, 3),
            ("BrakeInput", 100.0 / 255.0, 3),
            ("ClutchInput", 100.0 / 255.0, 3),
            ("HandBrakeInput", 100.0 / 255.0, 3),
        ] {
            row.push(fmt(p.get(key), scale, 0.0, digits));
        }
        row.push(if !p["steer_pct"].is_null() {
            fmt(p.get("steer_pct"), 1.0, 0.0, 3)
        } else {
            fmt(p.get("SteerInput"), 100.0 / 127.0, 0.0, 3)
        });
        for (key, scale) in [
            ("AccelerationX", 1.0 / 9.81),
            ("AccelerationZ", 1.0 / 9.81),
            ("AccelerationY", 1.0 / 9.81),
            ("Boost", 1.0),
            ("Fuel", 100.0),
        ] {
            row.push(fmt(p.get(key), scale, 0.0, 3));
        }
        row.push(fmt(
            p.get("PowerWatts").or_else(|| p.get("Power")),
            1.0 / 745.7,
            0.0,
            3,
        ));
        row.push(fmt(
            p.get("TorqueNewtons").or_else(|| p.get("Torque")),
            1.0,
            0.0,
            3,
        ));
        for (key, scale, offset) in [
            ("SuspTravel", 100.0, 0.0),
            ("SuspensionTravelMeters", 1.0, 0.0),
            ("TireSlipAngle", 1.0, 0.0),
            ("TireSlipRatio", 1.0, 0.0),
            ("TireTemp", 5.0 / 9.0, -32.0 * 5.0 / 9.0),
        ] {
            for i in 0..4 {
                row.push(fmt(p[key].get(i), scale, offset, 3));
            }
        }
        row.push(fmt(p.get("PositionZ"), 1.0 / LAT_SCALE, LAT, 7));
        row.push(fmt(p.get("PositionX"), 1.0 / LON_SCALE, LON, 7));
        row.push(fmt(p.get("PositionY"), 1.0, 0.0, 3));
        record(row)?;
    }
    drop(record);
    writer
        .into_inner()
        .map_err(|e| ApiError::new(500, e.to_string()))
}
pub fn import(bytes: &[u8]) -> ApiResult<(Value, Vec<Value>)> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(bytes);
    let mut metadata = json!({"session_id":"Unknown","car_name":"Unknown Vehicle","timestamp":0});
    let mut points = Vec::new();
    let mut headers = false;
    let mut units = false;
    let mut normalized = false;
    for row in reader.records() {
        let row = row.map_err(|e| ApiError::invalid(e.to_string()))?;
        if !headers {
            if row.get(0) == Some("Time") {
                headers = true;
                normalized = row.iter().any(|h| h == "Normalized Slip Angle FL");
                continue;
            }
            if row.len() >= 4 {
                if row.get(0) == Some("Date") {
                    metadata["session_id"] = json!(row.get(1));
                } else if row.get(0) == Some("Driver") && row.get(2) == Some("Vehicle") {
                    metadata["car_name"] = json!(row.get(3));
                }
            }
            continue;
        }
        if !units {
            units = true;
            continue;
        }
        if row.len() < 27 {
            continue;
        }
        let get = |i: usize, scale: f64, offset: f64| -> Value {
            row.get(i)
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|n| n.is_finite())
                .map(|n| json!(n * scale + offset))
                .unwrap_or(Value::Null)
        };
        let mut p = json!({});
        if normalized {
            for (key, index, scale) in [
                ("time", 0, 1.0),
                ("lap_distance", 1, 1.0),
                ("LapNumber", 2, 1.0),
                ("SpeedMetersPerSecond", 3, 1.0 / 3.6),
                ("CurrentEngineRpm", 4, 1.0),
                ("Gear", 5, 1.0),
                ("AccelInput", 6, 2.55),
                ("BrakeInput", 7, 2.55),
                ("ClutchInput", 8, 2.55),
                ("HandBrakeInput", 9, 2.55),
                ("steer_pct", 10, 1.0),
                ("AccelerationX", 11, 9.81),
                ("AccelerationZ", 12, 9.81),
                ("AccelerationY", 13, 9.81),
                ("Boost", 14, 1.0),
                ("Fuel", 15, 0.01),
                ("PowerWatts", 16, 745.7),
                ("TorqueNewtons", 17, 1.0),
            ] {
                p[key] = get(index, scale, 0.0);
            }
            for (key, start, scale, offset) in [
                ("SuspTravel", 18, 0.01, 0.0),
                ("SuspensionTravelMeters", 22, 1.0, 0.0),
                ("TireSlipAngle", 26, 1.0, 0.0),
                ("TireSlipRatio", 30, 1.0, 0.0),
                ("TireTemp", 34, 1.8, 32.0),
            ] {
                p[key] = json!((start..start + 4)
                    .map(|i| get(i, scale, offset))
                    .collect::<Vec<_>>());
            }
            p["sourceSchema"] = json!("motec-csv/normalized-v1");
            p["Power"] = p["PowerWatts"].clone();
            p["Torque"] = p["TorqueNewtons"].clone();
            p["PositionY"] = get(40, 1.0, 0.0);
            p["PositionX"] = get(39, LON_SCALE, -LON * LON_SCALE);
            p["PositionZ"] = get(38, LAT_SCALE, -LAT * LAT_SCALE);
        } else {
            let long = row.len() > 30;
            let f = |i: usize| number(&get(i, 1.0, 0.0)).unwrap_or(0.0);
            for (key, index, scale) in [
                ("time", 0, 1.0),
                ("lap_distance", 1, 1.0),
                ("SpeedMetersPerSecond", 3, 1.0 / 3.6),
                ("steer_pct", if long { 10 } else { 8 }, 1.0),
                ("AccelerationX", if long { 11 } else { 9 }, 9.81),
                ("AccelerationZ", if long { 12 } else { 10 }, 9.81),
            ] {
                p[key] = json!(f(index) * scale);
            }
            for (key, index) in [("LapNumber", 2), ("CurrentEngineRpm", 4), ("Gear", 5)] {
                p[key] = json!(if key == "LapNumber" {
                    number(&get(index, 1.0, 0.0)).unwrap_or(1.0) as i64
                } else {
                    f(index) as i64
                });
            }
            p["AccelInput"] = json!((f(6) * 2.55) as i64);
            p["BrakeInput"] = json!((f(7) * 2.55) as i64);
            for (key, start, scale, offset) in [
                ("SuspTravel", if long { 18 } else { 11 }, 0.01, 0.0),
                (
                    "TireSlipAngle",
                    if long { 26 } else { 15 },
                    1.0 / 57.29578,
                    0.0,
                ),
                ("TireSlipRatio", if long { 30 } else { 19 }, 1.0, 0.0),
                ("TireTemp", if long { 34 } else { 23 }, 1.8, 32.0),
            ] {
                p[key] = json!((start..start + 4)
                    .map(|i| f(i) * scale + offset)
                    .collect::<Vec<_>>());
            }
            for (key, index, scale) in [
                ("clutch_pct", 8, 1.0),
                ("handbrake_pct", 9, 1.0),
                ("AccelerationY", 13, 9.81),
                ("Boost", 14, 6894.75729),
                ("PowerWatts", 16, 745.7),
                ("Power", 16, 745.7),
                ("TorqueNewtons", 17, 1.0),
                ("Torque", 17, 1.0),
            ] {
                p[key] = json!(if long { f(index) * scale } else { 0.0 });
            }
            p["Fuel"] = json!(if long { f(15) / 100.0 } else { 1.0 });
            p["ClutchInput"] = json!(if long { (f(8) * 2.55) as i64 } else { 0 });
            p["HandBrakeInput"] = json!(if long { (f(9) * 2.55) as i64 } else { 0 });
            p["SuspensionTravelMeters"] = json!((22..26)
                .map(|i| if long { f(i) } else { 0.0 })
                .collect::<Vec<_>>());
        }
        points.push(p);
    }
    Ok((metadata, points))
}
