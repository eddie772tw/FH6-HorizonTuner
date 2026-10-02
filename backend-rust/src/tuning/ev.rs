//! Independent measured fixed-ratio EV model. No ICE peak-RPM gearing heuristics.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvGearboxSetup {
    pub final_drive: Option<f64>,
    pub gear_ratios: Vec<Option<f64>>,
    pub final_drive_adjustable: bool,
    pub gear_adjustable: Vec<bool>,
    pub all_forward_gears_confirmed: bool,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EvMoments {
    pub count: usize,
    pub mean: f64,
    pub m2: f64,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvCurveBin {
    pub rpm: f64,
    pub power_watts: f64,
    pub torque_newtons: f64,
    pub count: usize,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvGearMeasurement {
    pub gear: usize,
    pub accepted_ms: f64,
    pub positive_samples: usize,
    pub zero_output_samples: usize,
    pub lowest_rpm: f64,
    pub highest_rpm: f64,
    pub reported_max_rpm: f64,
    pub cutoff: EvMoments,
    pub rpm_per_kmh: EvMoments,
    pub front_ratio: EvMoments,
    pub rear_ratio: EvMoments,
    pub curve: Vec<EvCurveBin>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvGearingInput {
    pub setup: EvGearboxSetup,
    pub candidate_final_drive: Option<f64>,
    pub measurements: Vec<EvGearMeasurement>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvGearEnvelope {
    pub gear: usize,
    pub lowest_rpm: f64,
    pub highest_rpm: f64,
    pub power_band_start_rpm: f64,
    pub power_band_end_rpm: f64,
    pub peak_power_kw: f64,
    pub bound_rpm: f64,
    pub bound_kind: String,
    pub baseline_rpm_per_kmh: f64,
    pub bound_speed_kmh: f64,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvGearingResult {
    pub model: String,
    pub basis: String,
    pub final_drive: Option<f64>,
    pub gears: Vec<Option<f64>>,
    pub adjustability: EvAdjustability,
    pub envelopes: Vec<EvGearEnvelope>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvAdjustability {
    pub final_drive: bool,
    pub gears: Vec<bool>,
}
fn positive(n: f64) -> bool {
    n.is_finite() && n > 0.0
}
fn stable(s: &EvMoments) -> bool {
    s.count >= 30
        && positive(s.mean)
        && s.m2.is_finite()
        && s.m2 >= 0.0
        && (s.m2 / s.count as f64).sqrt() / s.mean <= 0.02
}
pub fn ready(g: &EvGearMeasurement) -> bool {
    g.accepted_ms.is_finite()
        && g.accepted_ms >= 3000.0
        && g.positive_samples >= 90
        && positive(g.reported_max_rpm)
        && g.reported_max_rpm <= 100_000.0
        && positive(g.lowest_rpm)
        && positive(g.highest_rpm)
        && g.lowest_rpm <= g.reported_max_rpm * 0.4
        && g.highest_rpm >= g.reported_max_rpm * 0.85
        && g.highest_rpm <= g.reported_max_rpm * 1.03
        && g.curve.iter().filter(|b| b.count >= 3).count() >= 8
        && g.curve.len() <= 207
        && g.curve.iter().all(|b| {
            b.count > 0 && positive(b.rpm) && positive(b.power_watts) && positive(b.torque_newtons)
        })
        && stable(&g.rpm_per_kmh)
        && stable(&g.front_ratio)
        && stable(&g.rear_ratio)
}

pub fn calculate_ev_gearing(input: &EvGearingInput) -> Option<EvGearingResult> {
    let setup = &input.setup;
    let ratios = &setup.gear_ratios;
    let valid_ratio = |n: Option<f64>| n.is_none_or(|n| positive(n) && n <= 20.0);
    let changed = input.candidate_final_drive != setup.final_drive;
    if !setup.all_forward_gears_confirmed
        || !valid_ratio(setup.final_drive)
        || !valid_ratio(input.candidate_final_drive)
        || (changed
            && (!setup.final_drive_adjustable
                || setup.final_drive.is_none()
                || input.candidate_final_drive.is_none()))
        || !(1..=10).contains(&ratios.len())
        || !ratios.iter().all(|r| valid_ratio(*r))
        || ratios
            .windows(2)
            .any(|w| matches!((w[0], w[1]), (Some(a), Some(b)) if b >= a))
        || setup.gear_adjustable.len() != ratios.len()
        || input.measurements.len() != ratios.len()
    {
        return None;
    }
    let mut ordered: Vec<_> = input.measurements.iter().collect();
    ordered.sort_by_key(|g| g.gear);
    if ordered
        .iter()
        .enumerate()
        .any(|(i, g)| g.gear != i + 1 || !ready(g))
    {
        return None;
    }
    let known: Vec<_> = ordered
        .iter()
        .zip(ratios)
        .filter_map(|(g, r)| r.map(|r| g.rpm_per_kmh.mean / r))
        .collect();
    if known.iter().any(|r| (r / known[0] - 1.0).abs() > 0.05) {
        return None;
    }
    let scale = if changed {
        input.candidate_final_drive? / setup.final_drive?
    } else {
        1.0
    };
    let envelopes = ordered
        .iter()
        .map(|g| {
            let peak = g
                .curve
                .iter()
                .filter(|b| b.count >= 3)
                .map(|b| b.power_watts)
                .fold(0.0, f64::max);
            let band: Vec<_> = g
                .curve
                .iter()
                .filter(|b| b.count >= 3 && b.power_watts >= peak * 0.95)
                .collect();
            let cut = g.cutoff.count >= 3 && positive(g.cutoff.mean);
            let bound_rpm = if cut { g.cutoff.mean } else { g.highest_rpm };
            EvGearEnvelope {
                gear: g.gear,
                lowest_rpm: g.lowest_rpm,
                highest_rpm: g.highest_rpm,
                power_band_start_rpm: band.first().map_or(g.highest_rpm, |b| b.rpm),
                power_band_end_rpm: band.last().map_or(g.highest_rpm, |b| b.rpm),
                peak_power_kw: peak / 1000.0,
                bound_rpm,
                bound_kind: if cut {
                    "observed-cut"
                } else {
                    "measured-range"
                }
                .into(),
                baseline_rpm_per_kmh: g.rpm_per_kmh.mean,
                bound_speed_kmh: bound_rpm / (g.rpm_per_kmh.mean * scale),
            }
        })
        .collect();
    Some(EvGearingResult {
        model: "ev/v1".into(),
        basis: if input.candidate_final_drive == setup.final_drive {
            "measured-baseline"
        } else {
            "ratio-preview"
        }
        .into(),
        final_drive: input.candidate_final_drive,
        gears: ratios.clone(),
        adjustability: EvAdjustability {
            final_drive: setup.final_drive_adjustable,
            gears: setup.gear_adjustable.clone(),
        },
        envelopes,
    })
}
