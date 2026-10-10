//! Draft defaults preserve the pre-migration desktop loader. Persisted documents
//! are never rewritten by normalization.
use serde_json::{json, Value};
pub fn ev_profile(raw: &Value) -> Value {
    let setup = &raw["evGearbox"];
    let ratio = |v: &Value| {
        v.is_null()
            || v.as_f64()
                .is_some_and(|v| v.is_finite() && v > 0.0 && v <= 20.0)
    };
    let valid = setup.is_object()
        && setup.get("finalDrive").is_some_and(ratio)
        && setup["gearRatios"]
            .as_array()
            .is_some_and(|a| !a.is_empty() && a.len() <= 10 && a.iter().all(ratio));
    let mut result = json!({"isElectric":raw["isElectric"]==true});
    if valid {
        let ratios = setup["gearRatios"].as_array().unwrap();
        result["evGearbox"] = json!({"finalDrive":setup["finalDrive"],"gearRatios":ratios,"finalDriveAdjustable":setup["finalDriveAdjustable"]==true,"gearAdjustable":(0..ratios.len()).map(|i|setup["gearAdjustable"][i]==true).collect::<Vec<_>>(),"allForwardGearsConfirmed":setup["allForwardGearsConfirmed"]==true});
    }
    result
}
pub fn normalize(raw: &Value) -> Value {
    let mut result: Value = serde_json::from_str(include_str!("profile_defaults.json")).unwrap();
    if let Some(selection) = raw.get("transmission") {
        // Preserve explicit/unknown choices; never guess or normalize them into ICE.
        result["transmission"] = selection.clone();
    }
    for (key, value) in result.as_object_mut().unwrap() {
        if key == "adjustability" {
            for (field, default) in value.as_object_mut().unwrap() {
                if let Some(v) = raw["adjustability"].get(field).filter(|v| !v.is_null()) {
                    *default = v.clone();
                }
            }
        } else if let Some(v) = raw.get(key).filter(|v| !v.is_null()) {
            *value = v.clone();
        }
    }
    if let Some(v) = raw.get("dyno_quality") {
        result["dyno_quality"] = v.clone();
    }
    for (key, value) in ev_profile(raw).as_object().unwrap() {
        result[key] = value.clone();
    }
    result
}
pub fn ev_ready(raw: &Value) -> bool {
    let value = ev_profile(raw);
    let s = &value["evGearbox"];
    s["allForwardGearsConfirmed"] == true
        && s["gearRatios"].as_array().is_some_and(|a| {
            a.windows(2)
                .all(|w| w[0].is_null() || w[1].is_null() || w[1].as_f64() < w[0].as_f64())
        })
}
pub fn exploration(input: &Value) -> Option<f64> {
    let s = &input["setting"];
    let get = |k: &str| s[k].as_f64().filter(|v| v.is_finite());
    let value = get("value")?;
    let min = get("minimum")?;
    let max = get("maximum")?;
    let step = get("step")?;
    let direction = input["direction"].as_f64()?;
    if ![-1.0, 1.0].contains(&direction) || min >= max || step <= 0.0 || value < min || value > max
    {
        return None;
    }
    let grid = (value - min) / step;
    if (grid - grid.round()).abs() > 1e-5 {
        return None;
    }
    let candidate = format!("{:.8}", min + (grid.round() + direction) * step)
        .parse::<f64>()
        .ok()?;
    (candidate >= min && candidate <= max).then_some(candidate)
}
