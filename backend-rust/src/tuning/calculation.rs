//! Stateless desktop-local calculation boundary. Never acquires telemetry receiver locks.
use super::{
    alignment::{calculate_static_alignment, Season, StaticAlignment},
    calculate_chassis_tuning, ChassisTuningResult, RaceGoal, TuningCarParams,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MechanicalRequest {
    pub schema_version: String,
    pub goal: RaceGoal,
    pub season: Season,
    pub profile: TuningCarParams,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechanicalResult {
    pub schema_version: &'static str,
    pub chassis: Option<ChassisTuningResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chassis_diagnostics: Option<serde_json::Value>,
    pub alignment: StaticAlignment,
}
pub fn calculate_mechanical(request: &MechanicalRequest) -> Result<MechanicalResult, &'static str> {
    if !["tuning-mechanical/v1", "tuning-mechanical/v2"].contains(&request.schema_version.as_str())
    {
        return Err("Unsupported tuning calculation schema");
    }
    let current = request.schema_version == "tuning-mechanical/v2";
    let calculation =
        current.then(|| super::chassis_load::calculate(request.goal, &request.profile));
    Ok(MechanicalResult {
        schema_version: if current {
            "tuning-mechanical/v2"
        } else {
            "tuning-mechanical/v1"
        },
        chassis: match &calculation {
            Some(c) => c.public_chassis(),
            None => Some(calculate_chassis_tuning(request.goal, &request.profile)),
        },
        chassis_diagnostics: calculation.map(|c| c.diagnostics),
        alignment: calculate_static_alignment(request.goal, request.season, &request.profile),
    })
}
