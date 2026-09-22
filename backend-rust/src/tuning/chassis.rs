use super::types::*;

#[inline]
fn clamp(val: f64, min: f64, max: f64) -> f64 {
    val.max(min).min(max)
}

#[inline]
fn r1(n: f64) -> f64 {
    (n * 10.0).round() / 10.0
}

/// Resolves aerodynamic downforce for front and rear axles (in kgf).
pub fn resolve_aero_downforce(params: &TuningCarParams) -> AeroDownforceResult {
    let weight_kg = params.weight.unwrap_or(1400.0).max(0.1);
    let wf = params.weight_distribution.unwrap_or(50.0).max(0.1);
    let wr = (100.0 - wf).max(0.1);
    let dt = params
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);

    let f_val = params.aero_downforce_front.unwrap_or(0.0);
    let r_val = params.aero_downforce_rear.unwrap_or(0.0);

    let drivetrain_modifier = match dt {
        Drivetrain::RWD => 0.82,
        _ => 1.05,
    };

    if f_val > 0.0 && r_val > 0.0 {
        return AeroDownforceResult {
            front: r1(f_val),
            rear: r1(r_val),
        };
    }

    let ratio = (wf / wr) * drivetrain_modifier;

    if f_val > 0.0 && r_val <= 0.0 {
        let derived_rear = f_val / ratio;
        return AeroDownforceResult {
            front: r1(f_val),
            rear: r1(derived_rear),
        };
    }

    if r_val > 0.0 && f_val <= 0.0 {
        let derived_front = r_val * ratio;
        return AeroDownforceResult {
            front: r1(derived_front),
            rear: r1(r_val),
        };
    }

    // Both <= 0 -> Derive from 20% of vehicle weight in lbs (converted to kgf)
    let weight_lbs = weight_kg * 2.20462;
    let total_target_lbs = weight_lbs * 0.20;
    let total_target_kgf = total_target_lbs / 2.20462;

    let derived_rear = total_target_kgf / (1.0 + ratio);
    let derived_front = total_target_kgf - derived_rear;

    AeroDownforceResult {
        front: r1(derived_front),
        rear: r1(derived_rear),
    }
}

pub fn get_road_awd_rear_percent(params: &TuningCarParams) -> f64 {
    let front = params
        .weight_distribution
        .unwrap_or(50.0)
        .max(1.0)
        .min(99.0);
    if let Some(r) = params.road_awd_rear_percent {
        r.max(0.0).min(100.0)
    } else {
        (100.0 - front + 20.0).max(60.0).min(85.0)
    }
}

fn normalize_road_inputs(params: &TuningCarParams) -> TuningCarParams {
    let mut p = params.clone();
    p.weight = Some(p.weight.unwrap_or(1400.0).max(1.0));
    p.weight_distribution = Some(p.weight_distribution.unwrap_or(50.0).max(1.0).min(99.0));
    p.max_hp = Some(p.max_hp.unwrap_or(300.0).max(1.0));
    p.max_torque = Some(p.max_torque.unwrap_or(0.0).max(0.0));
    p.max_hp_rpm = Some(p.max_hp_rpm.unwrap_or(0.0).max(0.0));
    p.max_torque_rpm = Some(p.max_torque_rpm.unwrap_or(0.0).max(0.0));
    p.aero_efficiency = Some(p.aero_efficiency.unwrap_or(0.5).max(0.0).min(1.0));
    p.aero_downforce_front = Some(p.aero_downforce_front.unwrap_or(0.0).max(0.0));
    p.aero_downforce_rear = Some(p.aero_downforce_rear.unwrap_or(0.0).max(0.0));
    p.front_tire_width = Some(p.front_tire_width.unwrap_or(245.0).max(1.0));
    p.front_tire_aspect = Some(p.front_tire_aspect.unwrap_or(40.0).max(1.0));
    p.front_tire_rim = Some(p.front_tire_rim.unwrap_or(18.0).max(1.0));
    p.rear_tire_width = Some(p.rear_tire_width.unwrap_or(245.0).max(1.0));
    p.rear_tire_aspect = Some(p.rear_tire_aspect.unwrap_or(40.0).max(1.0));
    p.rear_tire_rim = Some(p.rear_tire_rim.unwrap_or(18.0).max(1.0));

    let min_kf = p.spring_front_min.unwrap_or(10.0).max(1.0);
    p.spring_front_min = Some(min_kf);
    p.spring_front_max = Some(p.spring_front_max.unwrap_or(120.0).max(min_kf));

    let min_kr = p.spring_rear_min.unwrap_or(10.0).max(1.0);
    p.spring_rear_min = Some(min_kr);
    p.spring_rear_max = Some(p.spring_rear_max.unwrap_or(120.0).max(min_kr));

    let min_hf = p.height_front_min.unwrap_or(10.0).max(1.0);
    p.height_front_min = Some(min_hf);
    p.height_front_max = Some(p.height_front_max.unwrap_or(25.0).max(min_hf));

    let min_hr = p.height_rear_min.unwrap_or(10.0).max(1.0);
    p.height_rear_min = Some(min_hr);
    p.height_rear_max = Some(p.height_rear_max.unwrap_or(25.0).max(min_hr));

    p
}

fn rally_calculation_inputs(params: &TuningCarParams) -> TuningCarParams {
    let mut p = params.clone();
    p.weight = Some(p.weight.unwrap_or(1400.0).max(1.0));
    p.weight_distribution = Some(p.weight_distribution.unwrap_or(50.0).max(1.0).min(99.0));
    p.max_hp = Some(p.max_hp.unwrap_or(300.0).max(1.0));
    p.max_torque = Some(p.max_torque.unwrap_or(0.0).max(0.0));
    p.max_hp_rpm = Some(p.max_hp_rpm.unwrap_or(0.0).max(0.0));
    p.max_torque_rpm = Some(p.max_torque_rpm.unwrap_or(0.0).max(0.0));
    p.aero_downforce_front = Some(p.aero_downforce_front.unwrap_or(0.0).max(0.0));
    p.aero_downforce_rear = Some(p.aero_downforce_rear.unwrap_or(0.0).max(0.0));

    let min_kf = p.spring_front_min.unwrap_or(10.0).max(1.0);
    p.spring_front_min = Some(min_kf);
    p.spring_front_max = Some(p.spring_front_max.unwrap_or(120.0).max(min_kf));

    let min_kr = p.spring_rear_min.unwrap_or(10.0).max(1.0);
    p.spring_rear_min = Some(min_kr);
    p.spring_rear_max = Some(p.spring_rear_max.unwrap_or(120.0).max(min_kr));

    let min_hf = p.height_front_min.unwrap_or(10.0).max(1.0);
    p.height_front_min = Some(min_hf);
    p.height_front_max = Some(p.height_front_max.unwrap_or(25.0).max(min_hf));

    let min_hr = p.height_rear_min.unwrap_or(10.0).max(1.0);
    p.height_rear_min = Some(min_hr);
    p.height_rear_max = Some(p.height_rear_max.unwrap_or(25.0).max(min_hr));

    p
}

/// Calculates complete chassis tuning (ARBs, Springs, Ride Height, Damping, Differential).
pub fn calculate_chassis_tuning(
    race_goal: RaceGoal,
    car_params: &TuningCarParams,
) -> ChassisTuningResult {
    let p = match race_goal {
        RaceGoal::Road => normalize_road_inputs(car_params),
        RaceGoal::Rally | RaceGoal::DangerSign => rally_calculation_inputs(car_params),
        _ => car_params.clone(),
    };

    let weight = p.weight.unwrap_or(1400.0).max(1.0);
    let wf = p.weight_distribution.unwrap_or(50.0).max(1.0).min(99.0);
    let wr = 100.0 - wf;
    let dt = p
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);

    let k_min_f = p.spring_front_min.unwrap_or(10.0);
    let k_max_f = p.spring_front_max.unwrap_or(120.0);
    let k_min_r = p.spring_rear_min.unwrap_or(10.0);
    let k_max_r = p.spring_rear_max.unwrap_or(120.0);

    let h_min_f = p.height_front_min.unwrap_or(10.0);
    let h_max_f = p.height_front_max.unwrap_or(25.0);
    let h_min_r = p.height_rear_min.unwrap_or(10.0);
    let h_max_r = p.height_rear_max.unwrap_or(25.0);

    let aero = resolve_aero_downforce(&p);

    let (
        arb_f,
        arb_r,
        spring_f,
        spring_r,
        height_f,
        height_r,
        mut reb_f,
        mut reb_r,
        bump_f,
        bump_r,
    );
    let mut accel_f = 0.0;
    let mut decel_f = 0.0;
    let mut accel_r = 0.0;
    let mut decel_r = 0.0;
    let mut center_rear = 50.0;

    let click = 0.5;

    match race_goal {
        RaceGoal::Drift => {
            arb_f = 1.0 + 64.0 / 3.0;
            arb_r = arb_f * 1.2;

            spring_f = weight * (wf / 100.0) * 0.035;
            spring_r = weight * (wr / 100.0) * 0.035;

            height_f = h_min_f + 1.0 * click;
            height_r = h_min_r + 2.0 * click;

            let bounded_f = clamp(spring_f, k_min_f, k_max_f);
            let bounded_r = clamp(spring_r, k_min_r, k_max_r);
            let spring_fraction_f = (bounded_f - k_min_f) / (k_max_f - k_min_f).max(1e-6);
            let spring_fraction_r = (bounded_r - k_min_r) / (k_max_r - k_min_r).max(1e-6);

            reb_f = 1.0 + 19.0 * spring_fraction_f;
            reb_r = 1.0 + 19.0 * spring_fraction_r;
            bump_f = reb_f * 0.60;
            bump_r = reb_r * 0.60;

            match dt {
                Drivetrain::AWD => {
                    accel_f = 85.0;
                    decel_f = 5.0;
                    accel_r = 60.0;
                    decel_r = 15.0;
                    center_rear = 75.0;
                }
                Drivetrain::FWD => {
                    accel_f = 85.0;
                    decel_f = 5.0;
                }
                Drivetrain::RWD => {
                    accel_r = 90.0;
                    decel_r = 15.0;
                }
            }
        }
        RaceGoal::Rally | RaceGoal::DangerSign => {
            let base_arb_f = 64.0 * (wf / 100.0) + 1.0;
            let base_arb_r = 64.0 * (wr / 100.0) + 1.0;
            let is_cross_country =
                race_goal == RaceGoal::Rally && p.rally_profile == Some(RallyProfile::CrossCountry);

            arb_f = base_arb_f
                * if is_cross_country {
                    0.38
                } else if race_goal == RaceGoal::Rally {
                    0.32
                } else {
                    0.35
                };
            arb_r = base_arb_r
                * if is_cross_country {
                    0.46
                } else if race_goal == RaceGoal::Rally {
                    0.32
                } else {
                    0.35
                };

            let base_spring_f = (k_max_f - k_min_f) * (wf / 100.0) + k_min_f;
            let base_spring_r = (k_max_r - k_min_r) * (wr / 100.0) + k_min_r;
            let spring_scale = if is_cross_country { 0.85 } else { 0.65 };
            spring_f = base_spring_f * spring_scale;
            spring_r = base_spring_r * spring_scale;

            let h_fraction = if is_cross_country || race_goal == RaceGoal::DangerSign {
                1.0
            } else {
                0.85
            };
            height_f = h_min_f + h_fraction * (h_max_f - h_min_f);
            height_r = h_min_r + h_fraction * (h_max_r - h_min_r);

            let rebound_scale = if is_cross_country { 1.10 } else { 1.0 };
            reb_f = (14.0 * (wf / 100.0) + 1.0) * rebound_scale;
            reb_r = (14.0 * (wr / 100.0) + 1.0) * rebound_scale;
            let bump_ratio = if is_cross_country { 0.50 } else { 0.40 };
            bump_f = reb_f * bump_ratio;
            bump_r = reb_r * bump_ratio;

            let lock_boost = if is_cross_country { 10.0 } else { 0.0 };
            match dt {
                Drivetrain::AWD => {
                    accel_f = 40.0 + lock_boost;
                    decel_f = 10.0 + lock_boost;
                    accel_r = 80.0 + lock_boost;
                    decel_r = 25.0 + lock_boost;
                    center_rear = if is_cross_country { 55.0 } else { 65.0 };
                }
                Drivetrain::FWD => {
                    accel_f = 60.0 + lock_boost;
                    decel_f = 15.0 + if is_cross_country { 5.0 } else { 0.0 };
                }
                Drivetrain::RWD => {
                    accel_r = 75.0 + lock_boost;
                    decel_r = 25.0 + if is_cross_country { 5.0 } else { 0.0 };
                }
            }
        }
        RaceGoal::Drag => match dt {
            Drivetrain::FWD => {
                arb_f = 55.0;
                arb_r = 65.0;
                spring_f = k_min_f + 0.15 * (k_max_f - k_min_f);
                spring_r = k_min_r + 0.25 * (k_max_r - k_min_r);
                height_f = h_min_f;
                height_r = h_max_r;
                reb_f = 8.0;
                bump_f = 12.0;
                reb_r = 8.0;
                bump_r = 10.0;
                accel_f = 85.0;
                decel_f = 0.0;
            }
            Drivetrain::RWD => {
                arb_f = 65.0;
                arb_r = 65.0;
                spring_f = k_min_f + 0.20 * (k_max_f - k_min_f);
                spring_r = k_min_r + 0.20 * (k_max_r - k_min_r);
                height_f = h_max_f;
                height_r = h_max_r;
                reb_f = 3.0;
                bump_f = 12.0;
                reb_r = 12.0;
                bump_r = 4.0;
                accel_r = 85.0;
                decel_r = 0.0;
            }
            Drivetrain::AWD => {
                arb_f = 65.0;
                arb_r = 65.0;
                spring_f = k_min_f + 0.20 * (k_max_f - k_min_f);
                spring_r = k_min_r + 0.20 * (k_max_r - k_min_r);
                height_f = h_max_f;
                height_r = h_max_r;
                reb_f = 3.0;
                bump_f = 12.0;
                reb_r = 12.0;
                bump_r = 4.0;
                accel_f = 85.0;
                decel_f = 0.0;
                accel_r = 65.0;
                decel_r = 10.0;
                center_rear = 75.0;
            }
        },
        RaceGoal::Road => {
            let road_front = wf / 100.0;
            let road_rear = 1.0 - road_front;

            match dt {
                Drivetrain::AWD => {
                    arb_f = (1.0 + road_front * 4.0).min(5.0);
                    arb_r = (65.0 - (100.0 - wr) * 0.3).max(50.0);
                }
                Drivetrain::FWD => {
                    arb_f = 1.0 + 32.0 * road_front;
                    arb_r = 1.0 + 64.0 * (road_rear + 0.25).min(0.80);
                }
                Drivetrain::RWD => {
                    arb_f = 64.0 * road_front + 1.0;
                    arb_r = 64.0 * road_rear + 1.0;
                }
            }

            let base_spring_f = (k_max_f - k_min_f) * road_front + k_min_f;
            let base_spring_r = (k_max_r - k_min_r) * road_rear + k_min_r;
            let delta_kf = (aero.front / 10.0) * 0.5;
            let delta_kr = (aero.rear / 25.0) * 0.5;

            if dt == Drivetrain::FWD {
                spring_f = k_min_f + (k_max_f - k_min_f) * (road_front - 0.10).max(0.10) + delta_kf;
                spring_r = k_min_r + (k_max_r - k_min_r) * (road_rear + 0.10).min(0.90) + delta_kr;
            } else {
                spring_f = base_spring_f + delta_kf;
                spring_r = base_spring_r + delta_kr;
            }

            height_f = h_min_f + 3.0 * click;
            height_r = h_min_r + 3.0 * click;

            reb_f = 19.0 * road_front + 1.0;
            reb_r = 19.0 * road_rear + 1.0;

            if dt == Drivetrain::FWD {
                reb_f = (19.0 * road_front + 1.0)
                    * (spring_f / (base_spring_f + delta_kf).max(1.0)).sqrt();
                reb_r = (19.0 * road_rear + 1.0)
                    * (spring_r / (base_spring_r + delta_kr).max(1.0)).sqrt();
            }
            bump_f = reb_f * 0.60;
            bump_r = reb_r * 0.60;

            match dt {
                Drivetrain::FWD => {
                    accel_f = 25.0;
                    decel_f = 5.0;
                }
                Drivetrain::RWD => {
                    accel_r = (40.0 + (wr - 50.0) * 0.5).max(40.0).min(65.0);
                    decel_r = 20.0;
                }
                Drivetrain::AWD => {
                    accel_f = 15.0;
                    decel_f = 0.0;
                    accel_r = 75.0;
                    decel_r = 15.0;
                    center_rear = get_road_awd_rear_percent(&p);
                }
            }
        }
    }

    ChassisTuningResult {
        arb: ArbResult {
            front: r1(clamp(arb_f, 1.0, 65.0)),
            rear: r1(clamp(arb_r, 1.0, 65.0)),
        },
        springs: SpringsResult {
            front: r1(clamp(spring_f, k_min_f, k_max_f)),
            rear: r1(clamp(spring_r, k_min_r, k_max_r)),
            height_f: r1(clamp(height_f, h_min_f, h_max_f)),
            height_r: r1(clamp(height_r, h_min_r, h_max_r)),
        },
        damping: DampingResult {
            rebound_f: r1(clamp(reb_f, 1.0, 20.0)),
            rebound_r: r1(clamp(reb_r, 1.0, 20.0)),
            bump_f: r1(clamp(bump_f, 1.0, 20.0)),
            bump_r: r1(clamp(bump_r, 1.0, 20.0)),
        },
        diff: DiffResult {
            accel_f: r1(clamp(accel_f, 0.0, 100.0)),
            decel_f: r1(clamp(decel_f, 0.0, 100.0)),
            accel_r: r1(clamp(accel_r, 0.0, 100.0)),
            decel_r: r1(clamp(decel_r, 0.0, 100.0)),
            center_rear: r1(clamp(
                center_rear,
                if race_goal == RaceGoal::Road && dt == Drivetrain::AWD {
                    0.0
                } else {
                    10.0
                },
                if race_goal == RaceGoal::Road && dt == Drivetrain::AWD {
                    100.0
                } else {
                    90.0
                },
            )),
        },
    }
}
