//! AEGO routing. Each model owns its policy; nothing adjusts ratios after dispatch.
pub mod allocation;
pub mod contracts;
pub mod drag;
pub mod drift;
pub mod kinematics;
mod legacy;
pub mod rally;
pub mod road;

use super::types::*;
pub use kinematics::{calc_gear_rpm, calc_gear_speed};
pub use legacy::calculate_aego_gearing_v2;
pub use road::{get_target_top_gear_ratio, road_launch_diagnostics};

/// Current production selection. Candidate models remain explicit opt-in APIs.
pub fn calculate_aego_gearing(
    goal: RaceGoal,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    match goal {
        RaceGoal::Road => road::calculate(count, params, max_rpm, correction),
        RaceGoal::Rally => rally::calculate(count, params, max_rpm, correction),
        RaceGoal::Drift => drift::calculate(count, params, max_rpm, correction),
        RaceGoal::Drag => drag::calculate(count, params, max_rpm, correction),
        RaceGoal::DangerSign => legacy::calculate_aego_gearing_v2(
            RaceGoal::DangerSign,
            count,
            params,
            max_rpm,
            correction,
        ),
    }
}
