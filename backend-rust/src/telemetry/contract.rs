use serde_json::{Map, Value};

pub const DECODED_POINT_SCHEMA: &str = "decoded-fh6/v1";
pub const LEGACY_POINT_SCHEMA: &str = "legacy-sqlite/unknown";
const SCALARS: &[&str] = &[
    "IsRaceOn",
    "TimestampMS",
    "CarOrdinal",
    "CarClass",
    "CarPerformanceIndex",
    "DrivetrainType",
    "EngineMaxRpm",
    "EngineIdleRpm",
    "CurrentEngineRpm",
    "AccelerationX",
    "AccelerationY",
    "AccelerationZ",
    "VelocityX",
    "VelocityY",
    "VelocityZ",
    "AngularVelocityX",
    "AngularVelocityY",
    "AngularVelocityZ",
    "Yaw",
    "Pitch",
    "Roll",
    "PositionX",
    "PositionY",
    "PositionZ",
    "SpeedMetersPerSecond",
    "PowerWatts",
    "TorqueNewtons",
    "Boost",
    "Fuel",
    "DistanceTraveled",
    "BestLap",
    "LastLap",
    "CurrentLap",
    "CurrentRaceTime",
    "LapNumber",
    "RacePosition",
    "Gear",
    "Cylinders",
    "SmashableVelDiff",
    "SmashableMass",
    "time",
];
const VECTORS: &[&str] = &[
    "NormalizedSuspensionTravel",
    "SuspensionTravelMeters",
    "TireSlipRatio",
    "TireSlipAngle",
    "TireCombinedSlip",
    "TireTemp",
    "SurfaceRumble",
    "WheelRotationSpeed",
    "WheelOnRumbleStrip",
];
const CONTROLS: &[(&str, &str, f64)] = &[
    ("AccelInput", "accel_pct", 255.0),
    ("BrakeInput", "brake_pct", 255.0),
    ("SteerInput", "steer_pct", 127.0),
    ("ClutchInput", "clutch_pct", 255.0),
    ("HandBrakeInput", "handbrake_pct", 255.0),
];

fn finite(v: Option<&Value>) -> bool {
    v.and_then(|x| if x.is_number() { x.as_f64() } else { None })
        .map(f64::is_finite)
        .unwrap_or(false)
}
fn number(v: Option<&Value>) -> Value {
    if finite(v) {
        v.cloned().unwrap()
    } else {
        Value::Null
    }
}

/// Preserve absent/invalid channels as null, including individual wheel values.
pub fn decoded_point(point: &Value) -> Value {
    let src = point.as_object();
    let mut out = Map::new();
    for key in SCALARS {
        out.insert((*key).into(), number(src.and_then(|m| m.get(*key))));
    }
    for (canonical, alias) in [
        ("PowerWatts", "Power"),
        ("TorqueNewtons", "Torque"),
        ("DistanceTraveled", "lap_distance"),
    ] {
        if src.map(|m| !m.contains_key(canonical)).unwrap_or(true) {
            out.insert(canonical.into(), number(src.and_then(|m| m.get(alias))));
        }
    }
    for key in VECTORS {
        let values = src.and_then(|m| m.get(*key)).or_else(|| {
            if *key == "NormalizedSuspensionTravel" {
                src.and_then(|m| m.get("SuspTravel"))
            } else {
                None
            }
        });
        let mut a = Vec::with_capacity(4);
        for i in 0..4 {
            a.push(
                values
                    .and_then(Value::as_array)
                    .and_then(|x| x.get(i))
                    .map(|x| number(Some(x)))
                    .unwrap_or(Value::Null),
            );
        }
        out.insert((*key).into(), Value::Array(a));
    }
    for (raw, percent, scale) in CONTROLS {
        let raw_value = src.and_then(|m| m.get(*raw));
        let value = if src.map(|m| m.contains_key(*raw)).unwrap_or(false) {
            number(raw_value)
        } else if finite(src.and_then(|m| m.get(*percent))) {
            Value::from(src.unwrap().get(*percent).and_then(Value::as_f64).unwrap() * scale / 100.0)
        } else {
            Value::Null
        };
        let pct = value
            .as_f64()
            .map(|x| Value::from(x * 100.0 / scale))
            .unwrap_or(Value::Null);
        out.insert((*raw).into(), value);
        out.insert((*percent).into(), pct);
    }
    let source_schema = src
        .and_then(|m| m.get("sourceSchema"))
        .filter(|x| x.as_str().is_some())
        .cloned()
        .unwrap_or_else(|| Value::from(DECODED_POINT_SCHEMA));
    out.insert("sourceSchema".into(), source_schema);
    out.insert(
        "TelemetrySchema".into(),
        src.and_then(|m| m.get("TelemetrySchema"))
            .cloned()
            .unwrap_or_else(|| Value::from("unknown")),
    );
    for (alias, canon) in [
        ("lap_distance", "DistanceTraveled"),
        ("SuspTravel", "NormalizedSuspensionTravel"),
        ("Power", "PowerWatts"),
        ("Torque", "TorqueNewtons"),
    ] {
        out.insert(alias.into(), out.get(canon).cloned().unwrap_or(Value::Null));
    }
    Value::Object(out)
}
