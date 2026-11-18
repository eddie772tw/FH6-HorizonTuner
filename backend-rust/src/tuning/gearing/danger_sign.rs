//! Current DangerSign policy extracted unchanged from the shared pre-stack owner.
//! This is not an ICE AEGO model or a historical replay engine.
use super::super::types::*;
use super::kinematics::calc_gear_speed;
use std::f64::consts::PI;
fn clamp(v: f64, min: f64, max: f64) -> f64 {
    v.max(min).min(max)
}
fn r2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}
pub fn calculate(
    mut num_gears: usize,
    car_params: &TuningCarParams,
    mut max_rpm: f64,
    secondary_correction: Option<&GearingSecondaryCorrection>,
) -> GearingResult {
    if super::super::cvt::is_cvt(car_params) || car_params.is_electric == Some(true) {
        return GearingResult {
            final_drive: 0.0,
            gears: vec![],
            unsupported: Some(true),
            unsupported_reason: Some(
                if super::super::cvt::is_cvt(car_params) {
                    "CVT requires the independent capture foundation; solver unavailable."
                } else {
                    "EV requires the independent measured EV model."
                }
                .into(),
            ),
        };
    }
    let race_goal = RaceGoal::DangerSign;
    if !max_rpm.is_finite() || max_rpm <= 0.0 {
        max_rpm = 7500.0;
    }
    if !(1..=10).contains(&num_gears) {
        num_gears = 6;
    }
    let active_gear_count = num_gears;
    let dt = car_params
        .drivetrain
        .as_deref()
        .map(Drivetrain::from_str_loose)
        .unwrap_or(Drivetrain::RWD);
    let max_hp = car_params.max_hp.unwrap_or(300.0).max(1.0);
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
    let raw_c = ((((w_tire * ar) / 100.0) * 2.0 + s_rim * 25.4) * PI) / 1000.0;
    let c = if raw_c.is_finite() && raw_c > 0.1 {
        raw_c
    } else {
        2.0
    };
    let v_theo = 28.0 * max_hp.powf(1.0 / 3.0) * 1.0;
    let r = clamp(0.82 - 0.05 * ((max_torque / max_hp) - 1.1), 0.75, 0.85);
    let mut gears = vec![0.0; num_gears];
    gears[0] = 2.7;
    for i in 1..num_gears {
        gears[i] = gears[i - 1] * r;
    }
    let g_top = gears[num_gears - 1];
    let mut fd = (rpm_hp * c * 60.0) / (g_top * v_theo * 1000.0);
    fd = clamp(fd, 2.0, 6.5);
    // Secondary Correction Mechanism
    if let Some(sc) = secondary_correction {
        if sc.simulated_top_speed.is_some() || sc.soft_max_speed.is_some() {
            let tire_radius_m = c / (2.0 * PI);
            let top_gear_idx = active_gear_count - 1;

            let baseline_top_speed_ms =
                calc_gear_speed(rpm_hp, gears[top_gear_idx], fd, tire_radius_m);
            let baseline_top_speed_kmh = baseline_top_speed_ms * 3.6;

            let mut target_top_speed_at_peak_hp_kmh = baseline_top_speed_kmh;

            if race_goal != RaceGoal::Drag {
                if let Some(soft_max) = sc.soft_max_speed {
                    if soft_max.is_finite() && soft_max > 0.0 && max_rpm > 0.0 {
                        let max_speed_at_peak_hp_from_soft_cap = soft_max * (rpm_hp / max_rpm);
                        target_top_speed_at_peak_hp_kmh =
                            target_top_speed_at_peak_hp_kmh.min(max_speed_at_peak_hp_from_soft_cap);
                    }
                }
            }

            if let Some(simulated) = sc.simulated_top_speed {
                if simulated.is_finite() && simulated > 0.0 {
                    let max_speed_at_peak_hp = if max_rpm > 0.0 {
                        simulated * (rpm_hp / max_rpm)
                    } else {
                        simulated
                    };
                    target_top_speed_at_peak_hp_kmh =
                        target_top_speed_at_peak_hp_kmh.min(max_speed_at_peak_hp);
                }
            }

            if target_top_speed_at_peak_hp_kmh.is_finite()
                && target_top_speed_at_peak_hp_kmh > 0.0
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
                        let r_max = (0.92_f64).min(r_redline_hp).max(r_min);

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

                        let denom = gears[0] * prod_raw;
                        let ratio = if denom.is_finite() && denom > 0.0 {
                            new_gtop / denom
                        } else {
                            0.0
                        };
                        let s = if ratio.is_finite() && ratio > 0.0 {
                            ratio.powf(1.0 / num_steps as f64)
                        } else {
                            1.0
                        };
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
            ((rpm_hp + 50.0) / max_rpm).clamp(0.65, 0.95)
        } else {
            0.92
        };

    for i in 1..monotonic_limit {
        let max_allowed_ratio = (r2(rounded_gears[i - 1] - 0.01))
            .min((rounded_gears[i - 1] * max_step_ratio_rounded * 100.0).floor() / 100.0);
        if rounded_gears[i] > max_allowed_ratio {
            rounded_gears[i] = max_allowed_ratio.max(0.10);
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
