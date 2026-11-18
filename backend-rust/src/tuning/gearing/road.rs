use super::super::types::*;
use super::kinematics::calc_gear_speed;
use std::f64::consts::PI;

fn clamp(val: f64, min: f64, max: f64) -> f64 {
    val.max(min).min(max)
}

pub fn get_target_top_gear_ratio(num_gears: usize) -> f64 {
    match num_gears {
        0..=3 => 1.00,
        4 => 0.88,
        5 => 0.78,
        6 => 0.72,
        7 => 0.67,
        8 => 0.63,
        9 => 0.60,
        _ => 0.58,
    }
}

fn road_launch_total_ratio(params: &TuningCarParams, torque_nm: f64, radius_m: f64) -> f64 {
    let front = params
        .weight_distribution
        .filter(|v| v.is_finite())
        .unwrap_or(50.0)
        .clamp(1.0, 99.0)
        / 100.0;
    let dt = params
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);
    let rear_share = if dt == Drivetrain::FWD {
        0.0
    } else if dt == Drivetrain::RWD {
        1.0
    } else {
        super::super::chassis::get_road_awd_rear_percent(params) / 100.0
    };

    let front_limit_g = if rear_share < 1.0 {
        front / (1.0 - rear_share + 0.20)
    } else {
        f64::INFINITY
    };
    let rear_limit_g = if rear_share > 0.20 {
        (1.0 - front) / (rear_share - 0.20)
    } else {
        f64::INFINITY
    };
    let acceleration_g = (1.0_f64).min(front_limit_g).min(rear_limit_g);
    let mass = params
        .weight
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(1400.0);
    let r = if radius_m.is_finite() && radius_m > 0.0 {
        radius_m
    } else {
        0.32
    };
    if !torque_nm.is_finite() || torque_nm <= 0.0 {
        return 0.0;
    }
    mass * 9.81 * acceleration_g * r / (torque_nm * 0.90)
}

/// Inherited v1.6 speed at peak-power RPM (not redline or a measured speed).
fn road_speed_total(drive: Drivetrain, power_rpm: f64, circumference: f64) -> f64 {
    let modifier = match drive {
        Drivetrain::AWD => 0.85,
        Drivetrain::FWD => 1.05,
        Drivetrain::RWD => 1.15,
    };
    power_rpm * circumference * 60.0 / (90.0 * modifier * 1000.0)
}

/// Inspectable model evidence, not optimal launch/shift predictions. The peak
/// window is descriptive only: a torque peak is not the lower usable RPM limit.
pub fn road_launch_diagnostics(
    params: &TuningCarParams,
    limit_rpm: f64,
    power_rpm: f64,
    torque_rpm: f64,
    torque_nm: f64,
    result: &GearingResult,
) -> serde_json::Value {
    let p = normalize_road_gearing_inputs(params);
    let drive = p
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);
    let (width, aspect, rim) = if drive == Drivetrain::FWD {
        (
            p.front_tire_width.unwrap(),
            p.front_tire_aspect.unwrap(),
            p.front_tire_rim.unwrap(),
        )
    } else {
        (
            p.rear_tire_width.unwrap(),
            p.rear_tire_aspect.unwrap(),
            p.rear_tire_rim.unwrap(),
        )
    };
    let c = ((width * aspect / 100.0) * 2.0 + rim * 25.4) * PI / 1000.0;
    let load = road_launch_total_ratio(&p, torque_nm, c / (2.0 * PI));
    let speed = road_speed_total(drive, power_rpm, c);
    let first = result.gears.first().copied();
    serde_json::json!({
        "modelVersion":"aego-road-launch-envelope/v3",
        "loadPriorTotalRatio":load,"speedPriorTotalRatio":speed,"selectedTotalRatio":load.max(speed),
        "allocatedFirstTotalRatio":first.map(|g|g * result.final_drive),
        "firstGearSpeedAtPowerPeakKmh":first.map(|g|calc_gear_speed(power_rpm,g,result.final_drive,c/(2.0*PI))*3.6),
        "torquePeakRpm":torque_rpm,"powerPeakRpm":power_rpm,"effectiveLimitRpm":limit_rpm,
        "shiftLandingRpmsAtLimit":result.gears.windows(2).map(|g|limit_rpm*g[1]/g[0]).collect::<Vec<_>>(),
        "scope":"engineering-priors-and-kinematics; launch-grip-and-optimal-shifts-unverified"
    })
}

// Joint allocation retained from Road v2. Priors are not measured grip.
fn allocate_road_gearing(first_total: f64, top_total: f64, count: usize) -> GearingResult {
    let unavailable = GearingResult {
        final_drive: 0.0, gears: vec![], unsupported: Some(true),
        unsupported_reason: Some("Road model targets conflict with the available ratio range. This does not mean the vehicle cannot be driven.".into()),
    };
    if !(4..=10).contains(&count)
        || !first_total.is_finite()
        || !top_total.is_finite()
        || top_total <= 0.0
        || first_total <= top_total
    {
        return unavailable;
    }
    let preferred_fd = top_total / get_target_top_gear_ratio(count);
    let mut candidates: Vec<f64> = (200..=610).map(|n| n as f64 / 100.0).collect();
    candidates.sort_by(|a, b| {
        let distance = (a - preferred_fd).abs() - (b - preferred_fd).abs();
        if distance.abs() < 1e-12 {
            a.total_cmp(b)
        } else {
            distance.total_cmp(&0.0)
        }
    });
    for final_drive in candidates {
        let first = (first_total / final_drive * 100.0).round();
        let top = (top_total / final_drive * 100.0).round();
        if !(100.0..=600.0).contains(&first)
            || !(40.0..=600.0).contains(&top)
            || first - top < (count - 1) as f64
        {
            continue;
        }
        let steps = count - 1;
        let mean = (top / first).powf(1.0 / steps as f64);
        let spread = clamp((1.0 - mean) * 0.6, 0.04, 0.12);
        let raw: Vec<f64> = (0..steps)
            .map(|i| {
                clamp(
                    mean + spread * (i as f64 / (steps - 1) as f64 - 0.5),
                    0.55,
                    0.92,
                )
            })
            .collect();
        let scale = (top / (first * raw.iter().product::<f64>())).powf(1.0 / steps as f64);
        let mut grid = vec![first];
        let mut ideal = first;
        for i in 1..steps {
            ideal *= raw[i - 1] * scale;
            grid.push(
                ideal
                    .round()
                    .min(grid[i - 1] - 1.0)
                    .max(top + (steps - i) as f64),
            );
        }
        grid.push(top);
        return GearingResult {
            final_drive,
            gears: grid.iter().map(|n| n / 100.0).collect(),
            unsupported: None,
            unsupported_reason: None,
        };
    }
    unavailable
}

#[cfg(test)]
mod road_grid_tests {
    use super::*;

    #[test]
    fn preserves_endpoints_at_fd_and_gear_boundaries() {
        for (first, top, count, fd, endpoints) in [
            (12.0, 0.8, 6, 2.0, (6.0, 0.4)),
            (36.6, 4.392, 6, 6.1, (6.0, 0.72)),
            (2.06, 2.0, 4, 2.07, (1.0, 0.97)),
            (8.0, 1.4436, 6, 2.0, (4.0, 0.72)), // anchor 2.005: lower FD wins
        ] {
            let result = allocate_road_gearing(first, top, count);
            assert_ne!(result.unsupported, Some(true));
            assert_eq!(result.final_drive, fd);
            assert_eq!((result.gears[0], result.gears[count - 1]), endpoints);
            assert!(result.gears.windows(2).all(|g| g[0] - g[1] >= 0.01 - 1e-9));
        }
    }

    #[test]
    fn never_repairs_conflicting_targets_by_clamping_each_gear() {
        for (first, top, count) in [
            (2.02, 2.0, 4),
            (40.0, 1.0, 6),
            (2.0, 3.0, 6),
            (12.0, 0.1, 6),
            (f64::NAN, 1.0, 6),
            (12.0, 1.0, 3),
        ] {
            let result = allocate_road_gearing(first, top, count);
            assert_eq!(result.unsupported, Some(true));
            assert!(result.gears.is_empty());
        }
    }
}

fn normalize_road_gearing_inputs(params: &TuningCarParams) -> TuningCarParams {
    let positive = |value: Option<f64>, fallback: f64| {
        Some(
            value
                .filter(|v| v.is_finite() && *v > 0.0)
                .unwrap_or(fallback),
        )
    };
    let mut p = params.clone();
    p.weight = positive(p.weight, 1400.0);
    p.weight_distribution = Some(clamp(
        p.weight_distribution
            .filter(|v| v.is_finite())
            .unwrap_or(50.0),
        1.0,
        99.0,
    ));
    p.max_hp = positive(p.max_hp, 300.0);
    p.max_torque = positive(p.max_torque, 0.0);
    p.max_hp_rpm = positive(p.max_hp_rpm, 0.0);
    p.max_torque_rpm = positive(p.max_torque_rpm, 0.0);
    p.aero_efficiency = Some(clamp(
        p.aero_efficiency.filter(|v| v.is_finite()).unwrap_or(0.5),
        0.0,
        1.0,
    ));
    p.road_awd_rear_percent = p.road_awd_rear_percent.filter(|v| v.is_finite());
    p.front_tire_width = positive(p.front_tire_width, 245.0);
    p.front_tire_aspect = positive(p.front_tire_aspect, 40.0);
    p.front_tire_rim = positive(p.front_tire_rim, 18.0);
    p.rear_tire_width = positive(p.rear_tire_width, 245.0);
    p.rear_tire_aspect = positive(p.rear_tire_aspect, 40.0);
    p.rear_tire_rim = positive(p.rear_tire_rim, 18.0);
    p
}

/// V4 view metadata is separate from the frozen `roadLaunch` saved JSON.
pub fn versioned_diagnostics(
    params: &TuningCarParams,
    limit_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
    result: &GearingResult,
) -> serde_json::Value {
    let p = normalize_road_gearing_inputs(params);
    let drive = p
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or_default();
    let front = drive == Drivetrain::FWD;
    let (w, a, r) = if front {
        (
            p.front_tire_width.unwrap(),
            p.front_tire_aspect.unwrap(),
            p.front_tire_rim.unwrap(),
        )
    } else {
        (
            p.rear_tire_width.unwrap(),
            p.rear_tire_aspect.unwrap(),
            p.rear_tire_rim.unwrap(),
        )
    };
    let raw_c = ((((w * a) / 100.0) * 2.0 + r * 25.4) * PI) / 1000.0;
    let circumference = if raw_c.is_finite() && raw_c > 0.1 {
        raw_c
    } else {
        2.0
    };
    let power_rpm = p
        .max_hp_rpm
        .filter(|v| *v > 0.0)
        .unwrap_or(limit_rpm * 0.85);
    let torque_rpm = p
        .max_torque_rpm
        .filter(|v| *v > 0.0)
        .unwrap_or(limit_rpm * 0.60);
    let hp = p.max_hp.unwrap().max(1.0);
    let torque = p
        .max_torque
        .filter(|v| *v > 0.0)
        .unwrap_or_else(|| hp * 7021.5 / torque_rpm.max(1.0));
    let first = road_launch_total_ratio(&p, torque, circumference / (2.0 * PI))
        .max(road_speed_total(drive, power_rpm, circumference));
    let mut target_speed =
        hp.powf(1.0 / 3.0) * 37.0 * (1.0 + 0.12 * p.aero_efficiency.unwrap()) * 0.95;
    if let Some(sc) = correction {
        for speed in [sc.simulated_top_speed, sc.soft_max_speed]
            .into_iter()
            .flatten()
        {
            if speed.is_finite() && speed > 0.0 {
                target_speed = target_speed.min(speed * power_rpm / limit_rpm);
            }
        }
    }
    let top = power_rpm * circumference * 60.0 / (target_speed * 1000.0);
    let original = serde_json::json!({"modelId":"aego-road-launch-envelope","modelVersion":"aego-road-launch-envelope/v3",
        "gearCount":result.gears.len(),"status":if result.unsupported==Some(true){"unavailable"}else{"available"},
        "reason":result.unsupported_reason,"targetSource":"road-engineering-priors","boundsSource":"model-prior-not-game-observation",
        "speedSemantics":"pure-rolling-wheel-speed-at-peak-power-rpm","tireRadiusM":circumference/(2.0*PI),
        "wheelCircumferenceM":circumference,"drivenTireAxle":if front{"front"}else{"rear"},"referenceRpm":power_rpm,"maxRpm":limit_rpm,
        "targetFirstTotalRatio":first,"targetTopTotalRatio":top,"targetSpeedKmh":target_speed,"performanceValidated":false});
    adjusted_diagnostics(result, &original)
}

pub fn respects_hard_targets(result: &GearingResult, d: &serde_json::Value) -> bool {
    let count = d["gearCount"].as_u64().unwrap_or(0) as usize;
    let number = |k: &str| d[k].as_f64().filter(|v| v.is_finite() && *v > 0.0);
    let (Some(first), Some(top)) = (
        number("targetFirstTotalRatio"),
        number("targetTopTotalRatio"),
    ) else {
        return false;
    };
    result.unsupported != Some(true)
        && (4..=10).contains(&count)
        && result.gears.len() == count
        && result.final_drive.is_finite()
        && result.final_drive > 0.0
        && result.gears.iter().all(|g| g.is_finite() && *g > 0.0)
        && result.gears.windows(2).all(|g| g[0] > g[1])
        && std::iter::once(&result.final_drive)
            .chain(&result.gears)
            .all(|v| (v * 100.0 - (v * 100.0).round()).abs() < 1e-7)
        && (result.final_drive * result.gears[0] - first).abs() <= result.final_drive * 0.005 + 1e-9
        && (result.final_drive * result.gears[count - 1] - top).abs()
            <= result.final_drive * 0.005 + 1e-9
}

pub fn adjusted_diagnostics(
    result: &GearingResult,
    original: &serde_json::Value,
) -> serde_json::Value {
    let mut d = original.clone();
    if !respects_hard_targets(result, &d) {
        d["status"] = serde_json::json!("unavailable");
        d["reason"] = serde_json::json!(
            "Road rounded ratios cannot preserve the original launch and top anchors"
        );
        return d;
    }
    let actual = calc_gear_speed(
        d["referenceRpm"].as_f64().unwrap(),
        *result.gears.last().unwrap(),
        result.final_drive,
        d["tireRadiusM"].as_f64().unwrap(),
    ) * 3.6;
    d["actualSpeedKmh"] = serde_json::json!(actual);
    d["endpointErrorKmh"] = serde_json::json!(actual - d["targetSpeedKmh"].as_f64().unwrap());
    d["actualFirstTotalRatio"] = serde_json::json!(result.final_drive * result.gears[0]);
    d["actualTopTotalRatio"] = serde_json::json!(result.final_drive * result.gears.last().unwrap());
    d
}

/// Road owns its launch priors, power-peak top-speed target, and joint grid.
pub(super) fn calculate(
    count: usize,
    params: &TuningCarParams,
    limit_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    if super::super::cvt::is_cvt(params) || params.is_electric == Some(true) {
        return GearingResult {
            final_drive: 0.0,
            gears: vec![],
            unsupported: Some(true),
            unsupported_reason: Some(
                if super::super::cvt::is_cvt(params) {
                    "CVT requires the independent capture foundation; solver unavailable."
                } else {
                    "EV requires the independent measured EV model."
                }
                .into(),
            ),
        };
    }
    let p = normalize_road_gearing_inputs(params);
    let count = if (1..=10).contains(&count) { count } else { 6 };
    let limit_rpm = if limit_rpm.is_finite() && limit_rpm > 0.0 {
        limit_rpm
    } else {
        7500.0
    };
    let drive = p
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);
    let hp = p.max_hp.unwrap().max(1.0);
    let power_rpm = p
        .max_hp_rpm
        .filter(|v| *v > 0.0)
        .unwrap_or(limit_rpm * 0.85);
    let torque_rpm = p
        .max_torque_rpm
        .filter(|v| *v > 0.0)
        .unwrap_or(limit_rpm * 0.60);
    let torque = p
        .max_torque
        .filter(|v| *v > 0.0)
        .unwrap_or_else(|| hp * 7021.5 / torque_rpm.max(1.0));
    let (width, aspect, rim) = if drive == Drivetrain::FWD {
        (
            p.front_tire_width.unwrap(),
            p.front_tire_aspect.unwrap(),
            p.front_tire_rim.unwrap(),
        )
    } else {
        (
            p.rear_tire_width.unwrap(),
            p.rear_tire_aspect.unwrap(),
            p.rear_tire_rim.unwrap(),
        )
    };
    let raw_c = ((((width * aspect) / 100.0) * 2.0 + rim * 25.4) * PI) / 1000.0;
    let circumference = if raw_c.is_finite() && raw_c > 0.1 {
        raw_c
    } else {
        2.0
    };
    // #462 envelope: both targets are engineering priors, not measured launch grip.
    let first_total = road_launch_total_ratio(&p, torque, circumference / (2.0 * PI))
        .max(road_speed_total(drive, power_rpm, circumference));
    let mut target_speed =
        hp.powf(1.0 / 3.0) * 37.0 * (1.0 + 0.12 * p.aero_efficiency.unwrap()) * 0.95;
    if let Some(sc) = correction {
        for speed in [sc.simulated_top_speed, sc.soft_max_speed]
            .into_iter()
            .flatten()
        {
            if speed.is_finite() && speed > 0.0 {
                target_speed = target_speed.min(speed * power_rpm / limit_rpm);
            }
        }
    }
    allocate_road_gearing(
        first_total,
        power_rpm * circumference * 60.0 / (target_speed * 1000.0),
        count,
    )
}
