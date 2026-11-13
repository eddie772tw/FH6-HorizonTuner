//! AEGO routing. Each model owns its policy; nothing adjusts ratios after dispatch.
pub mod allocation;
pub mod contracts;
pub mod drag;
pub mod drift;
pub mod kinematics;
mod legacy;
pub mod models;
pub mod rally;
pub mod road;

use super::types::*;
pub use kinematics::{calc_gear_rpm, calc_gear_speed};
pub use legacy::calculate_aego_gearing_v2;
pub use road::{get_target_top_gear_ratio, road_launch_diagnostics};

/// Current independent ICE models. Formal callers also require qualified workflow evidence.
pub fn calculate_aego_gearing(
    goal: RaceGoal,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    match super::aego_model::AegoModel::production(goal) {
        Some(model) => models::solve(model, count, params, max_rpm, correction).gearing,
        None => legacy::calculate_aego_gearing_v2(goal, count, params, max_rpm, correction),
    }
}

/// Frozen pre-stack production owner for characterization and historical replay.
pub fn calculate_aego_gearing_historical(
    goal: RaceGoal,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    if goal == RaceGoal::Road {
        road::calculate(count, params, max_rpm, correction)
    } else {
        legacy::calculate_aego_gearing_v2(goal, count, params, max_rpm, correction)
    }
}
