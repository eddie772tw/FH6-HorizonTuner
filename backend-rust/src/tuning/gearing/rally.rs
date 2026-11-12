use super::super::types::*;

/// Production compatibility owner. New candidate selection belongs to PR 6.
pub(super) fn calculate(
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    super::legacy::calculate_aego_gearing_v2(RaceGoal::Rally, count, params, max_rpm, correction)
}
