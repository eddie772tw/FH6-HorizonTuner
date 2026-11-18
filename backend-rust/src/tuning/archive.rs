//! Retired identities are metadata, never executable model selectors.
use crate::error::{ApiError, ApiResult};
use serde_json::{json, Value};

pub const RETIRED_MODELS: &[&str] = &[
    "aego-road-joint/v2",
    "aego-rally/v1",
    "aego-drift/v1",
    "aego-drag/v1",
];
pub const RETIRED_FORMULAS: &[&str] = &[
    "tuningMath/measured-workflow-v1",
    "ev/measured-workflow-v1",
    "rust/ice-measured-workflow-v1",
    "rust/ice-measured-workflow-v2",
    "rust/ice-measured-workflow-v3",
];
pub const RETIRED_MESSAGE: &str = "Tuning model retired. Historical records are read-only and not validated for current use. Recalculate with qualified evidence using solve workflow or calculate_tuning_workflow to create a new recommendation.";

pub fn is_retired(rec: &Value) -> bool {
    rec["formulaVersion"]
        .as_str()
        .is_some_and(|s| RETIRED_FORMULAS.contains(&s))
        || rec["inputSnapshot"]["gearingModelVersion"]
            .as_str()
            .is_some_and(|s| RETIRED_MODELS.contains(&s))
}

pub fn ensure_active(rec: &Value) -> ApiResult<()> {
    if is_retired(rec) {
        return Err(ApiError::new(410, RETIRED_MESSAGE));
    }
    Ok(())
}

/// Read original documents without replay, migration or qualification. App dispatch
/// calls this before taking the telemetry engine lock.
pub fn list(store: &crate::road::RoadStore) -> ApiResult<Value> {
    let mut roots = store.list(None, Some("workflow"), false)?;
    roots.extend(store.list(None, Some("compatibility"), false)?);
    let mut archives = Vec::new();
    for record in roots
        .into_iter()
        .filter(|record| is_retired(&record["recommendation"]))
    {
        let mut item = json!({"status":"retired","validated":false,"record":record});
        if record["kind"] == "workflow" {
            let id = record["id"]
                .as_str()
                .ok_or_else(|| ApiError::invalid("Archived workflow has no ID"))?;
            item["documents"] = json!(store.list(Some(id), None, false)?);
        }
        archives.push(item);
    }
    Ok(Value::Array(archives))
}
