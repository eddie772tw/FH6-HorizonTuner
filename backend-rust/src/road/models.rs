use crate::error::{ApiError, ApiResult};
use serde_json::{Map, Value};

fn as_obj<'a>(v: &'a Value) -> ApiResult<&'a Map<String, Value>> {
    v.as_object()
        .ok_or_else(|| ApiError::invalid("Request body must be an object"))
}
fn need<'a>(o: &'a Map<String, Value>, k: &str) -> ApiResult<&'a Value> {
    o.get(k)
        .ok_or_else(|| ApiError::invalid(format!("Field '{k}' is required")))
}
fn text(o: &Map<String, Value>, k: &str, max: usize) -> ApiResult<String> {
    let x = need(o, k)?
        .as_str()
        .ok_or_else(|| ApiError::invalid(format!("Field '{k}' must be a string")))?;
    if x.is_empty() || x.chars().count() > max {
        Err(ApiError::invalid(format!("Field '{k}' has invalid length")))
    } else {
        Ok(x.into())
    }
}
fn num(v: &Value, k: &str) -> ApiResult<f64> {
    let x = v
        .as_f64()
        .ok_or_else(|| ApiError::invalid(format!("Field '{k}' must be numeric")))?;
    if x.is_finite() {
        Ok(x)
    } else {
        Err(ApiError::invalid(format!("Field '{k}' must be finite")))
    }
}
fn child<'a>(o: &'a Map<String, Value>, k: &str) -> ApiResult<&'a Map<String, Value>> {
    as_obj(need(o, k)?)
}
fn allowed(parameter: &str, unit: &str) -> bool {
    match parameter.split('.').next().unwrap_or("") {
        "pressure" => ["psi", "bar", "kPa"].contains(&unit),
        "spring" => ["kgf/mm", "lb/in", "N/mm"].contains(&unit),
        "height" => ["cm", "in"].contains(&unit),
        "arb" | "rebound" | "bump" => unit == "slider",
        "diff" => unit == "%",
        "camber" | "toe" | "caster" => unit == "deg",
        "gearing" => unit == "ratio",
        _ => false,
    }
}
fn valid_setting(o: &Map<String, Value>) -> ApiResult<()> {
    let value = num(need(o, "value")?, "value")?;
    let unit = text(o, "unit", 16)?;
    let min = num(need(o, "minimum")?, "minimum")?;
    let max = num(need(o, "maximum")?, "maximum")?;
    let step = num(need(o, "step")?, "step")?;
    if min >= max
        || value < min
        || value > max
        || step <= 0.0
        || step > max - min
        || ((value - min) / step - ((value - min) / step).round()).abs() > 1e-5
    {
        return Err(ApiError::invalid("Invalid confirmed game setting range"));
    }
    if o.get("source")
        .is_some_and(|v| v.as_str() != Some("game-confirmed"))
    {
        return Err(ApiError::invalid("Invalid setting source"));
    }
    if unit.is_empty() {
        return Err(ApiError::invalid("Setting unit is required"));
    }
    Ok(())
}

pub fn validate_request(kind: &str, body: &Value) -> ApiResult<()> {
    let o = as_obj(body)?;
    match kind {
        "workflow" => {
            let id = child(o, "identity")?;
            let ordinal = num(need(id, "ordinal")?, "ordinal")?;
            let pi = num(need(id, "performanceIndex")?, "performanceIndex")?;
            let drivetrain = num(need(id, "drivetrain")?, "drivetrain")?;
            if ordinal <= 0.0
                || ordinal.fract() != 0.0
                || pi < 0.0
                || pi > 9999.0
                || pi.fract() != 0.0
                || drivetrain < 0.0
                || drivetrain > 2.0
                || drivetrain.fract() != 0.0
            {
                return Err(ApiError::invalid("Invalid road identity"));
            }
            text(o, "carName", 160)?;
            let event = child(o, "event")?;
            text(event, "name", 160)?;
            if !["circuit", "sprint"]
                .contains(&event.get("format").and_then(Value::as_str).unwrap_or(""))
            {
                return Err(ApiError::invalid("Invalid road event format"));
            }
            if let Some(r) = o.get("recommendation").filter(|v| !v.is_null()) {
                let rec = as_obj(r)?;
                if text(rec, "formulaVersion", 80)? != "tuningMath/measured-workflow-v1" {
                    return Err(ApiError::invalid("Unsupported recommendation formula"));
                }
                let fields = child(rec, "fields")?;
                if fields.is_empty() || fields.len() > 64 {
                    return Err(ApiError::invalid("Recommendation fields are required"));
                }
                for (k, v) in fields {
                    let f = as_obj(v)?;
                    let unit = text(f, "unit", 16)?;
                    if !allowed(k, &unit) {
                        return Err(ApiError::invalid(
                            "The selected unit does not match this game control",
                        ));
                    }
                    num(need(f, "value")?, "value")?;
                }
            }
        }
        "candidate" => {
            text(o, "baselineRunId", 80)?;
            let parameter = text(o, "parameter", 64)?;
            if !parameter
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic())
                || !parameter
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
            {
                return Err(ApiError::invalid("Invalid candidate parameter"));
            }
            let base = child(o, "baseline")?;
            valid_setting(base)?;
            if !allowed(&parameter, base["unit"].as_str().unwrap_or("")) {
                return Err(ApiError::invalid(
                    "The selected unit does not match this game control",
                ));
            }
            if ["diff.acceleration", "diff.deceleration"].contains(&parameter.as_str()) {
                return Err(ApiError::invalid(
                    "Choose the front or rear differential control explicitly",
                ));
            }
            let candidate = num(need(o, "candidateValue")?, "candidateValue")?;
            let mut changed = base.clone();
            changed.insert("value".into(), Value::from(candidate));
            valid_setting(&changed)?;
            if (candidate - base["value"].as_f64().unwrap_or(candidate)).abs() < 1e-12 {
                return Err(ApiError::invalid(
                    "The candidate must change the selected parameter",
                ));
            }
            if need(o, "baselineValueUnchanged")?.as_bool() != Some(true) {
                return Err(ApiError::invalid("baselineValueUnchanged must be true"));
            }
            let source = text(o, "source", 64)?;
            if !["user-specified", "one-game-step-exploration"].contains(&source.as_str()) {
                return Err(ApiError::invalid("Invalid candidate source"));
            }
            if source == "one-game-step-exploration"
                && ((candidate - base["value"].as_f64().unwrap_or(candidate)).abs()
                    - base["step"].as_f64().unwrap_or(0.0))
                .abs()
                    > 1e-6
            {
                return Err(ApiError::invalid(
                    "This exploration rule changes exactly one confirmed game step",
                ));
            }
            text(o, "hypothesis", 400)?;
        }
        "start" => {
            text(o, "setupId", 80)?;
            if need(o, "settingsConfirmed")?.as_bool() != Some(true) {
                return Err(ApiError::invalid("settingsConfirmed must be true"));
            }
        }
        "finish" => {
            if need(o, "completed")?.as_bool() != Some(true) {
                return Err(ApiError::invalid("completed must be true"));
            }
            let t = num(need(o, "timeSeconds")?, "timeSeconds")?;
            if !(t > 0.0 && t <= 86400.0) {
                return Err(ApiError::invalid("Invalid timeSeconds"));
            }
        }
        "comparison" => {
            let a = need(o, "baselineRunIds")?
                .as_array()
                .ok_or_else(|| ApiError::invalid("baselineRunIds must be an array"))?;
            let b = need(o, "candidateRunIds")?
                .as_array()
                .ok_or_else(|| ApiError::invalid("candidateRunIds must be an array"))?;
            if a.is_empty() || b.is_empty() || a.len() > 20 || b.len() > 20 {
                return Err(ApiError::invalid("At least one run is required"));
            }
        }
        "decision" => {
            text(o, "reportId", 80)?;
            if !["keep-baseline", "keep-candidate", "retest-baseline"]
                .contains(&text(o, "choice", 32)?.as_str())
            {
                return Err(ApiError::invalid("Invalid decision"));
            }
        }
        "compatibility" => {
            if !["Rally", "Drag", "Drift"].contains(&text(o, "discipline", 16)?.as_str()) {
                return Err(ApiError::invalid("Invalid discipline"));
            }
            child(o, "recommendation")?;
        }
        "engine" => {
            let item = child(o, "observation")?;
            let capture = child(o, "capture")?;
            let data = child(item, "data")?;
            let metadata = child(capture, "metadata")?;
            let refs = child(capture, "references")?;
            if item.get("schema").and_then(Value::as_str) != Some("engine-observation/v1")
                || item.get("source").and_then(Value::as_str) != Some("measured")
                || item.get("id").and_then(Value::as_str).is_none()
                || item.get("dependencyKey").and_then(Value::as_str).is_none()
                || capture.get("schemaVersion").and_then(Value::as_str) != Some("tuning-capture/v1")
                || refs.get("engineObservationId") != item.get("id")
                || refs.get("dependencyKey") != item.get("dependencyKey")
                || metadata.get("carId") != item.get("carId")
                || data.get("carId") != item.get("carId")
                || data.get("status").and_then(Value::as_str) != Some("ready")
            {
                return Err(ApiError::invalid(
                    "A completed engine observation and its capture are required",
                ));
            }
            let limit = num(need(data, "engineMaxRpm")?, "engineMaxRpm")?;
            if num(need(data, "acceptedMs")?, "acceptedMs")? < 6000.0 || limit <= 0.0 {
                return Err(ApiError::invalid(
                    "A completed engine observation and its capture are required",
                ));
            }
            let identity = child(data, "identity")?;
            if identity.get("ordinal").map(Value::to_string)
                != item.get("carId").and_then(Value::as_str).map(str::to_owned)
            {
                return Err(ApiError::invalid(
                    "A completed engine observation and its capture are required",
                ));
            }
            let bins = need(data, "bins")?.as_array().ok_or_else(|| {
                ApiError::invalid("A completed engine observation and its capture are required")
            })?;
            let adaptive = data
                .get("powerDropoffDetected")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || data
                    .get("cutoffDetected")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
            if bins.len() < (if adaptive { 6 } else { 8 }) || bins.len() > 16 {
                return Err(ApiError::invalid(
                    "A completed engine observation and its capture are required",
                ));
            }
            if capture
                .get("samples")
                .and_then(Value::as_array)
                .is_none_or(|x| x.is_empty() || x.len() > 30000)
            {
                return Err(ApiError::invalid(
                    "A completed engine observation and its capture are required",
                ));
            }
        }
        _ => {}
    }
    Ok(())
}
