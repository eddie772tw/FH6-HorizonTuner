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
            .map_err(|e| ApiError::internal("MoTeC CSV export", e))
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
        .map_err(|e| ApiError::internal("MoTeC CSV export", e))?;
    bytes.extend_from_slice(b"\r\n");
    let mut writer = csv::WriterBuilder::new()
        .flexible(true)
        .terminator(csv::Terminator::CRLF)
        .from_writer(bytes);
    let mut record = |row: Vec<String>| {
        writer
            .write_record(row)
            .map_err(|e| ApiError::internal("MoTeC CSV export", e))
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
        .map_err(|e| ApiError::internal("MoTeC CSV export", e))
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

#[derive(Debug, Clone, PartialEq)]
pub struct ResampledPoint {
    pub channels: [f64; 41],
}

impl ResampledPoint {
    pub fn time(&self) -> f64 {
        self.channels[0]
    }
}

pub struct ChannelDef {
    pub name: &'static str,
    pub short_name: &'static str,
    pub unit: &'static str,
}

pub const MOTEC_CHANNELS: [ChannelDef; 41] = [
    ChannelDef {
        name: "Time",
        short_name: "Time",
        unit: "s",
    },
    ChannelDef {
        name: "Distance",
        short_name: "Dist",
        unit: "m",
    },
    ChannelDef {
        name: "Lap Number",
        short_name: "Lap",
        unit: "",
    },
    ChannelDef {
        name: "Ground Speed",
        short_name: "Speed",
        unit: "km/h",
    },
    ChannelDef {
        name: "Engine RPM",
        short_name: "RPM",
        unit: "rpm",
    },
    ChannelDef {
        name: "Gear",
        short_name: "Gear",
        unit: "",
    },
    ChannelDef {
        name: "Throttle Pos",
        short_name: "Thr",
        unit: "%",
    },
    ChannelDef {
        name: "Brake Pos",
        short_name: "Brake",
        unit: "%",
    },
    ChannelDef {
        name: "Clutch Pos",
        short_name: "Clutch",
        unit: "%",
    },
    ChannelDef {
        name: "Handbrake Pos",
        short_name: "HBrake",
        unit: "%",
    },
    ChannelDef {
        name: "Steered Angle",
        short_name: "Steer",
        unit: "%",
    },
    ChannelDef {
        name: "G Force Lat",
        short_name: "GLat",
        unit: "G",
    },
    ChannelDef {
        name: "G Force Long",
        short_name: "GLong",
        unit: "G",
    },
    ChannelDef {
        name: "G Force Vert",
        short_name: "GVert",
        unit: "G",
    },
    ChannelDef {
        name: "Boost Pressure",
        short_name: "Boost",
        unit: "psi",
    },
    ChannelDef {
        name: "Fuel Level",
        short_name: "Fuel",
        unit: "%",
    },
    ChannelDef {
        name: "Engine Power",
        short_name: "Power",
        unit: "hp",
    },
    ChannelDef {
        name: "Engine Torque",
        short_name: "Torque",
        unit: "Nm",
    },
    ChannelDef {
        name: "Susp Pos FL",
        short_name: "SusPosFL",
        unit: "%",
    },
    ChannelDef {
        name: "Susp Pos FR",
        short_name: "SusPosFR",
        unit: "%",
    },
    ChannelDef {
        name: "Susp Pos RL",
        short_name: "SusPosRL",
        unit: "%",
    },
    ChannelDef {
        name: "Susp Pos RR",
        short_name: "SusPosRR",
        unit: "%",
    },
    ChannelDef {
        name: "Susp Travel FL",
        short_name: "SusTrvFL",
        unit: "m",
    },
    ChannelDef {
        name: "Susp Travel FR",
        short_name: "SusTrvFR",
        unit: "m",
    },
    ChannelDef {
        name: "Susp Travel RL",
        short_name: "SusTrvRL",
        unit: "m",
    },
    ChannelDef {
        name: "Susp Travel RR",
        short_name: "SusTrvRR",
        unit: "m",
    },
    ChannelDef {
        name: "Normalized Slip Angle FL",
        short_name: "SlipA_FL",
        unit: "normalized",
    },
    ChannelDef {
        name: "Normalized Slip Angle FR",
        short_name: "SlipA_FR",
        unit: "normalized",
    },
    ChannelDef {
        name: "Normalized Slip Angle RL",
        short_name: "SlipA_RL",
        unit: "normalized",
    },
    ChannelDef {
        name: "Normalized Slip Angle RR",
        short_name: "SlipA_RR",
        unit: "normalized",
    },
    ChannelDef {
        name: "Slip Ratio FL",
        short_name: "SlipR_FL",
        unit: "",
    },
    ChannelDef {
        name: "Slip Ratio FR",
        short_name: "SlipR_FR",
        unit: "",
    },
    ChannelDef {
        name: "Slip Ratio RL",
        short_name: "SlipR_RL",
        unit: "",
    },
    ChannelDef {
        name: "Slip Ratio RR",
        short_name: "SlipR_RR",
        unit: "",
    },
    ChannelDef {
        name: "Tire Temp FL",
        short_name: "TTempFL",
        unit: "°C",
    },
    ChannelDef {
        name: "Tire Temp FR",
        short_name: "TTempFR",
        unit: "°C",
    },
    ChannelDef {
        name: "Tire Temp RL",
        short_name: "TTempRL",
        unit: "°C",
    },
    ChannelDef {
        name: "Tire Temp RR",
        short_name: "TTempRR",
        unit: "°C",
    },
    ChannelDef {
        name: "GPS Latitude",
        short_name: "GPS_Lat",
        unit: "deg",
    },
    ChannelDef {
        name: "GPS Longitude",
        short_name: "GPS_Lon",
        unit: "deg",
    },
    ChannelDef {
        name: "GPS Altitude",
        short_name: "GPS_Alt",
        unit: "m",
    },
];

pub fn extract_point_channels(p: &Value) -> [f64; 41] {
    let mut ch = [0.0; 41];
    ch[0] = number(&p["time"]).unwrap_or(0.0);
    ch[1] = number(&p["lap_distance"]).unwrap_or(0.0);
    ch[2] = number(&p["LapNumber"]).unwrap_or(1.0);
    ch[3] = number(&p["SpeedMetersPerSecond"]).unwrap_or(0.0) * 3.6;
    ch[4] = number(&p["CurrentEngineRpm"]).unwrap_or(0.0);
    ch[5] = number(&p["Gear"]).unwrap_or(0.0);
    ch[6] = number(&p["AccelInput"]).unwrap_or(0.0) * (100.0 / 255.0);
    ch[7] = number(&p["BrakeInput"]).unwrap_or(0.0) * (100.0 / 255.0);
    ch[8] = number(&p["ClutchInput"]).unwrap_or(0.0) * (100.0 / 255.0);
    ch[9] = number(&p["HandBrakeInput"]).unwrap_or(0.0) * (100.0 / 255.0);
    ch[10] = if !p["steer_pct"].is_null() {
        number(&p["steer_pct"]).unwrap_or(0.0)
    } else {
        number(&p["SteerInput"]).unwrap_or(0.0) * (100.0 / 127.0)
    };
    ch[11] = number(&p["AccelerationX"]).unwrap_or(0.0) / 9.81;
    ch[12] = number(&p["AccelerationZ"]).unwrap_or(0.0) / 9.81;
    ch[13] = number(&p["AccelerationY"]).unwrap_or(0.0) / 9.81;
    ch[14] = number(&p["Boost"]).unwrap_or(0.0);
    ch[15] = number(&p["Fuel"]).unwrap_or(0.0) * 100.0;
    ch[16] = number(&p["PowerWatts"])
        .or_else(|| number(&p["Power"]))
        .unwrap_or(0.0)
        / 745.7;
    ch[17] = number(&p["TorqueNewtons"])
        .or_else(|| number(&p["Torque"]))
        .unwrap_or(0.0);
    for i in 0..4 {
        ch[18 + i] = p["SuspTravel"].get(i).and_then(number).unwrap_or(0.0) * 100.0;
        ch[22 + i] = p["SuspensionTravelMeters"]
            .get(i)
            .and_then(number)
            .unwrap_or(0.0);
        ch[26 + i] = p["TireSlipAngle"].get(i).and_then(number).unwrap_or(0.0);
        ch[30 + i] = p["TireSlipRatio"].get(i).and_then(number).unwrap_or(0.0);
        ch[34 + i] = p["TireTemp"]
            .get(i)
            .and_then(number)
            .map(|t| (t - 32.0) * 5.0 / 9.0)
            .unwrap_or(0.0);
    }
    ch[38] = number(&p["PositionZ"]).unwrap_or(0.0) / LAT_SCALE + LAT;
    ch[39] = number(&p["PositionX"]).unwrap_or(0.0) / LON_SCALE + LON;
    ch[40] = number(&p["PositionY"]).unwrap_or(0.0);
    ch
}

pub fn resample_to_grid(points: &[Value], freq: f64) -> Vec<ResampledPoint> {
    if points.is_empty() {
        return Vec::new();
    }
    let raw: Vec<[f64; 41]> = points.iter().map(extract_point_channels).collect();
    if raw.len() == 1 {
        return vec![ResampledPoint { channels: raw[0] }];
    }

    let t_start = raw[0][0];
    let t_end = raw[raw.len() - 1][0];
    if t_end <= t_start || freq <= 0.0 {
        return vec![ResampledPoint { channels: raw[0] }];
    }

    let dt = 1.0 / freq;
    let total_steps = ((t_end - t_start) * freq).round() as usize;
    let mut out = Vec::with_capacity(total_steps + 1);

    let mut idx = 0;
    for k in 0..=total_steps {
        let t_target = t_start + k as f64 * dt;
        while idx + 1 < raw.len() && raw[idx + 1][0] < t_target {
            idx += 1;
        }

        if idx + 1 >= raw.len() {
            let mut ch = raw[raw.len() - 1];
            ch[0] = t_target;
            out.push(ResampledPoint { channels: ch });
            continue;
        }

        let t0 = raw[idx][0];
        let t1 = raw[idx + 1][0];
        let mut ch = [0.0; 41];
        ch[0] = t_target;

        if t1 <= t0 {
            for c in 1..41 {
                ch[c] = raw[idx][c];
            }
        } else {
            let alpha = ((t_target - t0) / (t1 - t0)).clamp(0.0, 1.0);
            for c in 1..41 {
                if c == 2 || c == 5 {
                    ch[c] = if alpha < 0.5 {
                        raw[idx][c]
                    } else {
                        raw[idx + 1][c]
                    };
                } else {
                    ch[c] = (1.0 - alpha) * raw[idx][c] + alpha * raw[idx + 1][c];
                }
            }
        }
        out.push(ResampledPoint { channels: ch });
    }

    out
}

const HEADER_TEMPLATE_SIZE: usize = 13384;
const CHANNEL_META_SIZE: usize = 124;
const CHANNEL_COUNT: usize = 41;
const DATA_BASE: usize = HEADER_TEMPLATE_SIZE + CHANNEL_COUNT * CHANNEL_META_SIZE;

const TEMPLATE_RUNS: &[(usize, &str)] = &[
    (0, "40"),
    (8, "48340000105a"),
    (36, "e206"),
    (66, "40420f00e72e000041444c"),
    (82, "a40180004e0000006400010032332f31312f32303035"),
    (126, "30393a35333a3030"),
    (221, "20313141"),
    (285, "20"),
    (349, "2043616c646572"),
    (413, "20"),
    (1502, "2208d200000032"),
    (1572, "7365636f6e64207761726d7570"),
    (1635, "20"),
    (1644, "63"),
    (1762, "6932206461746120646179"),
    (1826, "32"),
    (
        1890,
        "43616c646572205061726b2c2032332f31312f30352c2066696e652073756e6e7920646179",
    ),
    (2914, "36130000482c"),
    (4918, "43616c646572"),
    (6016, "541f"),
    (8020, "313141"),
    (8084, "446179746f6e61"),
    (8216, "436172"),
    (8282, "0a0ac6077c0646057404e803"),
    (8304, "d007"),
];

fn encode_padded_bytes(s: &str, len: usize) -> Vec<u8> {
    let mut b = vec![0u8; len];
    let bytes = s.as_bytes();
    let n = bytes.len().min(len);
    b[..n].copy_from_slice(&bytes[..n]);
    b
}

pub fn format_beacon_time(seconds: f64) -> String {
    let micros = seconds * 1_000_000.0;
    if micros == 0.0 {
        return "0.00000000000000000E+00".to_string();
    }
    let s = format!("{:.17e}", micros);
    if let Some((mantissa, exp)) = s.split_once('e') {
        let exp_num: i32 = exp.parse().unwrap_or(0);
        let sign = if exp_num >= 0 { '+' } else { '-' };
        format!("{}E{}{:02}", mantissa, sign, exp_num.abs())
    } else {
        s
    }
}

pub fn format_lap_duration(seconds: f64) -> String {
    let total_ms = (seconds * 1000.0).round() as u64;
    let minutes = total_ms / 60000;
    let secs = (total_ms % 60000) / 1000;
    let ms = total_ms % 1000;
    format!("{minutes}:{secs:02}.{ms:03}")
}

pub fn generate_ldx_xml(laps: &[Value], points: &[Value]) -> String {
    let mut beacon_times: Vec<f64> = Vec::new();

    if !laps.is_empty() {
        let mut cum_time = 0.0;
        beacon_times.push(0.0);
        for lap in laps {
            if let Some(dur) = lap.get("lap_time").and_then(Value::as_f64) {
                if dur > 0.0 {
                    cum_time += dur;
                    beacon_times.push(cum_time);
                }
            }
        }
    } else {
        let mut current_lap = -1i64;
        let mut start_time = 0.0;
        let mut has_start = false;
        for p in points {
            let lap = p.get("LapNumber").and_then(Value::as_i64).unwrap_or(1);
            let t = p.get("time").and_then(Value::as_f64).unwrap_or(0.0);
            if !has_start {
                start_time = t;
                has_start = true;
            }
            if current_lap == -1 || lap > current_lap {
                current_lap = lap;
                beacon_times.push((t - start_time).max(0.0));
            }
        }
        if beacon_times.is_empty() {
            beacon_times.push(0.0);
        }
    }

    let total_laps = if !laps.is_empty() {
        laps.len()
    } else {
        beacon_times.len().saturating_sub(1).max(1)
    };

    let mut fastest_time = 0.0;
    let mut fastest_lap = 1usize;
    for (i, lap) in laps.iter().enumerate() {
        if let Some(t) = lap.get("lap_time").and_then(Value::as_f64) {
            if t > 0.0 && (fastest_time == 0.0 || t < fastest_time) {
                fastest_time = t;
                fastest_lap = lap
                    .get("lap_number")
                    .and_then(Value::as_u64)
                    .map(|n| n as usize)
                    .unwrap_or(i + 1);
            }
        }
    }

    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\"?>\r\n");
    xml.push_str(
        "<LDXFile Locale=\"English_Canada.1252\" DefaultLocale=\"C\" Version=\"1.6\">\r\n",
    );
    xml.push_str(" <Layers>\r\n");
    xml.push_str("  <Layer>\r\n");
    xml.push_str("   <MarkerBlock>\r\n");
    xml.push_str("    <MarkerGroup Name=\"Beacons\" Index=\"3\">\r\n");
    for (i, t) in beacon_times.iter().enumerate() {
        let name = i + 1;
        let btime = format_beacon_time(*t);
        xml.push_str(&format!(
            "     <Marker Version=\"100\" ClassName=\"BCN\" Name=\"{name}\" Flags=\"77\" Time=\"{btime}\"/>\r\n"
        ));
    }
    xml.push_str("    </MarkerGroup>\r\n");
    xml.push_str("   </MarkerBlock>\r\n");
    xml.push_str("   <RangeBlock/>\r\n");
    xml.push_str("  </Layer>\r\n");
    xml.push_str("  <Details>\r\n");
    xml.push_str(&format!(
        "   <String Id=\"Total Laps\" Value=\"{total_laps}\"/>\r\n"
    ));
    if fastest_time > 0.0 {
        let ft_str = format_lap_duration(fastest_time);
        xml.push_str(&format!(
            "   <String Id=\"Fastest Time\" Value=\"{ft_str}\"/>\r\n"
        ));
        xml.push_str(&format!(
            "   <String Id=\"Fastest Lap\" Value=\"{fastest_lap}\"/>\r\n"
        ));
    }
    xml.push_str("  </Details>\r\n");
    xml.push_str(" </Layers>\r\n");
    xml.push_str("</LDXFile>\r\n");

    xml
}

pub fn export_ld(
    metadata: &Value,
    points: &[Value],
    laps: &[Value],
) -> ApiResult<(Vec<u8>, Vec<u8>)> {
    let resampled = resample_to_grid(points, 60.0);
    let sample_count = resampled.len();

    let mut header_buf = vec![0u8; HEADER_TEMPLATE_SIZE];
    for &(offset, hex_str) in TEMPLATE_RUNS {
        let bytes_len = hex_str.len() / 2;
        for i in 0..bytes_len {
            if let Ok(b) = u8::from_str_radix(&hex_str[i * 2..i * 2 + 2], 16) {
                if offset + i < HEADER_TEMPLATE_SIZE {
                    header_buf[offset + i] = b;
                }
            }
        }
    }

    let id = metadata["session_id"].as_str().unwrap_or("session");
    let car = metadata["car_name"].as_str().unwrap_or("Unknown Vehicle");
    let driver = metadata["driver"].as_str().unwrap_or("Driver");
    let venue = metadata["venue"].as_str().unwrap_or("Forza Circuit");
    let date_str = metadata["date"].as_str().unwrap_or("07/10/2026");
    let time_str = metadata["time"].as_str().unwrap_or("00:00:00");

    let channel_data_ptr = DATA_BASE as u32;

    header_buf[0..4].copy_from_slice(&0x40u32.to_le_bytes());
    header_buf[4..8].copy_from_slice(&0u32.to_le_bytes());
    header_buf[8..12].copy_from_slice(&(HEADER_TEMPLATE_SIZE as u32).to_le_bytes());
    header_buf[12..16].copy_from_slice(&channel_data_ptr.to_le_bytes());
    header_buf[16..36].fill(0);
    header_buf[36..40].copy_from_slice(&1762u32.to_le_bytes());
    header_buf[40..64].fill(0);
    header_buf[64..66].copy_from_slice(&0u16.to_le_bytes());
    header_buf[66..68].copy_from_slice(&0x4240u16.to_le_bytes());
    header_buf[68..70].copy_from_slice(&0x000fu16.to_le_bytes());
    header_buf[70..74].copy_from_slice(&12007u32.to_le_bytes());
    header_buf[74..82].copy_from_slice(&encode_padded_bytes("ADL", 8));
    header_buf[82..84].copy_from_slice(&420u16.to_le_bytes());
    header_buf[84..86].copy_from_slice(&0x0080u16.to_le_bytes());
    header_buf[86..90].copy_from_slice(&(CHANNEL_COUNT as u32).to_le_bytes());
    header_buf[90..94].copy_from_slice(&0x00010064u32.to_le_bytes());
    header_buf[94..110].copy_from_slice(&encode_padded_bytes(date_str, 16));
    header_buf[110..126].fill(0);
    header_buf[126..142].copy_from_slice(&encode_padded_bytes(time_str, 16));
    header_buf[142..158].fill(0);
    header_buf[158..222].copy_from_slice(&encode_padded_bytes(driver, 64));
    header_buf[222..286].copy_from_slice(&encode_padded_bytes(car, 64));
    header_buf[286..350].fill(0);
    header_buf[350..414].copy_from_slice(&encode_padded_bytes(venue, 64));
    header_buf[414..478].fill(0);
    header_buf[478..1502].fill(0);
    header_buf[1502..1506].copy_from_slice(&0x00d20822u32.to_le_bytes());
    header_buf[1506..1508].copy_from_slice(&0u16.to_le_bytes());
    header_buf[1508..1572].copy_from_slice(&encode_padded_bytes(id, 64));
    let short_comment = format!("Exported Telemetry {id}");
    header_buf[1572..1636].copy_from_slice(&encode_padded_bytes(&short_comment, 64));
    header_buf[1636..1644].fill(0);
    header_buf[1644] = 99;

    let mut meta_buf = Vec::with_capacity(CHANNEL_COUNT * CHANNEL_META_SIZE);
    for i in 0..CHANNEL_COUNT {
        let prev_addr: u32 = if i == 0 {
            0
        } else {
            (HEADER_TEMPLATE_SIZE + (i - 1) * CHANNEL_META_SIZE) as u32
        };
        let next_addr: u32 = if i == CHANNEL_COUNT - 1 {
            0
        } else {
            (HEADER_TEMPLATE_SIZE + (i + 1) * CHANNEL_META_SIZE) as u32
        };
        let data_addr: u32 = (DATA_BASE + i * sample_count * 4) as u32;

        meta_buf.extend_from_slice(&prev_addr.to_le_bytes());
        meta_buf.extend_from_slice(&next_addr.to_le_bytes());
        meta_buf.extend_from_slice(&data_addr.to_le_bytes());
        meta_buf.extend_from_slice(&(sample_count as u32).to_le_bytes());

        meta_buf.extend_from_slice(&4u16.to_le_bytes());
        meta_buf.extend_from_slice(&5u16.to_le_bytes());
        meta_buf.extend_from_slice(&4u16.to_le_bytes());
        meta_buf.extend_from_slice(&60u16.to_le_bytes());
        meta_buf.extend_from_slice(&0i16.to_le_bytes());
        meta_buf.extend_from_slice(&1i16.to_le_bytes());
        meta_buf.extend_from_slice(&1i16.to_le_bytes());
        meta_buf.extend_from_slice(&0i16.to_le_bytes());

        meta_buf.extend_from_slice(&encode_padded_bytes(MOTEC_CHANNELS[i].name, 32));
        meta_buf.extend_from_slice(&encode_padded_bytes(MOTEC_CHANNELS[i].short_name, 8));
        meta_buf.extend_from_slice(&encode_padded_bytes(MOTEC_CHANNELS[i].unit, 12));

        meta_buf.push(0xc9);
        meta_buf.extend_from_slice(&[0u8; 39]);
    }

    let mut data_buf = Vec::with_capacity(CHANNEL_COUNT * sample_count * 4);
    for i in 0..CHANNEL_COUNT {
        for pt in &resampled {
            let val = pt.channels[i] as f32;
            data_buf.extend_from_slice(&val.to_le_bytes());
        }
    }

    let mut ld_bytes = Vec::with_capacity(header_buf.len() + meta_buf.len() + data_buf.len());
    ld_bytes.extend_from_slice(&header_buf);
    ld_bytes.extend_from_slice(&meta_buf);
    ld_bytes.extend_from_slice(&data_buf);

    let ldx_xml = generate_ldx_xml(laps, points);

    Ok((ld_bytes, ldx_xml.into_bytes()))
}
