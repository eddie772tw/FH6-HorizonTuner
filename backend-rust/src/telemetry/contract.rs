use serde::ser::{SerializeMap, Serializer};
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
    let mut out = Map::with_capacity(66);
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

// [PERF] Stream canonical raw_json directly into a reused buffer and retain stack column refs.
type V<'a> = Option<&'a Value>;
pub(crate) struct DecodedRow<'a>([V<'a>; 41], [[V<'a>; 4]; 9], [Option<f64>; 5]);
impl<'a> DecodedRow<'a> {
    pub(crate) fn encode(point: &'a Value, buf: &mut Vec<u8>) -> serde_json::Result<Self> {
        buf.clear();
        let get = |k| point.as_object().and_then(|m| m.get(k));
        let fv = |v: V<'a>| v.filter(|x| finite(Some(x)));
        let fin = |x: f64| x.is_finite().then_some(x);
        let mut ser = serde_json::Serializer::new(buf);
        let mut m = ser.serialize_map(Some(66))?;
        let alias = [(25, "Power"), (26, "Torque"), (29, "lap_distance")];
        let mut scalars = [None; 41];
        for (i, &k) in SCALARS.iter().enumerate() {
            let v = get(k).or_else(|| alias.iter().find(|x| x.0 == i).and_then(|x| get(x.1)));
            scalars[i] = fv(v);
            m.serialize_entry(k, &scalars[i])?;
        }
        let mut vectors = [[None; 4]; 9];
        for (i, &k) in VECTORS.iter().enumerate() {
            let a = get(k).or_else(|| (i == 0).then(|| get("SuspTravel")).flatten());
            vectors[i] = std::array::from_fn(|j| fv(a.and_then(|x| x.as_array()?.get(j))));
            m.serialize_entry(k, &vectors[i])?;
        }
        let mut pcts = [None; 5];
        for (i, &(raw, pct, scale)) in CONTROLS.iter().enumerate() {
            let num = if let Some(v) = get(raw) {
                let v = fv(Some(v));
                m.serialize_entry(raw, &v)?;
                v.and_then(Value::as_f64)
            } else {
                let n = fv(get(pct)).and_then(|x| fin(x.as_f64()? * scale / 100.0));
                m.serialize_entry(raw, &n)?;
                n
            };
            pcts[i] = num.and_then(|x| fin(x * 100.0 / scale));
            m.serialize_entry(pct, &pcts[i])?;
        }
        let ss = get("sourceSchema").and_then(Value::as_str);
        m.serialize_entry("sourceSchema", ss.unwrap_or(DECODED_POINT_SCHEMA))?;
        match get("TelemetrySchema") {
            Some(v) => m.serialize_entry("TelemetrySchema", v)?,
            None => m.serialize_entry("TelemetrySchema", "unknown")?,
        }
        m.serialize_entry("lap_distance", &scalars[29])?;
        m.serialize_entry("SuspTravel", &vectors[0])?;
        m.serialize_entry("Power", &scalars[25])?;
        m.serialize_entry("Torque", &scalars[26])?;
        m.end()?;
        Ok(Self(scalars, vectors, pcts))
    }
    pub(crate) fn f64(&self, k: &str) -> Option<f64> {
        if let Some(i) = SCALARS.iter().position(|&x| x == k) {
            return self.0[i]?.as_f64();
        }
        self.2[CONTROLS.iter().position(|c| c.1 == k)?]
    }
    pub(crate) fn vec_f64(&self, k: &str, j: usize) -> Option<f64> {
        let i = VECTORS.iter().position(|&x| x == k)?;
        self.1[i][j]?.as_f64()
    }
    pub(crate) fn i64(&self, k: &str) -> i64 {
        let v = SCALARS.iter().position(|&x| x == k).and_then(|i| self.0[i]);
        v.and_then(|x| x.as_i64().or_else(|| x.as_f64().map(|n| n as i64)))
            .unwrap_or(0)
    }
}
