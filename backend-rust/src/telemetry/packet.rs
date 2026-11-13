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
// [PERF] Construct fixed-size 4-element arrays directly to eliminate Iterator and Vec realloc in 60Hz hot path.
fn arr(data: &[u8], start: usize) -> Value {
    Value::Array(vec![
        num(f32_at(data, start)),
        num(f32_at(data, start + 1)),
        num(f32_at(data, start + 2)),
        num(f32_at(data, start + 3)),
    ])
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
    let is_full = data.len() == FULL_TELEMETRY_PACKET_LENGTH;
    validate_packet_floats(data, is_full)?;

    // [PERF] Exact IndexMap capacity after pre-validation (53 keys for V2 full, 31 for legacy).
    let mut m = Map::with_capacity(if is_full { 53 } else { 31 });
    put(&mut m, "IsRaceOn", Value::from(i32_at(data, 0)));
    put(
        &mut m,
        "TelemetrySchema",
        Value::from(if is_full {
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
    put(
        &mut m,
        "WheelOnRumbleStrip",
        // [PERF] Direct 4-element initialization to eliminate Iterator and Vec reallocations.
        Value::Array(vec![
            Value::from(i32_at(data, 29)),
            Value::from(i32_at(data, 30)),
            Value::from(i32_at(data, 31)),
            Value::from(i32_at(data, 32)),
        ]),
    );
    put(&mut m, "CarOrdinal", Value::from(i32_at(data, 53)));
    put(&mut m, "CarClass", Value::from(i32_at(data, 54)));
    put(&mut m, "CarPerformanceIndex", Value::from(i32_at(data, 55)));
    put(&mut m, "DrivetrainType", Value::from(i32_at(data, 56)));
    put(&mut m, "Cylinders", Value::from(i32_at(data, 57)));
    if is_full {
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
    }
    Ok(Value::Object(m))
}

// [PERF] Pre-validate raw f32 fields on the slice before constructing IndexMap/Strings/Vecs.
// Eliminates 35 string-hash lookups per valid packet and avoids all heap allocations on invalid packets.
fn validate_packet_floats(data: &[u8], is_full: bool) -> Result<(), &'static str> {
    let base_ok = (2..29).all(|i| f32_at(data, i).is_finite())
        && (37..53).all(|i| f32_at(data, i).is_finite());
    let v2_ok = !is_full
        || ((61..67).all(|i| f32_at(data, i).is_finite())
            && (71..78).all(|i| f32_at(data, i).is_finite()));
    if base_ok && v2_ok {
        return Ok(());
    }
    if is_full {
        let fuel = f32_at(data, 72);
        let speed = f32_at(data, 64);
        if (fuel.is_finite() && !(0.0..=1.0).contains(&fuel)) || (speed.is_finite() && speed < 0.0)
        {
            return Err("out_of_range");
        }
    }
    Err("non_finite")
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{hint::black_box, time::Instant};

    fn sample_v2_packet() -> [u8; FULL_TELEMETRY_PACKET_LENGTH] {
        let mut b = [0u8; FULL_TELEMETRY_PACKET_LENGTH];
        b[0..4].copy_from_slice(&1i32.to_le_bytes());
        b[4..8].copy_from_slice(&12345u32.to_le_bytes());
        for idx in (2..=28).chain(37..=52).chain(61..=77) {
            let start = idx * 4;
            let val = if idx == 72 { 0.75f32 } else { idx as f32 * 1.5 };
            b[start..start + 4].copy_from_slice(&val.to_le_bytes());
        }
        b[315] = 255;
        b[319] = 4;
        b
    }

    #[test]
    #[ignore = "release-only microbenchmark; no timing pass threshold"]
    fn bench_parse_packet_release() {
        let valid_v2 = sample_v2_packet();
        let mut invalid_v2 = valid_v2;
        invalid_v2[72 * 4..72 * 4 + 4].copy_from_slice(&2.0f32.to_le_bytes());
        invalid_v2[65 * 4..65 * 4 + 4].copy_from_slice(&f32::NAN.to_le_bytes());

        for _ in 0..1000 {
            let _ = black_box(parse_packet(black_box(&valid_v2)));
        }
        let iters = 50_000;
        let start = Instant::now();
        for _ in 0..iters {
            let _ = black_box(parse_packet(black_box(&valid_v2)));
        }
        let valid_ms = start.elapsed().as_secs_f64() * 1000.0;

        let start = Instant::now();
        for _ in 0..iters {
            let _ = black_box(parse_packet(black_box(&invalid_v2)));
        }
        let invalid_ms = start.elapsed().as_secs_f64() * 1000.0;
        println!(
            "parse_packet_50k_valid_ms={valid_ms:.3} parse_packet_50k_invalid_ms={invalid_ms:.3}"
        );
    }

    #[test]
    fn prevalidation_preserves_tire_temp_null_and_rejection_parity() {
        let mut p = sample_v2_packet();
        p[68 * 4..68 * 4 + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        p[72 * 4..72 * 4 + 4].copy_from_slice(&1.5f32.to_le_bytes());
        let ok = parse_packet(&p).expect("TireTemp NaN and finite Fuel > 1 stay accepted");
        assert!(ok["TireTemp"][1].is_null());

        p[65 * 4..65 * 4 + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert_eq!(parse_packet(&p).unwrap_err(), "out_of_range");

        p[72 * 4..72 * 4 + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert_eq!(parse_packet(&p).unwrap_err(), "non_finite");

        let mut speed_neg = sample_v2_packet();
        speed_neg[64 * 4..64 * 4 + 4].copy_from_slice(&(-1.0f32).to_le_bytes());
        speed_neg[66 * 4..66 * 4 + 4].copy_from_slice(&f32::INFINITY.to_le_bytes());
        assert_eq!(parse_packet(&speed_neg).unwrap_err(), "out_of_range");

        let mut legacy = [0u8; LEGACY_TELEMETRY_PACKET_LENGTH];
        legacy[50 * 4..50 * 4 + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert_eq!(parse_packet(&legacy).unwrap_err(), "non_finite");
    }
}
