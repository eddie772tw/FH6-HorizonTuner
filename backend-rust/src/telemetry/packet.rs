use serde_json::{Map, Value};

pub const LEGACY_TELEMETRY_PACKET_LENGTH: usize = 232;
pub const FULL_TELEMETRY_PACKET_LENGTH: usize = 324;
pub const LEGACY_TELEMETRY_SCHEMA: &str = "forza-data-out/legacy-common-v1";
pub const FULL_TELEMETRY_SCHEMA: &str = "forza-data-out/fh6-324-v2";

fn f32_at(data: &[u8], index: usize) -> f64 {
    let start = index * 4;
    f32::from_le_bytes(data[start..start + 4].try_into().unwrap()) as f64
}
fn i32_at(data: &[u8], index: usize) -> i64 {
    let start = index * 4;
    i32::from_le_bytes(data[start..start + 4].try_into().unwrap()) as i64
}
fn u32_at(data: &[u8], index: usize) -> u64 {
    let start = index * 4;
    u32::from_le_bytes(data[start..start + 4].try_into().unwrap()) as u64
}
fn arr(data: &[u8], start: usize) -> Value {
    Value::Array((0..4).map(|i| num(f32_at(data, start + i))).collect())
}
fn num(v: f64) -> Value {
    serde_json::Number::from_f64(v)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}
fn put(m: &mut Map<String, Value>, k: &str, v: Value) {
    m.insert(k.to_string(), v);
}

/// Parse the FH6 Data Out V2 (324 byte) or legacy common (232 byte) packet.
/// Errors are stable rejection reasons used by the Python listener metrics.
pub fn parse_packet(data: &[u8]) -> Result<Value, String> {
    if data.len() < LEGACY_TELEMETRY_PACKET_LENGTH {
        return Err("too_short".into());
    }
    if data.len() > LEGACY_TELEMETRY_PACKET_LENGTH && data.len() < FULL_TELEMETRY_PACKET_LENGTH {
        return Err("partial_schema".into());
    }
    if data.len() > FULL_TELEMETRY_PACKET_LENGTH {
        return Err("unsupported_length".into());
    }
    if i32_at(data, 0) != 1 {
        return Err("not_racing".into());
    }
    if data.len() != LEGACY_TELEMETRY_PACKET_LENGTH && data.len() != FULL_TELEMETRY_PACKET_LENGTH {
        return Err("unsupported_length".into());
    }

    let mut m = Map::new();
    put(&mut m, "IsRaceOn", Value::from(i32_at(data, 0)));
    put(
        &mut m,
        "TelemetrySchema",
        Value::from(if data.len() == FULL_TELEMETRY_PACKET_LENGTH {
            FULL_TELEMETRY_SCHEMA
        } else {
            LEGACY_TELEMETRY_SCHEMA
        }),
    );
    put(&mut m, "TimestampMS", Value::from(u32_at(data, 1)));
    for (idx, key) in [
        (2, "EngineMaxRpm"),
        (3, "EngineIdleRpm"),
        (4, "CurrentEngineRpm"),
        (5, "AccelerationX"),
        (6, "AccelerationY"),
        (7, "AccelerationZ"),
        (8, "VelocityX"),
        (9, "VelocityY"),
        (10, "VelocityZ"),
        (11, "AngularVelocityX"),
        (12, "AngularVelocityY"),
        (13, "AngularVelocityZ"),
        (14, "Yaw"),
        (15, "Pitch"),
        (16, "Roll"),
    ] {
        put(&mut m, key, num(f32_at(data, idx)));
    }
    for (start, key) in [
        (17, "NormalizedSuspensionTravel"),
        (21, "TireSlipRatio"),
        (25, "WheelRotationSpeed"),
        (37, "SurfaceRumble"),
        (41, "TireSlipAngle"),
        (45, "TireCombinedSlip"),
        (49, "SuspensionTravelMeters"),
    ] {
        put(&mut m, key, arr(data, start));
    }
    for (idx, key) in [
        (29, "WheelOnRumbleStrip"),
        (30, "_wheel_on_rumble_strip_2"),
        (31, "_wheel_on_rumble_strip_3"),
        (32, "_wheel_on_rumble_strip_4"),
    ] {
        let _ = (idx, key);
    }
    put(
        &mut m,
        "WheelOnRumbleStrip",
        Value::Array((29..33).map(|i| Value::from(i32_at(data, i))).collect()),
    );
    put(&mut m, "CarOrdinal", Value::from(i32_at(data, 53)));
    put(&mut m, "CarClass", Value::from(i32_at(data, 54)));
    put(&mut m, "CarPerformanceIndex", Value::from(i32_at(data, 55)));
    put(&mut m, "DrivetrainType", Value::from(i32_at(data, 56)));
    put(&mut m, "Cylinders", Value::from(i32_at(data, 57)));
    if data.len() == FULL_TELEMETRY_PACKET_LENGTH {
        for (idx, key) in [
            (61, "PositionX"),
            (62, "PositionY"),
            (63, "PositionZ"),
            (64, "SpeedMetersPerSecond"),
            (65, "PowerWatts"),
            (66, "TorqueNewtons"),
        ] {
            put(&mut m, key, num(f32_at(data, idx)));
        }
        put(&mut m, "TireTemp", arr(data, 67));
        for (idx, key) in [
            (71, "Boost"),
            (72, "Fuel"),
            (73, "DistanceTraveled"),
            (74, "BestLap"),
            (75, "LastLap"),
            (76, "CurrentLap"),
            (77, "CurrentRaceTime"),
        ] {
            put(&mut m, key, num(f32_at(data, idx)));
        }
        // The final packed section is `HB BBBBB b`: lap number, race
        // position, four controls, gear and signed steering input.
        put(
            &mut m,
            "LapNumber",
            Value::from(u16::from_le_bytes(data[312..314].try_into().unwrap()) as i64),
        );
        put(&mut m, "RacePosition", Value::from(data[314]));
        for (offset, key) in [
            (315, "AccelInput"),
            (316, "BrakeInput"),
            (317, "ClutchInput"),
            (318, "HandBrakeInput"),
            (319, "Gear"),
        ] {
            put(&mut m, key, Value::from(data[offset]));
        }
        put(&mut m, "SteerInput", Value::from(data[320] as i8));
        let v2_numeric = [
            "PositionX",
            "PositionY",
            "PositionZ",
            "SpeedMetersPerSecond",
            "PowerWatts",
            "TorqueNewtons",
            "Boost",
            "Fuel",
            "BestLap",
            "LastLap",
            "CurrentLap",
            "DistanceTraveled",
            "CurrentRaceTime",
        ];
        if v2_numeric.iter().any(|key| !finite(m.get(*key))) || plausibility_failed(&m) {
            return Err(if fuel_out_of_range(&m) || speed_negative(&m) {
                "out_of_range"
            } else {
                "non_finite"
            }
            .into());
        }
    } else if plausibility_failed(&m) {
        return Err("non_finite".into());
    }
    Ok(Value::Object(m))
}

fn finite(v: Option<&Value>) -> bool {
    v.and_then(Value::as_f64)
        .map(f64::is_finite)
        .unwrap_or(false)
}
fn arr_finite(v: Option<&Value>) -> bool {
    v.and_then(Value::as_array)
        .map(|a| a.iter().all(|x| finite(Some(x))))
        .unwrap_or(false)
}
fn plausibility_failed(m: &Map<String, Value>) -> bool {
    let scalar = [
        "EngineMaxRpm",
        "EngineIdleRpm",
        "CurrentEngineRpm",
        "AccelerationX",
        "AccelerationY",
        "AccelerationZ",
        "VelocityX",
        "VelocityY",
        "VelocityZ",
        "Yaw",
        "Pitch",
        "Roll",
        "AngularVelocityX",
        "AngularVelocityY",
        "AngularVelocityZ",
    ];
    scalar.iter().any(|k| !finite(m.get(*k)))
        || [
            "WheelRotationSpeed",
            "SurfaceRumble",
            "TireCombinedSlip",
            "NormalizedSuspensionTravel",
            "SuspensionTravelMeters",
            "TireSlipRatio",
            "TireSlipAngle",
        ]
        .iter()
        .any(|k| !arr_finite(m.get(*k)))
}
fn fuel_out_of_range(m: &Map<String, Value>) -> bool {
    m.get("Fuel")
        .and_then(Value::as_f64)
        .map(|x| !(0.0..=1.0).contains(&x))
        .unwrap_or(false)
}
fn speed_negative(m: &Map<String, Value>) -> bool {
    m.get("SpeedMetersPerSecond")
        .and_then(Value::as_f64)
        .map(|x| x < 0.0)
        .unwrap_or(false)
}

fn value_f64(m: &Map<String, Value>, key: &str, default: f64) -> f64 {
    m.get(key).and_then(Value::as_f64).unwrap_or(default)
}
fn value_i64(m: &Map<String, Value>, key: &str, default: i64) -> i64 {
    m.get(key)
        .and_then(Value::as_i64)
        .or_else(|| m.get(key).and_then(Value::as_f64).map(|x| x as i64))
        .unwrap_or(default)
}
fn array4(m: &Map<String, Value>, key: &str) -> [f64; 4] {
    let mut out = [0.0; 4];
    if let Some(a) = m.get(key).and_then(Value::as_array) {
        for (i, x) in a.iter().take(4).enumerate() {
            out[i] = x.as_f64().unwrap_or(0.0);
        }
    }
    out
}

/// Encode the stable 128-byte frontend telemetry packet. Invalid input follows
/// Python's fail-safe behavior and returns an all-zero packet.
pub fn pack_binary(value: &Value) -> Vec<u8> {
    let Some(m) = value.as_object() else {
        return vec![0; 128];
    };
    let mut out = Vec::with_capacity(128);
    out.extend_from_slice(&(value_i64(m, "IsRaceOn", 0) as i32).to_le_bytes());
    for x in [
        value_f64(m, "CurrentEngineRpm", 0.0),
        value_f64(m, "EngineMaxRpm", 6000.0),
        value_f64(m, "EngineIdleRpm", 1000.0),
        value_f64(m, "SpeedMetersPerSecond", 0.0) * 3.6,
    ] {
        out.extend_from_slice(&(x as f32).to_le_bytes());
    }
    out.extend_from_slice(&(value_i64(m, "Gear", 0) as i32).to_le_bytes());
    for x in [
        value_f64(m, "PowerWatts", 0.0) / 745.7,
        value_f64(m, "Boost", 0.0) / 6894.75729,
        value_f64(m, "AccelerationX", 0.0) / 9.81,
        value_f64(m, "AccelerationY", 0.0) / 9.81,
        value_f64(m, "AccelerationZ", 0.0) / 9.81,
        value_f64(m, "Yaw", 0.0),
        0.0,
        0.0,
    ] {
        out.extend_from_slice(&(x as f32).to_le_bytes());
    }
    for key in ["TireTemp", "NormalizedSuspensionTravel", "TireSlipRatio"] {
        for x in array4(m, key) {
            out.extend_from_slice(&(x as f32).to_le_bytes());
        }
    }
    for x in array4(m, "TireSlipAngle") {
        out.extend_from_slice(&((x * 57.29578) as f32).to_le_bytes());
    }
    out.extend_from_slice(&[0; 8]);
    if out.len() == 128 {
        out
    } else {
        vec![0; 128]
    }
}
