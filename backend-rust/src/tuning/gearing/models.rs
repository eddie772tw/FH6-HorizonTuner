//! Version dispatch only. Models own their targets and revalidation policies.
use super::{contracts::CandidateGearingResult, *};
use crate::tuning::aego_model::AegoModel;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObservedBounds {
    source: String,
    final_drive: contracts::RatioRange,
    gears: Vec<contracts::RatioRange>,
}

fn observed_bounds_allow(result: &GearingResult, diagnostics: &Value) -> bool {
    let Some(raw) = diagnostics.get("observedBounds") else {
        return true;
    };
    let Ok(bounds) = serde_json::from_value::<ObservedBounds>(raw.clone()) else {
        return false;
    };
    let within = |value: f64, range: &contracts::RatioRange| {
        range.min.is_finite()
            && range.max.is_finite()
            && range.min > 0.0
            && range.min <= range.max
            && range.step == 0.01
            && value >= range.min - 1e-9
            && value <= range.max + 1e-9
    };
    bounds.source == "user-observed"
        && bounds.gears.len() == result.gears.len()
        && within(result.final_drive, &bounds.final_drive)
        && result
            .gears
            .iter()
            .zip(&bounds.gears)
            .all(|(value, range)| within(*value, range))
}

pub fn unavailable(model: AegoModel, reason: impl Into<String>) -> CandidateGearingResult {
    let reason = reason.into();
    CandidateGearingResult {
        gearing: GearingResult {
            final_drive: 0.0,
            gears: vec![],
            unsupported: Some(true),
            unsupported_reason: Some(reason.clone()),
        },
        diagnostics: json!({"modelId":model.id().split('/').next(),"modelVersion":model.id(),"status":"unavailable","reason":reason}),
    }
}
fn parse<T: DeserializeOwned>(raw: &Option<Value>) -> Result<Option<T>, String> {
    raw.as_ref()
        .map(|v| serde_json::from_value(v.clone()).map_err(|e| e.to_string()))
        .transpose()
}

pub fn solve(
    model: AegoModel,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> CandidateGearingResult {
    let attempt = || -> Result<CandidateGearingResult, String> {
        Ok(match model {
            AegoModel::RallyJointV1 => rally::solve_candidate(
                count,
                params,
                max_rpm,
                correction,
                parse(&params.rally_observed_bounds)?.as_ref(),
            ),
            AegoModel::DriftWorkingV1 => drift::solve_candidate(
                count,
                params,
                max_rpm,
                parse(&params.drift_working_target)?.as_ref(),
                parse(&params.drift_observed_bounds)?.as_ref(),
            ),
            AegoModel::DragJointV1 => drag::solve_candidate(
                count,
                params,
                max_rpm,
                correction,
                parse(&params.drag_observed_bounds)?.as_ref(),
            ),
            AegoModel::RoadLaunchV3 => {
                let gearing = road::calculate(count, params, max_rpm, correction);
                let diagnostics =
                    road::versioned_diagnostics(params, max_rpm, correction, &gearing);
                CandidateGearingResult {
                    gearing,
                    diagnostics,
                }
            }
        })
    };
    let mut result = attempt().unwrap_or_else(|detail| {
        let message = match model {
            AegoModel::DriftWorkingV1 => {
                "Complete the Drift operating target and check the observed ratio bounds."
            }
            AegoModel::RallyJointV1 => "Check the observed Rally ratio bounds.",
            AegoModel::DragJointV1 => "Check the observed Drag ratio bounds.",
            _ => "The model inputs are invalid.",
        };
        let mut result = unavailable(model, message);
        result.diagnostics["inputError"] = json!(detail);
        result
    });
    let observed = match model.goal() {
        RaceGoal::Rally => params.rally_observed_bounds.as_ref(),
        RaceGoal::Drift => params.drift_observed_bounds.as_ref(),
        RaceGoal::Drag => params.drag_observed_bounds.as_ref(),
        _ => None,
    };
    if let Some(bounds) = observed {
        result.diagnostics["observedBounds"] = bounds.clone();
    }
    result
}

pub fn respects_hard_targets(
    model: AegoModel,
    gearing: &GearingResult,
    diagnostics: &Value,
) -> bool {
    if !observed_bounds_allow(gearing, diagnostics) {
        return false;
    }
    match model {
        AegoModel::RoadLaunchV3 => road::respects_hard_targets(gearing, diagnostics),
        AegoModel::RallyJointV1 => rally::respects_hard_targets(gearing, diagnostics),
        AegoModel::DriftWorkingV1 => drift::respects_hard_targets(gearing, diagnostics),
        AegoModel::DragJointV1 => drag::respects_hard_targets(gearing, diagnostics),
    }
}

pub fn adjusted_diagnostics(model: AegoModel, gearing: &GearingResult, original: &Value) -> Value {
    match model {
        AegoModel::RoadLaunchV3 => road::adjusted_diagnostics(gearing, original),
        AegoModel::RallyJointV1 => rally::adjusted_diagnostics(gearing, original),
        AegoModel::DriftWorkingV1 => drift::adjusted_diagnostics(gearing, original),
        AegoModel::DragJointV1 => drag::adjusted_diagnostics(gearing, original),
    }
}
