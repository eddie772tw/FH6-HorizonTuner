use super::super::types::*;

/// Production compatibility owner. New candidate selection belongs to PR 6.
pub(super) fn calculate(
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    super::legacy::calculate_aego_gearing_v2(RaceGoal::Drag, count, params, max_rpm, correction)
}

use super::{
    contracts::{CandidateGearingResult, RatioRange},
    kinematics::{calc_gear_rpm, calc_gear_speed},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::f64::consts::PI;

pub const MODEL_ID: &str = "aego-drag-joint";
pub const MODEL_VERSION: &str = "aego-drag-joint/v1";

/// User-recorded slider ranges, not inferred game-wide hardware limits.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DragObservedBounds {
    pub source: String,
    pub final_drive: RatioRange,
    pub gears: Vec<RatioRange>,
}

fn unavailable(reason: &'static str, mut diagnostics: Value) -> CandidateGearingResult {
    diagnostics["status"] = json!("unavailable");
    diagnostics["reason"] = json!(reason);
    diagnostics["dragFinishAvailability"] = json!({"status":"unavailable","reason":reason});
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

fn ticks(range: &RatioRange) -> Option<(i64, i64)> {
    let (lo, hi) = (range.min * 100.0, range.max * 100.0);
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

/// Intersect a ratio grid with the predeclared *speed* tolerance, before allocation.
fn endpoint_ticks(
    range: (i64, i64),
    k: f64,
    fd: f64,
    speed: f64,
    tolerance: f64,
    usable_rpm_ratio: f64,
) -> Option<(i64, i64)> {
    let lo = range
        .0
        .max((k / (fd * (speed + tolerance)) * 100.0 - 1e-8).ceil() as i64);
    let speed_hi = if speed > tolerance {
        range
            .1
            .min((k / (fd * (speed - tolerance)) * 100.0 + 1e-8).floor() as i64)
    } else {
        range.1
    };
    // At the requested endpoint speed, rounding must not require RPM beyond the
    // qualified usable limit even when speed error alone remains within tolerance.
    let rpm_hi = (k * usable_rpm_ratio / (fd * speed) * 100.0 + 1e-8).floor() as i64;
    let hi = speed_hi.min(rpm_hi);
    (lo <= hi).then_some((lo, hi))
}

/// Recheck an adjusted result against backend-produced diagnostics. Callers must
/// reconstruct these diagnostics from qualified inputs, never accept client JSON.
pub fn respects_hard_targets(result: &GearingResult, diagnostics: &Value) -> bool {
    let Some(count) = diagnostics["gearCount"].as_u64().map(|n| n as usize) else {
        return false;
    };
    if result.unsupported == Some(true)
        || result.gears.len() != count
        || !(4..=10).contains(&count)
        || !result.final_drive.is_finite()
        || result.final_drive <= 0.0
        || result.gears.iter().any(|g| !g.is_finite() || *g <= 0.0)
        || result.gears.windows(2).any(|g| g[0] <= g[1])
        || std::iter::once(&result.final_drive)
            .chain(&result.gears)
            .any(|v| (v * 100.0 - (v * 100.0).round()).abs() > 1e-7)
    {
        return false;
    }
    let number = |key: &str| {
        diagnostics[key]
            .as_f64()
            .filter(|v| v.is_finite() && *v > 0.0)
    };
    let (
        Some(rpm),
        Some(radius),
        Some(launch),
        Some(finish),
        Some(launch_tolerance),
        Some(finish_tolerance),
        Some(usable_limit),
    ) = (
        number("referenceRpm"),
        number("tireRadiusM"),
        number("launchTargetSpeedKmh"),
        number("targetSpeedKmh"),
        number("launchToleranceKmh"),
        number("endpointToleranceKmh"),
        number("maxRpm"),
    )
    else {
        return false;
    };
    let actual = |g| calc_gear_speed(rpm, g, result.final_drive, radius) * 3.6;
    (actual(result.gears[0]) - launch).abs() <= launch_tolerance + 1e-9
        && (actual(result.gears[count - 1]) - finish).abs() <= finish_tolerance + 1e-9
        && calc_gear_rpm(launch / 3.6, result.gears[0], result.final_drive, radius)
            <= usable_limit + 1e-8
        && calc_gear_rpm(
            finish / 3.6,
            result.gears[count - 1],
            result.final_drive,
            radius,
        ) <= usable_limit + 1e-8
}

/// Refresh all selected-result fields after equivalent ratio allocation. The
/// original diagnostics must be reconstructed by this backend model, not supplied
/// by the client. Targets, provenance and tolerances are deliberately immutable.
pub fn adjusted_diagnostics(result: &GearingResult, original: &Value) -> Value {
    let mut d = original.clone();
    let number = |key: &str| original[key].as_f64().filter(|v| v.is_finite() && *v > 0.0);
    let actual = number("referenceRpm")
        .zip(number("tireRadiusM"))
        .zip(result.gears.first().zip(result.gears.last()))
        .filter(|_| {
            result.final_drive.is_finite()
                && result.final_drive > 0.0
                && result.gears.iter().all(|g| g.is_finite() && *g > 0.0)
        })
        .map(|((rpm, radius), (first, last))| {
            (
                calc_gear_speed(rpm, *first, result.final_drive, radius) * 3.6,
                calc_gear_speed(rpm, *last, result.final_drive, radius) * 3.6,
            )
        })
        .filter(|(first, last)| {
            first.is_finite() && last.is_finite() && *first > 0.0 && *last > 0.0
        });
    let available = respects_hard_targets(result, original);
    d["status"] = json!(if available {
        "available"
    } else {
        "unavailable"
    });
    d["finalDrive"] = json!(result.final_drive);
    d["gears"] = json!(result.gears);
    d["actualLaunchSpeedKmh"] = json!(actual.map(|(first, _)| first));
    d["actualSpeedKmh"] = json!(actual.map(|(_, last)| last));
    d["launchErrorKmh"] = json!(actual
        .zip(number("launchTargetSpeedKmh"))
        .map(|((first, _), target)| first - target));
    d["endpointErrorKmh"] = json!(actual
        .zip(number("targetSpeedKmh"))
        .map(|((_, last), target)| last - target));
    let rpm_at_target = |key: &str, gear: Option<&f64>| {
        number(key)
            .zip(number("tireRadiusM"))
            .zip(gear)
            .filter(|_| result.final_drive.is_finite() && result.final_drive > 0.0)
            .map(|((speed, radius), g)| calc_gear_rpm(speed / 3.6, *g, result.final_drive, radius))
            .filter(|rpm| rpm.is_finite() && *rpm > 0.0)
    };
    d["actualLaunchRpmAtTargetSpeed"] =
        json!(rpm_at_target("launchTargetSpeedKmh", result.gears.first()));
    d["actualFinishRpmAtTargetSpeed"] = json!(rpm_at_target("targetSpeedKmh", result.gears.last()));
    d["outsideHistoricalFirstGearPreference"] =
        json!(result.gears.first().map(|g| !(2.2..=5.0).contains(g)));
    d["outsideModelFinalDrivePrior"] = json!(!(2.0..=6.1).contains(&result.final_drive));
    d["dragFinishAvailability"] = json!({
        "status":if available {"available"}else{"unavailable"},
        "targetKmh":original["targetSpeedKmh"],"actualKmh":actual.map(|(_,last)|last),
        "toleranceKmh":original["endpointToleranceKmh"]
    });
    if available {
        d.as_object_mut().unwrap().remove("reason");
    } else {
        d["reason"] = json!("Adjusted ratios do not satisfy the Drag model's hard endpoint, grid and ordering constraints");
    }
    d
}

/// Independent Drag candidate. Production keeps the historical owner until PR 6.
/// max_rpm is the backend-qualified usable RPM limit, not a guessed shift point.
pub fn solve_candidate(
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
    observed: Option<&DragObservedBounds>,
) -> CandidateGearingResult {
    let mut d = json!({
        "modelId":MODEL_ID,"modelVersion":MODEL_VERSION,"status":"unavailable","gearCount":count,
        "speedSemantics":"pure-rolling-wheel-speed-at-peak-power-rpm","finishGear":count,"launchGear":1,
        "launchSource":"inherited-drag-engineering-prior","finishEvidenceVerified":false,
        "boundsSource":if observed.is_some(){"user-observed"}else{"model-prior-not-game-observation"},
        "hardwareVerified":false,"performanceValidated":false,
        "constraints":["explicit-finite-inputs","0.01-grid","strictly-decreasing-gears","joint-launch-finish-max-1kmh-or-2percent","target-speed-rpm-within-qualified-usable-limit"],
        "modelPrior":{"finalDriveMin":2.0,"finalDriveMax":6.1,"gearMin":0.1,"gearMax":6.0},
        "spacingSource":"drag-geometric-preference-not-road-policy"
    });
    let positive = |v: Option<f64>| v.filter(|v| v.is_finite() && *v > 0.0);
    let (Some(weight), Some(hp), Some(_torque), Some(rpm), Some(torque_rpm)) = (
        positive(params.weight),
        positive(params.max_hp),
        positive(params.max_torque),
        positive(params.max_hp_rpm),
        positive(params.max_torque_rpm),
    ) else {
        return unavailable(
            "Drag requires explicit positive finite mass, power, torque and peak RPM inputs",
            d,
        );
    };
    if !(4..=10).contains(&count)
        || !max_rpm.is_finite()
        || max_rpm <= 0.0
        || rpm > max_rpm
        || torque_rpm > max_rpm
        || params
            .weight_distribution
            .is_some_and(|v| !v.is_finite() || v <= 0.0 || v >= 100.0)
        || params.is_electric == Some(true)
        || crate::tuning::cvt::is_cvt(params)
    {
        return unavailable(
            "Drag requires valid discrete ICE, vehicle, usable RPM and 4-10 gear inputs",
            d,
        );
    }
    let (launch, axle, width, aspect, rim) = match params.drivetrain.as_deref() {
        Some("FWD") => (
            100.0,
            "front",
            params.front_tire_width,
            params.front_tire_aspect,
            params.front_tire_rim,
        ),
        Some("AWD") => (
            110.0,
            "rear",
            params.rear_tire_width,
            params.rear_tire_aspect,
            params.rear_tire_rim,
        ),
        Some("RWD") => (
            125.0,
            "rear",
            params.rear_tire_width,
            params.rear_tire_aspect,
            params.rear_tire_rim,
        ),
        _ => return unavailable("Drag requires an explicit FWD, RWD or AWD drivetrain", d),
    };
    let (Some(width), Some(aspect), Some(rim)) = (positive(width), positive(aspect), positive(rim))
    else {
        return unavailable(
            "Drag requires explicit positive driven-axle tire dimensions",
            d,
        );
    };
    let circumference = (width * aspect / 100.0 * 2.0 + rim * 25.4) * PI / 1000.0;
    let aero = params.aero_efficiency.unwrap_or(0.5);
    if !circumference.is_finite()
        || circumference <= 0.0
        || !aero.is_finite()
        || !(0.0..=1.0).contains(&aero)
    {
        return unavailable(
            "Drag wheel circumference or aerodynamic prior input is invalid",
            d,
        );
    }
    // Select the entire pair from one entry point; never borrow a provenance label
    // from the profile to legitimize an unrelated secondary-correction number.
    let (finish_value, provenance, entry) = if correction.is_some_and(|sc| {
        sc.drag_finish_speed_kmh.is_some() || sc.drag_finish_speed_provenance.is_some()
    }) {
        let sc = correction.unwrap();
        (
            sc.drag_finish_speed_kmh,
            sc.drag_finish_speed_provenance.as_deref(),
            "secondary-correction",
        )
    } else {
        (
            params.drag_finish_speed_kmh,
            params.drag_finish_speed_provenance.as_deref(),
            "profile",
        )
    };
    let explicit = finish_value.is_some() || provenance.is_some();
    if explicit
        && (positive(finish_value).is_none() || !matches!(provenance, Some("manual" | "telemetry")))
    {
        return unavailable("Drag finish speed requires a positive finite value and paired manual/telemetry provenance", d);
    }
    let prior = 410.0 * (hp / weight).powf(0.30) * (1.0 + 0.12 * aero);
    let mut target = finish_value.unwrap_or(prior);
    d["targetSpeedKmh"] = json!(target);
    d["priorTargetSpeedKmh"] = json!(prior);
    d["targetSource"] = json!(provenance
        .map(|p| format!("caller-declared-{p}"))
        .unwrap_or_else(|| "inherited-drag-engineering-prior".into()));
    d["finishInputEntry"] = json!(if explicit { entry } else { "engineering-prior" });
    d["aeroPriorSource"] = json!(if params.aero_efficiency.is_some() {
        "profile-input"
    } else {
        "engineering-prior-default-0.5"
    });
    d["launchTargetSpeedKmh"] = json!(launch);
    d["launchToleranceKmh"] = json!(1.0_f64.max(launch * 0.02));
    d["referenceRpm"] = json!(rpm);
    d["maxRpm"] = json!(max_rpm);
    d["wheelCircumferenceM"] = json!(circumference);
    d["tireRadiusM"] = json!(circumference / (2.0 * PI));
    d["drivenTireAxle"] = json!(axle);
    let mut preview_cap = f64::INFINITY;
    if let Some(sc) = correction {
        for cap in [sc.simulated_top_speed, sc.soft_max_speed]
            .into_iter()
            .flatten()
        {
            if !cap.is_finite() || cap <= 0.0 {
                return unavailable(
                    "Drag preview speed constraints must be positive and finite",
                    d,
                );
            }
            preview_cap = preview_cap.min(cap * rpm / max_rpm);
        }
    }
    if preview_cap.is_finite() {
        d["previewConstraintSpeedKmh"] = json!(preview_cap);
        d["previewConstraintSource"] =
            json!("transmission-preview-at-usable-limit-not-measured-capability");
        if explicit && target > preview_cap + 1e-9 {
            return unavailable("Drag explicit finish target conflicts with the transmission preview constraint; target was not changed", d);
        }
        if !explicit {
            target = target.min(preview_cap);
        }
    }
    d["previewCapApplied"] = json!(!explicit && target < prior);
    d["targetSpeedKmh"] = json!(target);
    let tolerance = 1.0_f64.max(target * 0.02);
    d["endpointToleranceKmh"] = json!(tolerance);
    if !prior.is_finite() || prior <= 0.0 || !target.is_finite() || target <= launch {
        return unavailable("Drag finish target conflicts with the launch endpoint under this model's engineering constraints", d);
    }
    let k = rpm * circumference * 60.0 / 1000.0;
    let first_total = k / launch;
    let top_total = k / target;
    if !k.is_finite() || !first_total.is_finite() || !top_total.is_finite() || top_total <= 0.0 {
        return unavailable(
            "Drag endpoint totals exceed the finite engineering domain",
            d,
        );
    }
    let top_anchor = if count >= 7 {
        0.82
    } else if count >= 5 {
        0.90
    } else {
        1.0
    };
    d["launchTargetTotalRatio"] = json!(first_total);
    d["targetTotalRatio"] = json!(top_total);
    d["preferredTopGear"] = json!(top_anchor);
    let fd_prior = RatioRange {
        min: 2.0,
        max: 6.1,
        step: 0.01,
    };
    let gear_prior = RatioRange {
        min: 0.1,
        max: 6.0,
        step: 0.01,
    };
    let (fd_range, gear_ranges) = if let Some(bounds) = observed {
        if bounds.source != "user-observed" || bounds.gears.len() != count {
            return unavailable(
                "Drag observed bounds require user-observed provenance and every gear",
                d,
            );
        }
        (&bounds.final_drive, bounds.gears.as_slice())
    } else {
        (&fd_prior, &[][..])
    };
    let Some((fd_lo, fd_hi)) = ticks(fd_range) else {
        return unavailable(
            "Drag final-drive bounds require a bounded positive 0.01 grid",
            d,
        );
    };
    let mut ranges = Vec::with_capacity(count);
    for i in 0..count {
        let Some(range) = ticks(gear_ranges.get(i).unwrap_or(&gear_prior)) else {
            return unavailable("Drag gear bounds require a bounded positive 0.01 grid", d);
        };
        ranges.push(range);
    }
    let totals: Vec<f64> = (0..count)
        .map(|i| first_total * (top_total / first_total).powf(i as f64 / (count - 1) as f64))
        .collect();
    let mut best: Option<(f64, GearingResult)> = None;
    for fd_tick in fd_lo..=fd_hi {
        let fd = fd_tick as f64 / 100.0;
        let mut legal = ranges.clone();
        let Some(first) = endpoint_ticks(
            legal[0],
            k,
            fd,
            launch,
            1.0_f64.max(launch * 0.02),
            max_rpm / rpm,
        ) else {
            continue;
        };
        let Some(last) = endpoint_ticks(legal[count - 1], k, fd, target, tolerance, max_rpm / rpm)
        else {
            continue;
        };
        legal[0] = first;
        legal[count - 1] = last;
        // Bidirectional envelopes keep room for every remaining gear. Endpoint
        // constraints are incorporated before this step, never repaired afterward.
        let mut upper: Vec<i64> = Vec::with_capacity(count);
        for (i, &(_, hi)) in legal.iter().enumerate() {
            upper.push(if i == 0 { hi } else { hi.min(upper[i - 1] - 1) });
        }
        let mut lower = vec![0_i64; count];
        for i in (0..count).rev() {
            lower[i] = if i + 1 == count {
                legal[i].0
            } else {
                legal[i].0.max(lower[i + 1] + 1)
            };
        }
        if (0..count).any(|i| lower[i] > upper[i]) {
            continue;
        }
        let mut gear_ticks = Vec::with_capacity(count);
        for i in 0..count {
            let hi = if i == 0 {
                upper[i]
            } else {
                upper[i].min(gear_ticks[i - 1] - 1)
            };
            gear_ticks.push(((totals[i] / fd * 100.0).round() as i64).clamp(lower[i], hi));
        }
        let result = GearingResult {
            final_drive: fd,
            gears: gear_ticks.iter().map(|g| *g as f64 / 100.0).collect(),
            unsupported: None,
            unsupported_reason: None,
        };
        if !respects_hard_targets(&result, &d) {
            continue;
        }
        let score = result
            .gears
            .iter()
            .zip(&totals)
            .map(|(g, t)| (g * fd / t).ln().powi(2))
            .sum::<f64>()
            + 0.001 * (result.gears[count - 1] / top_anchor).ln().powi(2);
        if best
            .as_ref()
            .is_none_or(|(previous, _)| score < *previous - 1e-12)
        {
            best = Some((score, result));
        }
    }
    let Some((_, gearing)) = best else {
        return unavailable("No allocation meets both Drag endpoints, rounding and observed/model ranges under this model's constraints", d);
    };
    d = adjusted_diagnostics(&gearing, &d);
    CandidateGearingResult {
        gearing,
        diagnostics: d,
    }
}
