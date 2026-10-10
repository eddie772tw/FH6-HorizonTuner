//! Neutral preview of the existing owner; no new preference coefficients.
use super::{
    alignment::StaticAlignment, workflow::mechanical_fields, ChassisTuningResult, RaceGoal,
};
use serde_json::{json, Value};

pub fn preview(
    goal: RaceGoal,
    profile: &Value,
    current: &Value,
    c: &ChassisTuningResult,
    a: &StaticAlignment,
) -> Value {
    let mut missing = Vec::new();
    if !profile["weight"]
        .as_f64()
        .is_some_and(|v| v.is_finite() && v > 0.0)
    {
        missing.push("missing-weight");
    }
    if !profile["weight_distribution"]
        .as_f64()
        .is_some_and(|v| v.is_finite() && v > 0.0 && v < 100.0)
    {
        missing.push("missing-distribution");
    }
    let mut affected = Vec::new();
    let fields: Vec<Value> = mechanical_fields(profile, c, a).into_iter().map(|(key, field)| {
        let family = key.split('.').next().unwrap();
        let axle = key.split('.').nth(1).unwrap();
        let capability = &profile["adjustability"];
        // Match the measured-workflow capability filter, including Race-only alignment.
        let locked = (matches!(family, "spring"|"height"|"rebound"|"bump"|"camber"|"toe"|"caster") && capability["suspension"] != "Race")
            || (family == "arb" && capability["arb"] != "Adjustable")
            || (family == "diff" && capability["diff"] != "Adjustable");
        let range = if matches!(family, "spring"|"height"|"arb") {
            let prefix = format!("{family}_{axle}");
            let min = profile[format!("{prefix}_min")].as_f64();
            let max = profile[format!("{prefix}_max")].as_f64();
            match (min, max) {
                (Some(min), Some(max)) if min.is_finite() && max.is_finite() && min <= max
                    && (if family == "arb" { min >= 0.0 } else { min > 0.0 }) => {
                    let value = field["value"].as_f64().unwrap();
                    if value < min || value > max { Some("value-outside-range") } else { None }
                }
                (Some(_), Some(_)) => Some("invalid-range"),
                _ => Some("unknown-range"),
            }
        } else { None };
        let reason = if locked { Some("capability-locked") } else if !missing.is_empty() { Some("mechanical-inputs-unavailable") } else { range };
        let recommended = reason.is_none().then(|| field["value"].as_f64().unwrap());
        // Current values are user/local readback, never inferred from a recommendation.
        let present = current[&key]["value"].as_f64().filter(|v| v.is_finite() && current[&key]["unit"] == field["unit"]);
        let delta = present.zip(recommended).map(|(old, new)| new - old);
        if recommended.is_some() && delta != Some(0.0) { affected.push(key.clone()); }
        json!({"key":key,"unit":field["unit"],"current":present,"recommended":recommended,"delta":delta,"status":if locked{"locked"}else if reason.is_some(){"unavailable"}else{"available"},"reason":reason})
    }).collect();
    json!({"schemaVersion":"tuning-baseline-preview/v1","modelVersion":"rust/chassis-alignment-neutral/v1","goal":goal,"stiffness":"neutral","balance":"neutral","missingInputs":missing,"fields":fields,"affectedFields":affected,"canApply":missing.is_empty() && !affected.is_empty()})
}
