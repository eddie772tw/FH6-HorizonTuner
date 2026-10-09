//! Straight-line observed tire channels; never infers compound or maximum grip.
use serde_json::{json, Value};
fn number(v: &Value, k: &str) -> Option<f64> {
    v[k].as_f64().filter(|v| v.is_finite())
}
fn missing(s: &Value, channel: &str) -> bool {
    match s.get("missingChannels") {
        None => false,
        Some(Value::Array(a)) => a.iter().any(|v| {
            v.as_str()
                .is_none_or(|v| v == channel || v.starts_with(&format!("{channel}.")))
        }),
        _ => true,
    }
}
fn wheels(v: &Value) -> Option<Vec<f64>> {
    v.as_array().filter(|v| v.len() == 4).and_then(|a| {
        a.iter()
            .map(|v| v.as_f64().filter(|v| v.is_finite()))
            .collect()
    })
}
pub fn observe(samples: &[Value], identity: &Value) -> Value {
    let mut accepted = Vec::new();
    let mut reasons = Vec::<String>::new();
    let mut reason = |v: &str| {
        if !reasons.iter().any(|s| s == v) {
            reasons.push(v.into());
        }
    };
    let mut previous = None;
    let mut discontinuous = false;
    for s in samples {
        if ["carOrdinal", "performanceIndex", "carClass"]
            .iter()
            .any(|k| {
                (*k == "carOrdinal" || identity.get(k).is_some())
                    && number(s, k) != number(identity, k)
            })
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
        if [
            "AccelInput",
            "BrakeInput",
            "ClutchInput",
            "HandBrakeInput",
            "SteerInput",
            "AccelerationX",
            "AccelerationZ",
            "Pitch",
            "Roll",
        ]
        .iter()
        .any(|k| missing(s, k))
        {
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
        if number(s, "pitch").is_none_or(|v| v.abs() > 0.15)
            || number(s, "roll").is_none_or(|v| v.abs() > 0.15)
            || number(s, "accelerationZ").is_none()
        {
            reason("body-state-invalid");
            continue;
        }
        if missing(s, "TireSlipRatio") || wheels(&s["tireSlipRatio"]).is_none() {
            reason("slip-unavailable");
        }
        if missing(s, "TireTemp") || wheels(&s["tireTemp"]).is_none() {
            reason("temperature-unavailable");
        }
        if missing(s, "NormalizedSuspensionTravel")
            || wheels(&s["normalizedSuspensionTravel"])
                .is_none_or(|a| a.iter().any(|v| *v < 0.02 || *v > 0.98))
        {
            reason("airborne-or-suspension-invalid");
            continue;
        }
        accepted.push(s);
    }
    let mut acceleration = 0.0;
    let mut temps = [0.0; 4];
    let mut max_slip = 0.0_f64;
    let mut slip_complete = !accepted.is_empty();
    let mut temp_complete = !accepted.is_empty();
    for s in &accepted {
        acceleration += number(s, "accelerationZ").unwrap();
        if missing(s, "TireSlipRatio") {
            slip_complete = false;
        }
        if missing(s, "TireTemp") {
            temp_complete = false;
        }
        if let Some(w) = wheels(&s["tireSlipRatio"]) {
            for v in w {
                max_slip = max_slip.max(v.abs());
            }
        } else {
            slip_complete = false;
        }
        if let Some(w) = wheels(&s["tireTemp"]) {
            for (i, v) in w.into_iter().enumerate() {
                temps[i] += v;
            }
        } else {
            temp_complete = false;
        }
    }
    let acc =
        (!accepted.is_empty() && !discontinuous).then(|| acceleration / accepted.len() as f64);
    let slip = (slip_complete && !discontinuous).then_some(max_slip);
    let temperature =
        (temp_complete && !discontinuous).then(|| temps.map(|v| v / accepted.len() as f64));
    if acc.is_none() {
        reasons.push("acceleration-unavailable".into());
    }
    if slip.is_none() {
        reasons.push("slip-unavailable".into());
    }
    json!({"status":if !accepted.is_empty()&&!discontinuous{"observed"}else{"unavailable"},"acceptedSampleCount":accepted.len(),"observedLongitudinalAccelerationMps2":acc,"maxObservedNormalizedSlip":slip,"observedTireTemperature":temperature,"unavailableReasons":reasons})
}
