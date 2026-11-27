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

fn grid_count(range: RatioRange) -> usize {
    let raw = ((range.max - range.min) / range.step + 1e-9).floor() as usize;
    if raw > 0 && range.min + raw as f64 * range.step > range.max + range.step * 1e-9 {
        raw - 1
    } else {
        raw
    }
}

fn grid_value(range: RatioRange, index: usize) -> f64 {
    (range.min + index as f64 * range.step).clamp(range.min, range.max)
}

fn nearest_grid_point(value: f64, range: RatioRange, max_index: usize) -> (usize, f64) {
    let index = ((value - range.min) / range.step)
        .round()
        .clamp(0.0, max_index as f64) as usize;
    (index, grid_value(range, index))
}

fn within_relative_error(gear: f64, final_drive: f64, target: f64, max_error: f64) -> bool {
    let product = gear * final_drive;
    let ratio = if product.is_normal() {
        product / target
    } else {
        let (small, large) = if gear <= final_drive {
            (gear, final_drive)
        } else {
            (final_drive, gear)
        };
        if !product.is_finite() {
            (large / target) * small
        } else {
            (small / target) * large
        }
    };
    ratio.is_finite() && (ratio - 1.0).abs() <= max_error + 1e-12
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
    let fd_range = bounds.final_drive;
    let fd_count = grid_count(fd_range);
    let gear_count = grid_count(bounds.gears);
    if totals.len() > gear_count + 1 {
        return None;
    }
    let target_fd = preferred_fd.clamp(fd_range.min, fd_range.max);
    let raw_pos = (target_fd - fd_range.min) / fd_range.step;
    let half = (raw_pos * 2.0).round();
    let target_pos = if (raw_pos * 2.0 - half).abs() < 1e-10 {
        half * 0.5
    } else {
        raw_pos
    };
    let mut drive_indices: Vec<usize> = (0..=fd_count).collect();
    drive_indices.sort_by(|a, b| {
        let da = (*a as f64 - target_pos).abs();
        let db = (*b as f64 - target_pos).abs();
        da.total_cmp(&db).then_with(|| a.cmp(b))
    });
    for drive_index in drive_indices {
        let final_drive = grid_value(fd_range, drive_index);
        let mapped: Vec<(usize, f64)> = totals
            .iter()
            .map(|total| nearest_grid_point(total / final_drive, bounds.gears, gear_count))
            .collect();
        if mapped.iter().zip(totals).any(|((_, gear), target)| {
            !gear.is_finite()
                || !within_relative_error(*gear, final_drive, *target, max_relative_error)
        }) || mapped
            .windows(2)
            .any(|g| g[0].0 <= g[1].0 || !(g[0].1 > g[1].1))
        {
            continue;
        }
        return Some(GearingResult {
            final_drive,
            gears: mapped.into_iter().map(|(_, gear)| gear).collect(),
            unsupported: None,
            unsupported_reason: None,
        });
    }
    None
}
