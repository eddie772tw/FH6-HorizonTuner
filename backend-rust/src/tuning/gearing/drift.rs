use super::super::types::*;

use super::contracts::{CandidateGearingResult, RatioRange};
use super::kinematics::calc_gear_speed;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::f64::consts::PI;

pub const MODEL_ID: &str = "aego-drift-working";
pub const MODEL_VERSION: &str = "aego-drift-working/v1";

/// A requested wheel-speed operating point, never a claimed ground speed or measurement.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriftWorkingTarget {
    pub main_gear: usize,
    pub target_rpm: f64,
    pub wheel_speed_kmh: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriftObservedBounds {
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

fn endpoint_tolerance(speed: f64) -> f64 {
    1.0_f64.max(speed * 0.01)
}

/// Recheck a ratio-balance result against freshly backend-reconstructed model
/// diagnostics. This is not an evidence qualification API for client metadata.
pub fn respects_hard_targets(result: &GearingResult, diagnostic: &Value) -> bool {
    let positive = |v: &Value| v.as_f64().filter(|v| v.is_finite() && *v > 0.0);
    let grid = |v: f64| v.is_finite() && v > 0.0 && (v * 100.0 - (v * 100.0).round()).abs() < 1e-7;
    if diagnostic["modelVersion"] != MODEL_VERSION
        || diagnostic["targetSource"] != "user-target"
        || result.unsupported == Some(true)
        || !(4..=10).contains(&result.gears.len())
        || diagnostic["gearCount"].as_u64() != Some(result.gears.len() as u64)
        || !grid(result.final_drive)
        || !result.gears.iter().all(|g| grid(*g))
        || !result.gears.windows(2).all(|g| g[0] > g[1])
    {
        return false;
    }
    let Some(main) = diagnostic["mainGear"]
        .as_u64()
        .filter(|g| (1..=result.gears.len() as u64).contains(g))
    else {
        return false;
    };
    let (Some(rpm), Some(speed), Some(limit), Some(radius)) = (
        positive(&diagnostic["targetRpm"]),
        positive(&diagnostic["targetWheelSpeedKmh"]),
        positive(&diagnostic["usableLimitRpm"]),
        positive(&diagnostic["tireRadiusM"]),
    ) else {
        return false;
    };
    if rpm > limit {
        return false;
    }
    let actual = calc_gear_speed(
        rpm,
        result.gears[main as usize - 1],
        result.final_drive,
        radius,
    ) * 3.6;
    let actual_rpm = rpm * (speed / actual);
    actual.is_finite()
        && actual > 0.0
        && (actual - speed).abs() <= endpoint_tolerance(speed) + 1e-9
        && actual_rpm.is_finite()
        && actual_rpm <= limit + 1e-7
}

/// Describe the selected equivalent gearing using the original backend-owned
/// targets. Never carry the original candidate's actual values onto an adjustment.
pub fn adjusted_diagnostics(result: &GearingResult, original: &Value) -> Value {
    if !original.is_object() {
        return json!({"modelId":MODEL_ID,"modelVersion":MODEL_VERSION,"status":"unavailable","reason":"Drift adjustment requires backend model diagnostics"});
    }
    let mut diagnostic = original.clone();
    if !respects_hard_targets(result, original) {
        diagnostic["status"] = json!("unavailable");
        diagnostic["reason"] =
            json!("Adjusted gearing violates the Drift working-point constraints");
        for key in [
            "actualWheelSpeedKmh",
            "wheelSpeedErrorKmh",
            "actualTotalRatio",
            "actualRpmAtTargetWheelSpeed",
            "targetRpmError",
        ] {
            diagnostic[key] = Value::Null;
        }
        return diagnostic;
    }
    // The hard-target check established these canonical model fields.
    let main = original["mainGear"].as_u64().unwrap() as usize - 1;
    let rpm = original["targetRpm"].as_f64().unwrap();
    let target_speed = original["targetWheelSpeedKmh"].as_f64().unwrap();
    let actual = calc_gear_speed(
        rpm,
        result.gears[main],
        result.final_drive,
        original["tireRadiusM"].as_f64().unwrap(),
    ) * 3.6;
    let actual_rpm = rpm * (target_speed / actual);
    diagnostic["actualWheelSpeedKmh"] = json!(actual);
    diagnostic["wheelSpeedErrorKmh"] = json!(actual - target_speed);
    diagnostic["actualTotalRatio"] = json!(result.final_drive * result.gears[main]);
    diagnostic["actualRpmAtTargetWheelSpeed"] = json!(actual_rpm);
    diagnostic["targetRpmError"] = json!(actual_rpm - rpm);
    if let Some(shape) = original["interpolatedShapePrior"]
        .as_array()
        .filter(|s| s.len() == result.gears.len())
    {
        let limited = shape.iter().zip(&result.gears).any(|(prior, gear)| {
            prior.as_f64().is_none_or(|prior| {
                !prior.is_finite() || prior <= 0.0 || (gear / prior - 1.0).abs() > 0.01
            })
        });
        diagnostic["shapePreferenceLimited"] = json!(limited);
        diagnostic["status"] = json!(if limited || original["finalDriveSaturated"] == true {
            "limited"
        } else {
            "available"
        });
    }
    if let (Some(min), Some(max)) = (
        original["allocationFinalDriveBounds"]["min"].as_f64(),
        original["allocationFinalDriveBounds"]["max"].as_f64(),
    ) {
        diagnostic["finalDriveAtBoundary"] = json!(
            (result.final_drive - min).abs() < 1e-9 || (result.final_drive - max).abs() < 1e-9
        );
    }
    if let (Some(min), Some(max)) = (
        original["modelPrior"]["finalDriveMin"].as_f64(),
        original["modelPrior"]["finalDriveMax"].as_f64(),
    ) {
        diagnostic["outsideModelFinalDrivePrior"] =
            json!(result.final_drive < min || result.final_drive > max);
    }
    diagnostic
}

/// Candidate only. `usable_limit_rpm` is the backend-qualified usable/effective
/// limit, not a nominal telemetry maximum when a lower limiter was observed.
/// No curve is accepted here: peak markers alone cannot qualify a working band.
pub fn solve_candidate(
    count: usize,
    params: &TuningCarParams,
    usable_limit_rpm: f64,
    target: Option<&DriftWorkingTarget>,
    observed: Option<&DriftObservedBounds>,
) -> CandidateGearingResult {
    let mut diagnostic = json!({
        "modelId":MODEL_ID, "modelVersion":MODEL_VERSION,
        "status":"unavailable", "speedSemantics":"pure-rolling-wheel-speed-not-ground-speed",
        "targetSource":"user-target", "groundSpeedKmh":null, "slipEvidence":null,
        "workingBand":null, "workingBandStatus":"unavailable-no-qualified-curve",
        "shapeSource":"inherited-four-point-uncalibrated-prior", "shapePrior":[2.89,1.99,1.34,1.0],
        "hardwareVerified":false, "performanceValidated":false,
        "boundsSource":if observed.is_some(){"user-observed"}else{"model-prior-not-game-observation"},
        "constraints":["positive-finite-inputs", "target-rpm-within-qualified-usable-limit", "0.01-grid", "strictly-decreasing-gears", "main-gear-wheel-speed-max-1kmh-or-1percent"],
        "modelPrior":{"finalDriveMin":2.2,"finalDriveMax":6.1,"gearMin":0.1,"gearMax":6.0}
    });
    let positive = |v: Option<f64>| v.is_some_and(|v| v.is_finite() && v > 0.0);
    if !(4..=10).contains(&count)
        || !usable_limit_rpm.is_finite()
        || usable_limit_rpm <= 0.0
        || !positive(params.weight)
        || params
            .weight_distribution
            .is_some_and(|v| !v.is_finite() || v <= 0.0 || v >= 100.0)
        || params.is_electric == Some(true)
        || crate::tuning::cvt::is_cvt(params)
    {
        return unavailable(
            "Drift requires valid discrete ICE, vehicle, usable RPM limit and 4-10 gears",
            diagnostic,
        );
    }
    let drive = params.drivetrain.as_deref().unwrap_or("");
    let (width, aspect, rim, axle, applicability) = match drive {
        "FWD" => (
            params.front_tire_width,
            params.front_tire_aspect,
            params.front_tire_rim,
            "front",
            "kinematic-compatibility-only-not-power-drift-validation",
        ),
        "RWD" => (
            params.rear_tire_width,
            params.rear_tire_aspect,
            params.rear_tire_rim,
            "rear",
            "rwd-uncalibrated-engineering-candidate",
        ),
        "AWD" => (
            params.rear_tire_width,
            params.rear_tire_aspect,
            params.rear_tire_rim,
            "rear",
            "awd-uncalibrated-engineering-candidate",
        ),
        _ => {
            return unavailable(
                "Drift requires an explicit FWD, RWD or AWD drivetrain",
                diagnostic,
            )
        }
    };
    if !positive(width) || !positive(aspect) || !positive(rim) {
        return unavailable(
            "Drift requires explicit positive driven-axle tire dimensions",
            diagnostic,
        );
    }
    let circumference =
        (width.unwrap() * aspect.unwrap() / 100.0 * 2.0 + rim.unwrap() * 25.4) * PI / 1000.0;
    if !circumference.is_finite() || circumference <= 0.0 {
        return unavailable(
            "Drift tire circumference is outside the finite domain",
            diagnostic,
        );
    }
    diagnostic["wheelCircumferenceM"] = json!(circumference);
    diagnostic["gearCount"] = json!(count);
    diagnostic["tireRadiusM"] = json!(circumference / (2.0 * PI));
    diagnostic["drivenTireAxle"] = json!(axle);
    diagnostic["drivetrainApplicability"] = json!(applicability);
    diagnostic["maxRpm"] = json!(usable_limit_rpm);
    diagnostic["usableLimitRpm"] = json!(usable_limit_rpm);
    let Some(target) = target else {
        return unavailable(
            "Enter a main gear, target RPM and wheel-speed target; ground speed cannot be inferred",
            diagnostic,
        );
    };
    if target.source != "user-target"
        || !(1..=count).contains(&target.main_gear)
        || !target.target_rpm.is_finite()
        || target.target_rpm <= 0.0
        || target.target_rpm > usable_limit_rpm
        || !target.wheel_speed_kmh.is_finite()
        || target.wheel_speed_kmh <= 0.0
    {
        return unavailable("Drift target must be a user-target within the gear count and qualified usable RPM limit", diagnostic);
    }
    let main = target.main_gear - 1;
    let target_total = target.target_rpm * circumference * 60.0 / (target.wheel_speed_kmh * 1000.0);
    if !target_total.is_finite() || target_total <= 0.0 {
        return unavailable(
            "Drift working point is outside the finite domain",
            diagnostic,
        );
    }
    // The four-point source is a shape preference, not a calibrated usable band.
    let prior: [f64; 4] = [2.89, 1.99, 1.34, 1.0];
    let shape: Vec<f64> = (0..count)
        .map(|i| {
            let position = i as f64 * 3.0 / (count - 1) as f64;
            let lower = (position.floor() as usize).min(2);
            let fraction = position - lower as f64;
            (prior[lower].ln() * (1.0 - fraction) + prior[lower + 1].ln() * fraction).exp()
        })
        .collect();
    let preferred_fd = target_total / shape[main];
    let tolerance = endpoint_tolerance(target.wheel_speed_kmh);
    diagnostic["mainGear"] = json!(target.main_gear);
    diagnostic["referenceRpm"] = json!(target.target_rpm);
    diagnostic["targetRpm"] = json!(target.target_rpm);
    diagnostic["targetWheelSpeedKmh"] = json!(target.wheel_speed_kmh);
    diagnostic["targetTotalRatio"] = json!(target_total);
    diagnostic["endpointToleranceKmh"] = json!(tolerance);
    diagnostic["preferredFinalDrive"] = json!(preferred_fd);
    diagnostic["interpolatedShapePrior"] = json!(shape);
    let prior_fd = RatioRange {
        min: 2.2,
        max: 6.1,
        step: 0.01,
    };
    let prior_gears = RatioRange {
        min: 0.1,
        max: 6.0,
        step: 0.01,
    };
    let (fd_range, gear_ranges) = if let Some(bounds) = observed {
        if bounds.source != "user-observed" || bounds.gears.len() != count {
            return unavailable(
                "Drift observed bounds require user-observed source and every gear",
                diagnostic,
            );
        }
        (&bounds.final_drive, bounds.gears.as_slice())
    } else {
        (&prior_fd, &[][..])
    };
    let Some((fd_min, fd_max)) = ticks(fd_range) else {
        return unavailable(
            "Drift final-drive bounds require a bounded positive 0.01 grid",
            diagnostic,
        );
    };
    diagnostic["allocationFinalDriveBounds"] = json!(fd_range);
    let mut ranges = Vec::with_capacity(count);
    for i in 0..count {
        let Some(range) = ticks(gear_ranges.get(i).unwrap_or(&prior_gears)) else {
            return unavailable(
                "Drift gear bounds require a bounded positive 0.01 grid",
                diagnostic,
            );
        };
        ranges.push(range);
    }
    let mut lower = vec![0_i64; count];
    let mut upper = vec![0_i64; count];
    for i in (0..count).rev() {
        lower[i] = if i + 1 == count {
            ranges[i].0
        } else {
            ranges[i].0.max(lower[i + 1] + 1)
        };
    }
    for i in 0..count {
        upper[i] = if i == 0 {
            ranges[i].1
        } else {
            ranges[i].1.min(upper[i - 1] - 1)
        };
        if lower[i] > upper[i] {
            return unavailable(
                "Drift observed bounds cannot form strictly decreasing gears",
                diagnostic,
            );
        }
    }
    let mut best: Option<(f64, GearingResult, f64)> = None;
    for fd_tick in fd_min..=fd_max {
        let fd = fd_tick as f64 / 100.0;
        // At the requested wheel speed, rounding may not push the operating
        // RPM above the qualified effective limiter, even if speed error fits.
        let rpm_bound = (usable_limit_rpm * circumference * 60.0
            / (target.wheel_speed_kmh * 1000.0 * fd)
            * 100.0
            + 1e-9)
            .floor();
        let anchor_upper = (upper[main] as f64).min(rpm_bound);
        if anchor_upper < lower[main] as f64 {
            continue;
        }
        let ideal_tick = target_total / fd * 100.0;
        let Some((main_tick, actual)) = [ideal_tick.round(), ideal_tick.floor(), ideal_tick.ceil()]
            .into_iter()
            .find_map(|candidate| {
                let tick = candidate.clamp(lower[main] as f64, anchor_upper) as i64;
                let actual = calc_gear_speed(
                    target.target_rpm,
                    tick as f64 / 100.0,
                    fd,
                    circumference / (2.0 * PI),
                ) * 3.6;
                if !actual.is_finite()
                    || actual <= 0.0
                    || (actual - target.wheel_speed_kmh).abs() > tolerance + 1e-9
                {
                    return None;
                }
                let actual_rpm = target.target_rpm * (target.wheel_speed_kmh / actual);
                (actual_rpm.is_finite() && actual_rpm <= usable_limit_rpm + 1e-7)
                    .then_some((tick, actual))
            })
        else {
            continue;
        };
        let mut gear_ticks = vec![0_i64; count];
        gear_ticks[main] = main_tick;
        for i in (0..main).rev() {
            let low = lower[i].max(gear_ticks[i + 1] + 1);
            let desired = gear_ticks[main] as f64 * shape[i] / shape[main];
            gear_ticks[i] = desired.round().clamp(low as f64, upper[i] as f64) as i64;
        }
        for i in main + 1..count {
            let high = upper[i].min(gear_ticks[i - 1] - 1);
            let desired = gear_ticks[main] as f64 * shape[i] / shape[main];
            gear_ticks[i] = desired.round().clamp(lower[i] as f64, high as f64) as i64;
        }
        let gears: Vec<f64> = gear_ticks.iter().map(|g| *g as f64 / 100.0).collect();
        let score = gears
            .iter()
            .zip(&shape)
            .map(|(g, p)| (g / p).ln().powi(2))
            .sum::<f64>()
            + ((actual - target.wheel_speed_kmh) / target.wheel_speed_kmh).powi(2);
        if best.as_ref().is_none_or(|(old, _, _)| score < *old - 1e-12) {
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
            "Drift working point cannot satisfy the rounded main-gear endpoint and observed bounds",
            diagnostic,
        );
    };
    let fd_saturated = preferred_fd < fd_range.min || preferred_fd > fd_range.max;
    let shape_limited = gearing
        .gears
        .iter()
        .zip(&shape)
        .any(|(g, p)| (g / p - 1.0).abs() > 0.01);
    diagnostic["status"] = json!(if fd_saturated || shape_limited {
        "limited"
    } else {
        "available"
    });
    diagnostic["finalDriveSaturated"] = json!(fd_saturated);
    diagnostic["finalDriveAtBoundary"] = json!(
        (gearing.final_drive - fd_range.min).abs() < 1e-9
            || (gearing.final_drive - fd_range.max).abs() < 1e-9
    );
    diagnostic["shapePreferenceLimited"] = json!(shape_limited);
    diagnostic["actualWheelSpeedKmh"] = json!(actual);
    diagnostic["wheelSpeedErrorKmh"] = json!(actual - target.wheel_speed_kmh);
    diagnostic["actualTotalRatio"] = json!(gearing.final_drive * gearing.gears[main]);
    diagnostic["actualRpmAtTargetWheelSpeed"] =
        json!(target.target_rpm * (target.wheel_speed_kmh / actual));
    diagnostic["targetRpmError"] =
        json!(target.target_rpm * (target.wheel_speed_kmh / actual - 1.0));
    diagnostic["outsideModelFinalDrivePrior"] =
        json!(gearing.final_drive < prior_fd.min || gearing.final_drive > prior_fd.max);
    CandidateGearingResult {
        gearing,
        diagnostics: diagnostic,
    }
}
