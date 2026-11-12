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

// Rally joint endpoint allocation. No Road launch or post-solve RPM policy.
use super::contracts::{CandidateGearingResult, RatioRange};
use super::kinematics::calc_gear_speed;
use crate::tuning::{GearingResult, GearingSecondaryCorrection, RallyProfile};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::f64::consts::PI;

/// Refresh only selected-output diagnostics; targets come from the canonical solve.
pub fn adjusted_diagnostics(result: &GearingResult, original: &Value) -> Value {
    let mut d = original.clone();
    if !respects_hard_targets(result, original) {
        d["status"] = json!("unavailable");
        d["reason"] = json!("Adjusted Rally ratios violate the original rounded endpoint");
        for key in ["actualSpeedKmh", "endpointErrorKmh", "actualTotalRatio"] {
            d[key] = Value::Null;
        }
        return d;
    }
    let actual = calc_gear_speed(
        d["referenceRpm"].as_f64().unwrap(),
        *result.gears.last().unwrap(),
        result.final_drive,
        d["tireRadiusM"].as_f64().unwrap(),
    ) * 3.6;
    d["actualSpeedKmh"] = json!(actual);
    d["endpointErrorKmh"] = json!(actual - d["targetSpeedKmh"].as_f64().unwrap());
    d["actualTotalRatio"] = json!(result.final_drive * result.gears.last().unwrap());
    let step = d["preferredStepRatio"].as_f64().unwrap();
    let limited = (result.gears[0] - 2.7).abs() > 0.005
        || result
            .gears
            .windows(2)
            .any(|g| (g[1] / g[0] - step).abs() > 0.01);
    d["shapePreferenceLimited"] = json!(limited);
    d["status"] = json!(if limited { "limited" } else { "available" });
    d["outsideModelFinalDrivePrior"] = json!(result.final_drive < 2.0 || result.final_drive > 6.5);
    d["finalDrive"] = json!(result.final_drive);
    d["gears"] = json!(result.gears);
    d
}

/// Actual slider observations, not a claim about game-wide hardware limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RallyObservedBounds {
    pub source: String,
    pub final_drive: RatioRange,
    pub gears: Vec<RatioRange>,
}

fn ticks(range: &RatioRange) -> Option<(i64, i64)> {
    let lo = range.min * 100.0;
    let hi = range.max * 100.0;
    (range.min.is_finite()
        && range.max.is_finite()
        && range.min > 0.0
        && range.step == 0.01
        && lo <= hi
        && hi <= i32::MAX as f64
        && hi - lo <= 10_000.0
        && (lo - lo.round()).abs() < 1e-7
        && (hi - hi.round()).abs() < 1e-7)
        .then_some((lo.round() as i64, hi.round() as i64))
}

fn unavailable(reason: &'static str, mut diagnostics: Value) -> CandidateGearingResult {
    diagnostics["status"] = json!("unavailable");
    diagnostics["reason"] = json!(reason);
    CandidateGearingResult {
        gearing: GearingResult {
            final_drive: 0.0,
            gears: vec![],
            unsupported: Some(true),
            unsupported_reason: Some(reason.into()),
        },
        diagnostics,
    }
}

/// Revalidate an equivalent allocation using diagnostics rebuilt by this model.
/// The caller must not pass client-supplied or previously saved diagnostics.
pub fn respects_hard_targets(gearing: &GearingResult, diagnostics: &Value) -> bool {
    let Some(count) = diagnostics["gearCount"].as_u64().map(|v| v as usize) else {
        return false;
    };
    let positive = |key: &str| {
        diagnostics[key]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.0)
    };
    let (Some(rpm), Some(max_rpm), Some(radius), Some(target), Some(tolerance)) = (
        positive("referenceRpm"),
        positive("maxRpm"),
        positive("tireRadiusM"),
        positive("targetSpeedKmh"),
        positive("endpointToleranceKmh"),
    ) else {
        return false;
    };
    let on_grid =
        |v: f64| v.is_finite() && v > 0.0 && (v * 100.0 - (v * 100.0).round()).abs() < 1e-7;
    if diagnostics["modelVersion"] != "aego-rally-joint/v1"
        || !["available", "limited"]
            .iter()
            .any(|s| diagnostics["status"] == *s)
        || !(4..=10).contains(&count)
        || rpm > max_rpm
        || (tolerance - 1.0_f64.max(target * 0.01)).abs() > 1e-9
        || gearing.unsupported == Some(true)
        || gearing.gears.len() != count
        || !on_grid(gearing.final_drive)
        || !gearing.gears.iter().all(|v| on_grid(*v))
        || !gearing.gears.windows(2).all(|g| g[0] > g[1])
    {
        return false;
    }
    let speed = calc_gear_speed(rpm, gearing.gears[count - 1], gearing.final_drive, radius) * 3.6;
    speed.is_finite() && speed > 0.0 && (speed - target).abs() <= tolerance + 1e-9
}

/// Candidate only: the production dispatcher remains frozen until stack PR 6.
/// Hard order: valid inputs, observed bounds/grid/order, rounded endpoint tolerance.
/// Only then minimize deviations from the inherited 2.7 / ratio-step shape.
pub fn solve_candidate(
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
    observed: Option<&RallyObservedBounds>,
) -> CandidateGearingResult {
    let mut diagnostic = json!({
        "modelId": "aego-rally-joint", "modelVersion": "aego-rally-joint/v1", "gearCount": count,
        "status": "unavailable", "speedSemantics": "pure-rolling-wheel-speed-at-peak-power-rpm",
        "targetSource": "inherited-rally-engineering-prior",
        "boundsSource": if observed.is_some() { "user-observed" } else { "model-prior-not-game-observation" },
        "hardwareVerified": false, "observedBoundsApplied": observed.is_some(), "performanceValidated": false,
        "constraints": ["positive-finite-inputs", "0.01-grid", "strictly-decreasing-gears", "rounded-endpoint-max-1kmh-or-1percent"],
        "modelPrior": { "finalDriveMin": 2.0, "finalDriveMax": 6.5, "gearMin": 0.1, "gearMax": 6.0 },
        "preferenceSource": "inherited-rally-2.7-first-and-torque-per-hp-step"
    });
    let positive = |v: Option<f64>| v.filter(|v| v.is_finite() && *v > 0.0);
    let Some(hp) = positive(params.max_hp) else {
        return unavailable("Rally requires positive finite engine power", diagnostic);
    };
    let Some(torque) = positive(params.max_torque) else {
        return unavailable("Rally requires positive finite engine torque", diagnostic);
    };
    let Some(rpm) = positive(params.max_hp_rpm) else {
        return unavailable(
            "Rally requires a positive finite peak-power RPM",
            diagnostic,
        );
    };
    if !(4..=10).contains(&count)
        || !max_rpm.is_finite()
        || max_rpm <= 0.0
        || rpm > max_rpm
        || positive(params.weight).is_none()
        || params
            .weight_distribution
            .is_some_and(|v| !v.is_finite() || v <= 0.0 || v >= 100.0)
        || params.is_electric == Some(true)
        || crate::tuning::cvt::is_cvt(params)
    {
        return unavailable(
            "Rally requires valid discrete ICE, vehicle, RPM and 4-10 gear inputs",
            diagnostic,
        );
    }
    let drive = params.drivetrain.as_deref().unwrap_or("");
    if !["FWD", "RWD", "AWD"].contains(&drive) {
        return unavailable(
            "Rally requires an explicit FWD, RWD or AWD drivetrain",
            diagnostic,
        );
    }
    let (width, aspect, rim, axle) = if drive == "FWD" {
        (
            params.front_tire_width,
            params.front_tire_aspect,
            params.front_tire_rim,
            "front",
        )
    } else {
        (
            params.rear_tire_width,
            params.rear_tire_aspect,
            params.rear_tire_rim,
            "rear",
        )
    };
    let (Some(width), Some(aspect), Some(rim)) = (positive(width), positive(aspect), positive(rim))
    else {
        return unavailable(
            "Rally requires explicit positive driven-axle tire dimensions",
            diagnostic,
        );
    };
    let circumference = (width * aspect / 100.0 * 2.0 + rim * 25.4) * PI / 1000.0;
    if !circumference.is_finite() || circumference <= 0.0 {
        return unavailable("Rally tire circumference is invalid", diagnostic);
    }
    let cross = params.rally_profile == Some(RallyProfile::CrossCountry);
    // Historical Rally engineering starting envelope; not an aerodynamic or grip measurement.
    let prior_speed = 28.0 * hp.cbrt() * if cross { 0.90 } else { 1.0 };
    let mut target = prior_speed;
    if let Some(correction) = correction {
        for cap in [correction.simulated_top_speed, correction.soft_max_speed]
            .into_iter()
            .flatten()
        {
            if !cap.is_finite() || cap <= 0.0 {
                return unavailable(
                    "Rally preview speed caps must be positive and finite",
                    diagnostic,
                );
            }
            target = target.min(cap * (rpm / max_rpm));
        }
    }
    let total = rpm * circumference * 60.0 / (target * 1000.0);
    if !target.is_finite() || target <= 0.0 || !total.is_finite() || total <= 0.0 {
        return unavailable(
            "Rally endpoint is outside the finite engineering domain",
            diagnostic,
        );
    }
    let tolerance = 1.0_f64.max(target * 0.01);
    let step = (0.82 - 0.05 * (torque / hp - 1.1)).clamp(0.75, 0.85);
    let preferred_fd = total / (2.7 * step.powi(count as i32 - 1));
    diagnostic["profile"] = json!(if cross {
        "cross-country"
    } else {
        "mixed-surface"
    });
    diagnostic["wheelCircumferenceM"] = json!(circumference);
    diagnostic["tireRadiusM"] = json!(circumference / (2.0 * PI));
    diagnostic["drivenTireAxle"] = json!(axle);
    diagnostic["referenceRpm"] = json!(rpm);
    diagnostic["maxRpm"] = json!(max_rpm);
    diagnostic["priorTargetSpeedKmh"] = json!(prior_speed);
    diagnostic["targetSpeedKmh"] = json!(target);
    diagnostic["targetTotalRatio"] = json!(total);
    diagnostic["endpointToleranceKmh"] = json!(tolerance);
    diagnostic["previewCapApplied"] = json!(target < prior_speed);
    if target < prior_speed {
        diagnostic["targetSource"] = json!("transmission-preview-cap-at-reference-rpm");
    }
    diagnostic["preferredStepRatio"] = json!(step);
    diagnostic["preferredFinalDrive"] = json!(preferred_fd);
    let model_range = RatioRange {
        min: 0.1,
        max: 6.0,
        step: 0.01,
    };
    let model_fd = RatioRange {
        min: 2.0,
        max: 6.5,
        step: 0.01,
    };
    let (fd_range, gear_ranges) = if let Some(bounds) = observed {
        if bounds.source != "user-observed" || bounds.gears.len() != count {
            return unavailable(
                "Rally observed bounds require user-observed source and every gear",
                diagnostic,
            );
        }
        (&bounds.final_drive, bounds.gears.as_slice())
    } else {
        (&model_fd, &[][..])
    };
    let Some((fd_min, fd_max)) = ticks(fd_range) else {
        return unavailable(
            "Rally final-drive bounds require a bounded positive 0.01 grid",
            diagnostic,
        );
    };
    let mut ranges = Vec::with_capacity(count);
    for i in 0..count {
        let range = gear_ranges.get(i).unwrap_or(&model_range);
        let Some(tick_range) = ticks(range) else {
            return unavailable(
                "Rally gear bounds require a bounded positive 0.01 grid",
                diagnostic,
            );
        };
        ranges.push(tick_range);
    }
    // Prefix upper envelope guarantees room for every earlier gear. A greedy
    // backward choice then respects all lower bounds without a post-solve clamp.
    let mut upper = Vec::with_capacity(count);
    for (i, &(lo, hi)) in ranges.iter().enumerate() {
        let cap = if i == 0 { hi } else { hi.min(upper[i - 1] - 1) };
        if cap < lo {
            return unavailable(
                "Rally observed ranges cannot form strictly decreasing gears",
                diagnostic,
            );
        }
        upper.push(cap);
    }
    let mut best: Option<(f64, GearingResult, f64)> = None;
    for fd_tick in fd_min..=fd_max {
        let fd = fd_tick as f64 / 100.0;
        let top_tick =
            ((total / fd * 100.0).round() as i64).clamp(ranges[count - 1].0, upper[count - 1]);
        let mut gear_ticks = vec![0; count];
        gear_ticks[count - 1] = top_tick;
        for i in (0..count - 1).rev() {
            let low = ranges[i].0.max(gear_ticks[i + 1] + 1);
            let preferred = top_tick as f64 / step.powi((count - 1 - i) as i32);
            gear_ticks[i] = (preferred.round() as i64).clamp(low, upper[i]);
        }
        let gears: Vec<f64> = gear_ticks.iter().map(|&v| v as f64 / 100.0).collect();
        let actual = calc_gear_speed(rpm, gears[count - 1], fd, circumference / (2.0 * PI)) * 3.6;
        if !actual.is_finite() || actual <= 0.0 || (actual - target).abs() > tolerance + 1e-9 {
            continue;
        }
        let score = (gears[0] / 2.7).ln().powi(2)
            + gears
                .windows(2)
                .map(|g| (g[1] / g[0] / step).ln().powi(2))
                .sum::<f64>()
            + ((actual - target) / target).powi(2);
        if best
            .as_ref()
            .is_none_or(|(old_score, _, _)| score < *old_score)
        {
            best = Some((
                score,
                GearingResult {
                    final_drive: fd,
                    gears,
                    unsupported: None,
                    unsupported_reason: None,
                },
                actual,
            ));
        }
    }
    let Some((_, gearing, actual)) = best else {
        return unavailable(
            "Rally rounded endpoint is infeasible within the supplied bounds and tolerance",
            diagnostic,
        );
    };
    diagnostic["status"] = json!("available");
    diagnostic["actualSpeedKmh"] = json!(actual);
    diagnostic["endpointErrorKmh"] = json!(actual - target);
    diagnostic["actualTotalRatio"] = json!(gearing.final_drive * gearing.gears[count - 1]);
    diagnostic["shapePreferenceLimited"] = json!(
        (gearing.gears[0] - 2.7).abs() > 0.005
            || gearing
                .gears
                .windows(2)
                .any(|g| (g[1] / g[0] - step).abs() > 0.01)
    );
    diagnostic["outsideModelFinalDrivePrior"] =
        json!(gearing.final_drive < model_fd.min || gearing.final_drive > model_fd.max);
    diagnostic["finalDrive"] = json!(gearing.final_drive);
    diagnostic["gears"] = json!(gearing.gears);
    CandidateGearingResult {
        gearing,
        diagnostics: diagnostic,
    }
}
