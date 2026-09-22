use super::{matching::local_comparison, models::validate_request, store::RoadStore};
use crate::{
    error::{ApiError, ApiResult},
    telemetry::TelemetryStore,
};
use serde_json::{json, Value};

const COMPARISON_VERSION: &str = "road-comparison/descriptive-v1";
fn finite(v: Option<&Value>) -> Option<f64> {
    let x = v?.as_f64()?;
    x.is_finite().then_some(x)
}
fn median(mut values: Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(if values.len() % 2 == 1 {
        values[values.len() / 2]
    } else {
        (values[values.len() / 2 - 1] + values[values.len() / 2]) / 2.0
    })
}
fn text_set(values: Vec<String>) -> Value {
    let mut values = values;
    values.sort();
    values.dedup();
    Value::Array(values.into_iter().map(Value::String).collect())
}

pub fn compare_road_runs(
    store: &RoadStore,
    database: &TelemetryStore,
    workflow_id: &str,
    request: &Value,
) -> ApiResult<Value> {
    validate_request("comparison", request)?;
    let baseline_ids = request["baselineRunIds"]
        .as_array()
        .ok_or_else(|| ApiError::invalid("baselineRunIds must be an array"))?;
    let candidate_ids = request["candidateRunIds"]
        .as_array()
        .ok_or_else(|| ApiError::invalid("candidateRunIds must be an array"))?;
    let mut unique = std::collections::HashSet::new();
    for id in baseline_ids.iter().chain(candidate_ids) {
        if !unique.insert(id.as_str().unwrap_or("")) {
            return Err(ApiError::conflict(
                "Each independent race can appear only once in a comparison",
            ));
        }
    }
    let workflow = store.get(workflow_id, Some("workflow"), None)?;
    let get_runs = |ids: &[Value]| {
        ids.iter()
            .map(|id| store.get(id.as_str().unwrap_or(""), Some("run"), Some(workflow_id)))
            .collect::<ApiResult<Vec<_>>>()
    };
    let baseline_runs = get_runs(baseline_ids)?;
    let candidate_runs = get_runs(candidate_ids)?;
    let get_setups = |runs: &[Value]| {
        runs.iter()
            .map(|run| {
                store.get(
                    run["setupId"].as_str().unwrap_or(""),
                    Some("setup"),
                    Some(workflow_id),
                )
            })
            .collect::<ApiResult<Vec<_>>>()
    };
    let baseline_setups = get_setups(&baseline_runs)?;
    let candidate_setups = get_setups(&candidate_runs)?;
    if candidate_setups
        .iter()
        .map(|x| x["id"].clone())
        .collect::<std::collections::HashSet<_>>()
        .len()
        != 1
    {
        return Err(ApiError::conflict(
            "Compare one candidate setting version at a time",
        ));
    }
    let candidate = &candidate_setups[0];
    let baseline_id = candidate["baselineSetupId"]
        .as_str()
        .ok_or_else(|| ApiError::conflict("The candidate does not reference a frozen baseline"))?;
    let baseline = store.get(baseline_id, Some("setup"), Some(workflow_id))?;
    let basis = baseline["basisSetupId"].as_str();
    if baseline_setups
        .iter()
        .any(|s| s["id"] != baseline["id"] && Some(s["id"].as_str().unwrap_or("")) != basis)
    {
        return Err(ApiError::conflict(
            "The baseline runs do not match the candidate's frozen baseline",
        ));
    }
    if baseline_setups.iter().enumerate().any(|(i, s)| {
        Some(s["id"].as_str().unwrap_or("")) == basis
            && baseline.get("basisRunId").and_then(Value::as_str)
                != baseline_runs.get(i).and_then(|x| x["id"].as_str())
    }) {
        return Err(ApiError::conflict(
            "Confirm the frozen baseline again for additional independent runs",
        ));
    }
    let docs = store.list(Some(workflow_id), None, false)?;
    let summary_for = |id: &str| {
        docs.iter()
            .find(|d| d["kind"] == "summary" && d["runId"] == id)
            .cloned()
            .ok_or_else(|| ApiError::conflict("Finish saving every run before comparing"))
    };
    let finish_for = |id: &str| {
        docs.iter()
            .find(|d| d["kind"] == "finish" && d["runId"] == id)
    };
    let mut reasons = Vec::new();
    let mut times_a = Vec::new();
    let mut times_b = Vec::new();
    let mut summaries = Vec::new();
    let mut finishes = Vec::new();
    for (group, times) in [
        (&baseline_runs, &mut times_a),
        (&candidate_runs, &mut times_b),
    ] {
        for run in group {
            let summary = summary_for(run["id"].as_str().unwrap_or(""))?;
            summaries.push(summary.clone());
            if run["identity"] != workflow["identity"] {
                reasons.push("identity-different".into());
            }
            for key in ["otherSettings", "tires", "conditions", "driverAssists"] {
                if run.get(key).and_then(Value::as_str) != Some("unchanged") {
                    if let Some(value) = run.get(key).and_then(Value::as_str) {
                        reasons.push(format!("{key}-{value}"));
                    }
                }
            }
            let receipt = &summary["recording"];
            if receipt["droppedSamples"].as_i64().unwrap_or(0) > 0
                || receipt["failedWrites"].as_i64().unwrap_or(0) > 0
                || receipt["incompletePersistence"].as_bool() == Some(true)
            {
                reasons.push("recording-incomplete".into())
            };
            if let Some(reason) = receipt["endReason"].as_str() {
                if [
                    "identity-changed",
                    "timestamp-regressed",
                    "race-restarted",
                    "sample-limit",
                ]
                .contains(&reason)
                {
                    reasons.push(reason.into())
                }
            }
            let finish = finish_for(run["id"].as_str().unwrap_or(""));
            if let Some(f) = finish {
                finishes.push(f.clone());
                if f["clean"].as_str() != Some("confirmed") {
                    reasons.push(format!(
                        "incident-{}",
                        f["clean"].as_str().unwrap_or("unknown")
                    ));
                }
                if let Some(t) = finite(f.get("timeSeconds")) {
                    times.push(t)
                }
            } else {
                reasons.push("finish-time-unknown".into());
            }
            let coverage = &summary["raceTimeCoverage"];
            if finite(coverage.get("firstSeconds")).is_none_or(|x| x > 0.5) {
                reasons.push("recording-start-incomplete".into())
            }
            if let Some(f) = finish {
                if finite(coverage.get("lastSeconds"))
                    .is_none_or(|x| (x - f["timeSeconds"].as_f64().unwrap_or(x)).abs() > 1.0)
                {
                    reasons.push("recording-finish-incomplete".into())
                }
            }
            if summary["observations"]["quality"]["gapSeconds"]
                .as_f64()
                .unwrap_or(0.0)
                > 0.0
            {
                reasons.push("telemetry-gaps".into())
            };
            if summary["sourceSchemas"] != json!(["decoded-fh6/v1"]) {
                reasons.push("source-not-decoded".into());
            }
        }
    }
    let first_a = &baseline_runs[0];
    let first_b = &candidate_runs[0];
    let pa = database
        .get_telemetry_points(first_a["sessionId"].as_str().unwrap_or(""), None)
        .map_err(|e| ApiError::new(500, e))?;
    let pb = database
        .get_telemetry_points(first_b["sessionId"].as_str().unwrap_or(""), None)
        .map_err(|e| ApiError::new(500, e))?;
    let circuit = workflow["event"]["format"] == "circuit";
    let spatial = local_comparison(&pa, &pb, circuit);
    if spatial["routeStatus"] != "compatible" {
        reasons.push(format!(
            "route-{}",
            spatial["routeStatus"].as_str().unwrap_or("unknown")
        ));
    }
    if spatial["matchedDrivingConditions"].as_u64().unwrap_or(0) < 20 {
        reasons.push("driving-conditions-insufficient".into());
    }
    let wheels = ["FL", "FR", "RL", "RR"];
    let mut thermal = Vec::new();
    for w in wheels {
        let x = summaries.iter().find(|s| s["runId"] == first_a["id"]);
        let y = summaries.iter().find(|s| s["runId"] == first_b["id"]);
        let xval = x
            .and_then(|s| s["observations"]["wheels"].get(w))
            .and_then(|s| s.get("startTemperatureC"));
        let yval = y
            .and_then(|s| s["observations"]["wheels"].get(w))
            .and_then(|s| s.get("startTemperatureC"));
        thermal.push(finite(xval).zip(finite(yval)).map(|(a, b)| b - a));
    }
    let thermal_status = if thermal.iter().any(Option::is_none) {
        "unknown"
    } else if thermal.iter().flatten().any(|x| x.abs() > 5.0) {
        "different"
    } else {
        "similar-start"
    };
    if thermal_status != "similar-start" {
        reasons.push(format!("thermal-start-{thermal_status}"));
    }
    let mut repetition_checks = Vec::new();
    for run in baseline_runs
        .iter()
        .skip(1)
        .chain(candidate_runs.iter().skip(1))
    {
        let points = database
            .get_telemetry_points(run["sessionId"].as_str().unwrap_or(""), None)
            .map_err(|e| ApiError::new(500, e))?;
        let local = local_comparison(&pa, &points, circuit);
        if local["routeStatus"] != "compatible" {
            reasons.push("repetition-route-incompatible".into())
        }
        if local["matchedDrivingConditions"].as_u64().unwrap_or(0) < 20 {
            reasons.push("driving-conditions-insufficient".into())
        }
        repetition_checks.push(json!({"runId":run["id"],"referenceRunId":first_a["id"],"local":local,"thermalStartChangeC":[null,null,null,null]}));
    }
    let delta = median(times_b.clone())
        .zip(median(times_a.clone()))
        .map(|(b, a)| b - a);
    let amin = times_a.iter().copied().fold(f64::INFINITY, f64::min);
    let amax = times_a.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let bmin = times_b.iter().copied().fold(f64::INFINITY, f64::min);
    let bmax = times_b.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let repeated = baseline_runs.len() >= 3 && candidate_runs.len() >= 3;
    let direction = repeated
        && times_a.len() == baseline_runs.len()
        && times_b.len() == candidate_runs.len()
        && (bmax < amin || bmin > amax);
    let mut conclusion = if !reasons.is_empty() {
        "insufficient-data"
    } else if delta.is_none() || delta.is_some_and(|x| x.abs() < 0.001) {
        "difference-insufficient"
    } else if delta.unwrap() < 0.0 {
        "provisional-keep"
    } else {
        "candidate-slower"
    };
    if conclusion == "provisional-keep"
        && spatial["meanNormalizedAngleChange"]
            .as_f64()
            .is_some_and(|x| x >= 0.0005)
    {
        conclusion = "tradeoff";
    }
    let summary_ids = summaries
        .iter()
        .map(|x| x["id"].clone())
        .collect::<Vec<_>>();
    let finish_ids = finishes.iter().map(|x| x["id"].clone()).collect::<Vec<_>>();
    store.append("comparison",workflow_id,&json!({"methodVersion":COMPARISON_VERSION,"baselineRunIds":baseline_ids,"candidateRunIds":candidate_ids,"baselineSetupId":baseline["id"],"candidateSetupId":candidate["id"],"summaryIds":summary_ids,"finishIds":finish_ids,"conclusion":conclusion,"reasons":text_set(reasons),"evidenceLevel":"descriptive","independentRuns":{"baseline":baseline_ids.len(),"candidate":candidate_ids.len()},"time":{"baselineSeconds":times_a,"candidateSeconds":times_b,"medianChangeSeconds":delta,"source":"game-confirmed","repeatedDirectionConsistent":direction},"thermalStart":{"status":thermal_status,"changeC":thermal,"screeningDifferenceC":5},"local":spatial,"localRunIds":[first_a["id"],first_b["id"]],"repetitionChecks":repetition_checks,"nextAction":if conclusion=="insufficient-data"{"review-required-condition"}else{"keep-or-revisit-baseline"},"limitations":["Descriptive evidence only; no calibrated practical-difference or uncertainty model is available.","Repeated laps and locations are not independent races.","All runs and thermal changes remain available; later tyre temperatures are not matched away."]}),None)
}
