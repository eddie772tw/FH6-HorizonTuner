//! Goal-free allocation of caller-specified total ratios onto explicit ratio grids.
use super::super::types::GearingResult;
use super::contracts::{RatioBounds, RatioRange};

fn valid_range(range: RatioRange) -> bool {
    range.min.is_finite()
        && range.max.is_finite()
        && range.step.is_finite()
        && range.min > 0.0
        && range.max >= range.min
        && range.step > 0.0
        && (range.max - range.min) / range.step <= 100_000.0
}

fn rounded(value: f64, range: RatioRange) -> f64 {
    range.min + ((value - range.min) / range.step).round() * range.step
}

/// Preserve every supplied total ratio within the supplied relative tolerance.
/// Search final drives in distance-to-preference order, then choose the smaller
/// drive on ties. No goal-specific bounds, spacing or endpoint repair is applied.
pub fn allocate_total_ratios(
    totals: &[f64],
    bounds: RatioBounds,
    preferred_fd: f64,
    max_relative_error: f64,
) -> Option<GearingResult> {
    if totals.is_empty()
        || !valid_range(bounds.final_drive)
        || !valid_range(bounds.gears)
        || !preferred_fd.is_finite()
        || !max_relative_error.is_finite()
        || max_relative_error < 0.0
        || totals.iter().any(|v| !v.is_finite() || *v <= 0.0)
        || totals.windows(2).any(|v| v[0] <= v[1])
    {
        return None;
    }
    let range = bounds.final_drive;
    let count = ((range.max - range.min) / range.step + 1e-9).floor() as usize;
    let mut drives: Vec<f64> = (0..=count)
        .map(|index| range.min + index as f64 * range.step)
        .collect();
    drives.sort_by(|a, b| {
        let distance = (a - preferred_fd).abs() - (b - preferred_fd).abs();
        if distance.abs() < 1e-12 {
            a.total_cmp(b)
        } else {
            distance.total_cmp(&0.0)
        }
    });
    for final_drive in drives {
        let gears: Vec<f64> = totals
            .iter()
            .map(|total| rounded(total / final_drive, bounds.gears))
            .collect();
        if gears.iter().zip(totals).any(|(gear, target)| {
            !gear.is_finite()
                || *gear < bounds.gears.min - 1e-9
                || *gear > bounds.gears.max + 1e-9
                || (gear * final_drive / target - 1.0).abs() > max_relative_error + 1e-12
        }) || gears.windows(2).any(|g| g[0] <= g[1] + 1e-9)
        {
            continue;
        }
        return Some(GearingResult {
            final_drive,
            gears,
            unsupported: None,
            unsupported_reason: None,
        });
    }
    None
}
