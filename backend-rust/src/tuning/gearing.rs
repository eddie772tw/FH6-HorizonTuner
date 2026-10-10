use super::types::*;
use std::f64::consts::PI;

#[inline]
fn clamp(val: f64, min: f64, max: f64) -> f64 {
    val.max(min).min(max)
}

#[inline]
fn r2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

pub fn calc_gear_speed(rpm: f64, gear_ratio: f64, final_drive: f64, tire_radius_m: f64) -> f64 {
    if gear_ratio <= 0.0 || final_drive <= 0.0 {
        return 0.0;
    }
    (rpm * 2.0 * PI * tire_radius_m) / (gear_ratio * final_drive * 60.0)
}

pub fn calc_gear_rpm(speed_ms: f64, gear_ratio: f64, final_drive: f64, tire_radius_m: f64) -> f64 {
    if tire_radius_m <= 0.0 {
        return 0.0;
    }
    (speed_ms * gear_ratio * final_drive * 60.0) / (2.0 * PI * tire_radius_m)
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
        .unwrap_or(50.0)
        .max(1.0)
        .min(99.0)
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
        super::chassis::get_road_awd_rear_percent(params) / 100.0
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
    let mass = params.weight.unwrap_or(1400.0).max(1.0);
    mass * 9.81 * acceleration_g * radius_m / (torque_nm * 0.90)
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

/// Current production model. Frozen Road v2 is only for historical contracts.
pub fn calculate_aego_gearing(
    goal: RaceGoal,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    calculate_gearing(goal, count, params, max_rpm, correction, true)
}

/// Explicit compatibility owner for aego-road-joint/v2 and workflow-v1 history.
pub fn calculate_aego_gearing_v2(
    goal: RaceGoal,
    count: usize,
    params: &TuningCarParams,
    max_rpm: f64,
    correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    calculate_gearing(goal, count, params, max_rpm, correction, false)
}

fn calculate_gearing(
    race_goal: RaceGoal,
    mut num_gears: usize,
    car_params: &TuningCarParams,
    mut max_rpm: f64,
    secondary_correction: Option<&GearingSecondaryCorrection>,
    launch_envelope: bool,
) -> GearingResult {
    if super::cvt::is_cvt(car_params) || car_params.is_electric == Some(true) {
        return GearingResult {
            final_drive: 0.0,
            gears: vec![],
            unsupported: Some(true),
            unsupported_reason: Some(
                if super::cvt::is_cvt(car_params) {
                    "CVT requires the independent capture foundation; solver unavailable."
                } else {
                    "EV requires the independent measured EV model."
                }
                .into(),
            ),
        };
    }
    let normalized;
    let car_params = if race_goal == RaceGoal::Road {
        normalized = normalize_road_gearing_inputs(car_params);
        &normalized
    } else {
        car_params
    };
    if race_goal == RaceGoal::Road {
        if !max_rpm.is_finite() || max_rpm <= 0.0 {
            max_rpm = 7500.0;
        }
        if !(1..=10).contains(&num_gears) {
            num_gears = 6;
        }
    }
    if race_goal == RaceGoal::Rally {
        if !(1..=10).contains(&num_gears) {
            num_gears = 6;
        }
        if max_rpm <= 0.0 {
            max_rpm = 7500.0;
        }
    }

    let weight = car_params.weight.unwrap_or(1400.0).max(1.0);
    let dt = car_params
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);
    let max_hp = car_params.max_hp.unwrap_or(300.0).max(1.0);

    if race_goal == RaceGoal::Drag {
        let is_valid = (4..=10).contains(&num_gears)
            && max_rpm > 0.0
            && car_params.weight.map_or(false, |v| v > 0.0)
            && car_params.max_hp.map_or(false, |v| v > 0.0)
            && car_params.max_torque.map_or(false, |v| v >= 0.0)
            && car_params.max_hp_rpm.map_or(false, |v| v > 0.0)
            && car_params.max_torque_rpm.map_or(false, |v| v > 0.0);
        if !is_valid {
            return GearingResult {
                final_drive: 3.5,
                gears: vec![],
                unsupported: Some(true),
                unsupported_reason: Some(
                    "Drag gearing requires finite vehicle, RPM, torque, and 4-10 gear inputs."
                        .into(),
                ),
            };
        }
    }

    let rpm_hp = car_params
        .max_hp_rpm
        .filter(|&v| v > 0.0)
        .unwrap_or(max_rpm * 0.85);
    let rpm_t = car_params
        .max_torque_rpm
        .filter(|&v| v > 0.0)
        .unwrap_or(max_rpm * 0.60);

    let max_torque = car_params
        .max_torque
        .filter(|&v| v > 0.0)
        .unwrap_or_else(|| (max_hp * 7021.5) / rpm_t.max(1.0));

    let mut active_gear_count = if race_goal == RaceGoal::Drift || race_goal == RaceGoal::Drag {
        num_gears.min(4)
    } else {
        num_gears
    };

    let aero_efficiency = car_params.aero_efficiency.unwrap_or(0.5);
    let engine_type = car_params.induction.as_deref().unwrap_or("NA");

    let (w_tire, ar, s_rim) = if dt == Drivetrain::FWD {
        (
            car_params.front_tire_width.unwrap_or(245.0),
            car_params.front_tire_aspect.unwrap_or(40.0),
            car_params.front_tire_rim.unwrap_or(18.0),
        )
    } else {
        (
            car_params.rear_tire_width.unwrap_or(245.0),
            car_params.rear_tire_aspect.unwrap_or(40.0),
            car_params.rear_tire_rim.unwrap_or(18.0),
        )
    };

    let finish_speed_candidate = secondary_correction
        .and_then(|sc| sc.drag_finish_speed_kmh)
        .or(car_params.drag_finish_speed_kmh);
    let finish_speed_provenance = secondary_correction
        .and_then(|sc| sc.drag_finish_speed_provenance.as_deref())
        .or(car_params.drag_finish_speed_provenance.as_deref());
    let drag_finish_speed_kmh = finish_speed_candidate.filter(|&cand| {
        cand > 0.0
            && finish_speed_provenance.map_or(false, |prov| prov == "telemetry" || prov == "manual")
    });

    let c = ((((w_tire * ar) / 100.0) * 2.0 + s_rim * 25.4) * PI) / 1000.0;
    let f_drive = match dt {
        Drivetrain::AWD => 1.0,
        Drivetrain::RWD => 0.6,
        Drivetrain::FWD => 0.4,
    };

    let mut fd;
    let mut gears = vec![0.0; num_gears];

    match race_goal {
        RaceGoal::Drift => {
            let drift_weight = weight;
            let drift_torque = max_torque;
            let drift_rpm_hp = if rpm_hp > 0.0 { rpm_hp } else { 6000.0 };
            let drift_rpm_t = if rpm_t > 0.0 {
                rpm_t
            } else {
                drift_rpm_hp * 0.60
            };
            let base_drift_gear_ratios: [f64; 4] = [2.89, 1.99, 1.34, 1.0];
            let rpm_band = drift_rpm_t / drift_rpm_hp;
            let band_exponent = clamp(0.82 / clamp(rpm_band, 0.55, 0.95), 0.75, 1.25);
            let calc_gears = clamp(num_gears as f64, 4.0, 10.0) as usize;
            gears = vec![0.0; calc_gears];
            for i in 0..calc_gears {
                let position = (i as f64 / (calc_gears - 1) as f64) * 3.0;
                let lower = (position.floor() as usize).min(2);
                let fraction = position - lower as f64;
                let log_ratio = base_drift_gear_ratios[lower].ln() * (1.0 - fraction)
                    + base_drift_gear_ratios[lower + 1].ln() * fraction;
                gears[i] = log_ratio.exp().powf(band_exponent);
            }
            let circumference = if c > 0.0 { c } else { 2.0 };
            let raw_drift_fd =
                (drift_weight * f_drive * 2.0 * circumference) / (drift_torque * gears[0]) * 3.5;
            fd = clamp(raw_drift_fd, 2.2, 6.1);
            active_gear_count = calc_gears;
        }
        RaceGoal::Rally | RaceGoal::DangerSign => {
            let v_theo = 28.0
                * max_hp.powf(1.0 / 3.0)
                * if race_goal == RaceGoal::Rally
                    && car_params.rally_profile == Some(RallyProfile::CrossCountry)
                {
                    0.90
                } else {
                    1.0
                };
            let r = clamp(0.82 - 0.05 * ((max_torque / max_hp) - 1.1), 0.75, 0.85);
            gears[0] = 2.7;
            for i in 1..num_gears {
                gears[i] = gears[i - 1] * r;
            }
            let g_top = gears[num_gears - 1];
            fd = (rpm_hp * c * 60.0) / (g_top * v_theo * 1000.0);
            fd = clamp(fd, 2.0, 6.5);
        }
        RaceGoal::Drag => {
            let hp_per_kg = if weight > 0.0 { max_hp / weight } else { 0.5 };
            let prior_top_speed_kmh = 410.0 * hp_per_kg.powf(0.30) * (1.0 + 0.12 * aero_efficiency);
            let v_drag_top = drag_finish_speed_kmh.unwrap_or(prior_top_speed_kmh);

            let calc_gears = num_gears;
            active_gear_count = calc_gears;
            let idx_top = calc_gears - 1;

            let top_anchor = if num_gears >= 7 {
                0.82
            } else if num_gears >= 5 {
                0.90
            } else {
                1.0
            };
            gears[idx_top] = top_anchor;

            let target_total_ratio = (rpm_hp * c * 60.0) / (v_drag_top * 1000.0);
            let raw_fd = target_total_ratio / top_anchor;
            fd = clamp(raw_fd, 2.0, 6.1);

            if calc_gears > 1 {
                let v1_target = match dt {
                    Drivetrain::AWD => 110.0,
                    Drivetrain::FWD => 100.0,
                    Drivetrain::RWD => 125.0,
                };
                let raw_g1 = (rpm_hp * c * 60.0) / (v1_target * fd * 1000.0);
                gears[0] = clamp(raw_g1, 2.2, 5.0);

                gears[idx_top] = target_total_ratio / fd;
                if gears[idx_top] <= 0.0 {
                    return GearingResult {
                        final_drive: fd,
                        gears: vec![],
                        unsupported: Some(true),
                        unsupported_reason: Some(
                            "Requested Drag finish speed is outside the available ratio range."
                                .into(),
                        ),
                    };
                }
                gears[idx_top] = gears[idx_top].min(gears[0] * (0.92_f64).powi(idx_top as i32));

                let r_drag = (gears[idx_top] / gears[0]).powf(1.0 / idx_top as f64);
                for i in 1..idx_top {
                    gears[i] = gears[i - 1] * r_drag;
                }
            }
        }
        RaceGoal::Road => {
            let load_target = road_launch_total_ratio(car_params, max_torque, c / (2.0 * PI));
            // #462: the peak-torque load estimate is not an equality constraint
            // on launch gearing. Preserve #446 shortening when it dominates,
            // but do not let high torque lengthen the inherited v1.6 speed target.
            // Both are engineering priors, not observed launch grip or optimal shifts.
            // See docs/tuning/aego-road-launch-v3.md for provenance and limitations.
            let first_total = if launch_envelope {
                load_target.max(road_speed_total(dt, rpm_hp, c))
            } else {
                load_target
            };
            let mut target_speed =
                max_hp.powf(1.0 / 3.0) * 37.0 * (1.0 + 0.12 * aero_efficiency) * 0.95;
            if let Some(sc) = secondary_correction {
                for speed in [sc.simulated_top_speed, sc.soft_max_speed]
                    .into_iter()
                    .flatten()
                {
                    if speed.is_finite() && speed > 0.0 {
                        target_speed = target_speed.min(speed * rpm_hp / max_rpm);
                    }
                }
            }
            return allocate_road_gearing(
                first_total,
                rpm_hp * c * 60.0 / (target_speed * 1000.0),
                num_gears,
            );
        }
    }

    // Secondary Correction Mechanism
    if let Some(sc) = secondary_correction {
        if sc.simulated_top_speed.is_some()
            || sc.soft_max_speed.is_some()
            || sc.drag_finish_speed_kmh.is_some()
            || drag_finish_speed_kmh.is_some()
        {
            let tire_radius_m = c / (2.0 * PI);
            let top_gear_idx = active_gear_count - 1;

            let baseline_top_speed_ms =
                calc_gear_speed(rpm_hp, gears[top_gear_idx], fd, tire_radius_m);
            let baseline_top_speed_kmh = baseline_top_speed_ms * 3.6;

            let mut target_top_speed_at_peak_hp_kmh = baseline_top_speed_kmh;

            if race_goal != RaceGoal::Drag {
                if let Some(soft_max) = sc.soft_max_speed {
                    if soft_max > 0.0 && max_rpm > 0.0 {
                        let max_speed_at_peak_hp_from_soft_cap = soft_max * (rpm_hp / max_rpm);
                        target_top_speed_at_peak_hp_kmh =
                            target_top_speed_at_peak_hp_kmh.min(max_speed_at_peak_hp_from_soft_cap);
                    }
                }
            }

            if let Some(simulated) = sc.simulated_top_speed {
                if simulated > 0.0 {
                    let max_speed_at_peak_hp = if max_rpm > 0.0 {
                        simulated * (rpm_hp / max_rpm)
                    } else {
                        simulated
                    };
                    target_top_speed_at_peak_hp_kmh =
                        target_top_speed_at_peak_hp_kmh.min(max_speed_at_peak_hp);
                }
            }

            if race_goal == RaceGoal::Drag {
                if let Some(df) = drag_finish_speed_kmh {
                    if df > 0.0 {
                        target_top_speed_at_peak_hp_kmh = df;
                    }
                }
            }

            if target_top_speed_at_peak_hp_kmh > 0.0
                && (target_top_speed_at_peak_hp_kmh - baseline_top_speed_kmh).abs() > 0.1
            {
                let target_top_total_ratio =
                    (rpm_hp * c * 60.0) / (target_top_speed_at_peak_hp_kmh * 1000.0);
                let base_top_gear = gears[top_gear_idx];

                let target_fd = target_top_total_ratio / base_top_gear;

                if (2.0..=6.1).contains(&target_fd) {
                    fd = target_fd;
                } else {
                    fd = clamp(target_fd, 2.0, 6.1);
                    let mut new_gtop = target_top_total_ratio / fd;

                    if top_gear_idx > 0 && gears[top_gear_idx - 1] > 0.0 {
                        let prev_gear = gears[top_gear_idx - 1];
                        let max_allowed_top_gear = prev_gear * 0.90;
                        let min_allowed_top_gear = prev_gear * 0.70;

                        new_gtop = clamp(new_gtop, min_allowed_top_gear, max_allowed_top_gear);
                        gears[top_gear_idx] = new_gtop;

                        let num_steps = top_gear_idx;
                        let r_band = if rpm_hp > 0.0 { rpm_t / rpm_hp } else { 0.65 };
                        let r_redline_hp = if max_rpm > 0.0 {
                            rpm_hp / max_rpm
                        } else {
                            0.85
                        };
                        let is_turbo = engine_type == "Turbo" || engine_type == "TwinTurbo";
                        let r_min = if is_turbo {
                            (0.68_f64).max(r_redline_hp * (0.80_f64).max(r_band))
                        } else {
                            (0.62_f64).max(r_redline_hp * (0.75_f64).max(r_band))
                        };
                        let r_max = (0.92_f64).min(r_redline_hp);

                        let mut r_raw = Vec::with_capacity(num_steps);
                        let mut prod_raw = 1.0;
                        for i in 1..=num_steps {
                            let fraction = if num_steps > 1 {
                                (i as f64 - 1.0) / (num_steps as f64 - 1.0)
                            } else {
                                0.0
                            };
                            let r_val = r_min + (r_max - r_min) * fraction;
                            r_raw.push(r_val);
                            prod_raw *= r_val;
                        }

                        let s = (new_gtop / (gears[0] * prod_raw)).powf(1.0 / num_steps as f64);
                        for i in 1..top_gear_idx {
                            let r_adj = r_raw[i - 1] * s;
                            gears[i] = gears[i - 1] * r_adj;
                        }
                    } else {
                        gears[top_gear_idx] = new_gtop;
                    }

                    for i in active_gear_count..num_gears {
                        gears[i] = gears[top_gear_idx];
                    }
                }
            }
        }
    }

    if fd.is_nan() || fd.is_infinite() || fd == 0.0 {
        fd = 3.50;
    }
    for g in gears.iter_mut() {
        if g.is_nan() || g.is_infinite() || *g == 0.0 {
            *g = 1.0;
        }
    }

    fd = clamp(fd, 2.0, 6.1);
    let rounded_fd = r2(fd);
    let mut rounded_gears: Vec<f64> = gears.iter().map(|&g| r2(g)).collect();

    let monotonic_limit = active_gear_count;
    let max_step_ratio_rounded =
        if max_rpm > 0.0 && race_goal != RaceGoal::Drift && race_goal != RaceGoal::Drag {
            (rpm_hp + 50.0) / max_rpm
        } else {
            0.92
        };

    for i in 1..monotonic_limit {
        let max_allowed_ratio = (r2(rounded_gears[i - 1] - 0.01))
            .min((rounded_gears[i - 1] * max_step_ratio_rounded * 100.0).floor() / 100.0);
        if rounded_gears[i] > max_allowed_ratio {
            rounded_gears[i] = (0.40_f64).max(max_allowed_ratio);
        }
    }

    for i in active_gear_count..rounded_gears.len() {
        rounded_gears[i] = rounded_gears[active_gear_count - 1];
    }

    GearingResult {
        final_drive: rounded_fd,
        gears: rounded_gears,
        unsupported: None,
        unsupported_reason: None,
    }
}
