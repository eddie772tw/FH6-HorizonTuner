//! Straight-line observed tire channels; never infers compound or maximum grip.
use serde_json::{json, Value};

fn number(v: &Value, k: &str) -> Option<f64> {
    v[k].as_f64().filter(|v| v.is_finite())
}
// [PERF] Compute a bitmask in one pass over missingChannels, eliminating up to 14*N format!() String allocs.
fn missing_mask(s: &Value) -> u16 {
    let Some(raw) = s.get("missingChannels") else {
        return 0;
    };
    let Some(a) = raw.as_array() else {
        return u16::MAX;
    };
    let mut mask = 0u16;
    for item in a {
        let Some(name) = item.as_str() else {
            return u16::MAX;
        };
        mask |= match name.split_once('.').map_or(name, |(h, _)| h) {
            "AccelInput" => 1 << 0,
            "BrakeInput" => 1 << 1,
            "ClutchInput" => 1 << 2,
            "HandBrakeInput" => 1 << 3,
            "SteerInput" => 1 << 4,
            "AccelerationX" => 1 << 5,
            "AccelerationZ" => 1 << 6,
            "Pitch" => 1 << 7,
            "Roll" => 1 << 8,
            "TireSlipRatio" => 1 << 9,
            "TireTemp" => 1 << 10,
            "NormalizedSuspensionTravel" => 1 << 11,
            _ => 0,
        };
    }
    mask
}
// [PERF] Stack-allocated [f64; 4] eliminates 5 heap Vec<f64> allocations per accepted sample.
fn wheels(v: &Value) -> Option<[f64; 4]> {
    let a = v.as_array().filter(|v| v.len() == 4)?;
    let f = |x: &Value| x.as_f64().filter(|v| v.is_finite());
    Some([f(&a[0])?, f(&a[1])?, f(&a[2])?, f(&a[3])?])
}
pub fn observe(samples: &[Value], identity: &Value) -> Value {
    let id_ordinal = number(identity, "carOrdinal");
    let id_get = |k| identity.get(k).map(|_| number(identity, k));
    let (id_pi, id_class) = (id_get("performanceIndex"), id_get("carClass"));
    let mut reasons = Vec::<String>::new();
    let mut reason = |v: &str| {
        if !reasons.iter().any(|s| s == v) {
            reasons.push(v.into());
        }
    };
    let (mut previous, mut discontinuous, mut accepted) = (None, false, 0usize);
    let (mut acceleration, mut temps, mut max_slip) = (0.0, [0.0; 4], 0.0_f64);
    let (mut slip_complete, mut temp_complete) = (true, true);
    for s in samples {
        if number(s, "carOrdinal") != id_ordinal
            || id_pi.is_some_and(|v| number(s, "performanceIndex") != v)
            || id_class.is_some_and(|v| number(s, "carClass") != v)
        {
            reason("identity-mismatch");
            continue;
        }
        let Some(t) = number(s, "timestampMS").filter(|t| previous.is_none_or(|old| *t > old))
        else {
            reason("timestamp-invalid");
            continue;
        };
        if previous.is_some_and(|old| t - old > 250.0) {
            reason("capture-discontinuous");
            discontinuous = true;
        }
        previous = Some(t);
        if number(s, "speedMps").is_none_or(|v| v <= 1.0)
            || number(s, "gear").is_none_or(|v| v < 1.0)
        {
            reason("motion-or-gear-invalid");
            continue;
        }
        if number(s, "brakeInput") != Some(0.0) || number(s, "handBrakeInput") != Some(0.0) {
            reason("brake-active");
            continue;
        }
        let missing = missing_mask(s);
        if (missing & 0x1ff) != 0 {
            reason("required-scalar-unavailable");
            continue;
        }
        if number(s, "accelInput").is_none_or(|v| v <= 0.0) || number(s, "clutchInput") != Some(0.0)
        {
            reason("throttle-or-clutch-invalid");
            continue;
        }
        if number(s, "steerInput").is_none_or(|v| v.abs() > 3.0)
            || number(s, "accelerationX").is_none_or(|v| v.abs() > 1.5)
        {
            reason("not-straight");
            continue;
        }
        let Some(az) = number(s, "accelerationZ") else {
            reason("body-state-invalid");
            continue;
        };
        if number(s, "pitch").is_none_or(|v| v.abs() > 0.15)
            || number(s, "roll").is_none_or(|v| v.abs() > 0.15)
        {
            reason("body-state-invalid");
            continue;
        }
        let slip = ((missing & (1 << 9)) == 0)
            .then(|| wheels(&s["tireSlipRatio"]))
            .flatten();
        if slip.is_none() {
            reason("slip-unavailable");
        }
        let temp = ((missing & (1 << 10)) == 0)
            .then(|| wheels(&s["tireTemp"]))
            .flatten();
        if temp.is_none() {
            reason("temperature-unavailable");
        }
        if (missing & (1 << 11)) != 0
            || wheels(&s["normalizedSuspensionTravel"])
                .is_none_or(|a| a.iter().any(|v| *v < 0.02 || *v > 0.98))
        {
            reason("airborne-or-suspension-invalid");
            continue;
        }
        accepted += 1;
        acceleration += az;
        if let Some(w) = slip {
            for v in w {
                max_slip = max_slip.max(v.abs());
            }
        } else {
            slip_complete = false;
        }
        if let Some(w) = temp {
            for i in 0..4 {
                temps[i] += w[i];
            }
        } else {
            temp_complete = false;
        }
    }
    let valid = accepted > 0 && !discontinuous;
    let acc = valid.then(|| acceleration / accepted as f64);
    let slip = (valid && slip_complete).then_some(max_slip);
    let temperature = (valid && temp_complete).then(|| temps.map(|v| v / accepted as f64));
    if acc.is_none() {
        reasons.push("acceleration-unavailable".into());
    }
    if slip.is_none() {
        reasons.push("slip-unavailable".into());
    }
    json!({"status":if valid{"observed"}else{"unavailable"},"acceptedSampleCount":accepted,"observedLongitudinalAccelerationMps2":acc,"maxObservedNormalizedSlip":slip,"observedTireTemperature":temperature,"unavailableReasons":reasons})
}
