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
    pub chassis: ChassisTuningResult,
    pub alignment: StaticAlignment,
}
pub fn calculate_mechanical(request: &MechanicalRequest) -> Result<MechanicalResult, &'static str> {
    if request.schema_version != "tuning-mechanical/v1" {
        return Err("Unsupported tuning calculation schema");
    }
    Ok(MechanicalResult {
        schema_version: "tuning-mechanical/v1",
        chassis: calculate_chassis_tuning(request.goal, &request.profile),
        alignment: calculate_static_alignment(request.goal, request.season, &request.profile),
    })
}
