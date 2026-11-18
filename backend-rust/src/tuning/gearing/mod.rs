//! AEGO routing. Each model owns its policy; nothing adjusts ratios after dispatch.
pub mod allocation;
pub mod contracts;
mod danger_sign;
pub mod drag;
pub mod drift;
pub mod kinematics;
pub mod models;
pub mod rally;
pub mod road;

use super::types::*;
pub use kinematics::{calc_gear_rpm, calc_gear_speed};
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
        None => danger_sign::calculate(count, params, max_rpm, correction),
    }
}
