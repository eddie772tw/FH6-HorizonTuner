use fh6_backend::tuning::{
    alignment::{calculate_static_alignment, Season},
    calculate_chassis_tuning,
    gearing::calculate_aego_gearing_v2 as calculate_aego_gearing,
    resolve_aero_downforce, GearingSecondaryCorrection, RaceGoal, TuningCarParams,
};
use serde_json::Value;
use std::path::Path;

#[test]
fn frozen_v2_tuning_core_matches_immutable_golden_fixtures() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let fixture_path = manifest_dir
        .parent()
        .expect("parent dir")
        .join("tests/fixtures/tuning_golden_fixtures.json");

    assert!(
        fixture_path.exists(),
        "tuning_golden_fixtures.json must exist at {:?}",
        fixture_path
    );

    let content = std::fs::read_to_string(&fixture_path).expect("read fixture file");
    let root: Value = serde_json::from_str(&content).expect("parse fixture json");

    let cases = root["cases"].as_array().expect("cases array");
    assert_eq!(
        cases.len(),
        21,
        "Must contain the original 18 and three Road regression cases"
    );

    for c in cases {
        let id = c["id"].as_str().unwrap();
        let race_goal_str = c["raceGoal"].as_str().unwrap();
        let race_goal = RaceGoal::from_str_loose(race_goal_str);

        let inputs = &c["inputs"];
        let car_params: TuningCarParams =
            serde_json::from_value(inputs["carParams"].clone()).expect("parse carParams");
        let max_rpm = inputs["maxRpm"].as_f64().unwrap();
        let num_gears = inputs["numGears"].as_u64().unwrap() as usize;
        let secondary_correction: Option<GearingSecondaryCorrection> =
            inputs.get("secondaryCorrection").and_then(|sc| {
                if sc.is_null() {
                    None
                } else {
                    serde_json::from_value(sc.clone()).ok()
                }
            });

        let expected = &c["expected"];

        // 1. Aero Downforce
        let actual_aero = resolve_aero_downforce(&car_params);
        let exp_aero_f = expected["aeroDownforce"]["front"].as_f64().unwrap();
        let exp_aero_r = expected["aeroDownforce"]["rear"].as_f64().unwrap();
        assert!(
            (actual_aero.front - exp_aero_f).abs() <= 0.1,
            "[{}] aero.front actual {} vs exp {}",
            id,
            actual_aero.front,
            exp_aero_f
        );
        assert!(
            (actual_aero.rear - exp_aero_r).abs() <= 0.1,
            "[{}] aero.rear actual {} vs exp {}",
            id,
            actual_aero.rear,
            exp_aero_r
        );

        // 2. Chassis Tuning
        let actual_chassis = calculate_chassis_tuning(race_goal, &car_params);
        let exp_arb_f = expected["chassis"]["arb"]["front"].as_f64().unwrap();
        let exp_arb_r = expected["chassis"]["arb"]["rear"].as_f64().unwrap();
        assert!(
            (actual_chassis.arb.front - exp_arb_f).abs() <= 0.1,
            "[{}] arb.front actual {} vs exp {}",
            id,
            actual_chassis.arb.front,
            exp_arb_f
        );
        assert!(
            (actual_chassis.arb.rear - exp_arb_r).abs() <= 0.1,
            "[{}] arb.rear actual {} vs exp {}",
            id,
            actual_chassis.arb.rear,
            exp_arb_r
        );

        let exp_spring_f = expected["chassis"]["springs"]["front"].as_f64().unwrap();
        let exp_spring_r = expected["chassis"]["springs"]["rear"].as_f64().unwrap();
        let exp_h_f = expected["chassis"]["springs"]["heightF"].as_f64().unwrap();
        let exp_h_r = expected["chassis"]["springs"]["heightR"].as_f64().unwrap();
        assert!(
            (actual_chassis.springs.front - exp_spring_f).abs() <= 0.1,
            "[{}] springs.front actual {} vs exp {}",
            id,
            actual_chassis.springs.front,
            exp_spring_f
        );
        assert!(
            (actual_chassis.springs.rear - exp_spring_r).abs() <= 0.1,
            "[{}] springs.rear actual {} vs exp {}",
            id,
            actual_chassis.springs.rear,
            exp_spring_r
        );
        assert!(
            (actual_chassis.springs.height_f - exp_h_f).abs() <= 0.1,
            "[{}] height_f actual {} vs exp {}",
            id,
            actual_chassis.springs.height_f,
            exp_h_f
        );
        assert!(
            (actual_chassis.springs.height_r - exp_h_r).abs() <= 0.1,
            "[{}] height_r actual {} vs exp {}",
            id,
            actual_chassis.springs.height_r,
            exp_h_r
        );

        let exp_reb_f = expected["chassis"]["damping"]["reboundF"].as_f64().unwrap();
        let exp_reb_r = expected["chassis"]["damping"]["reboundR"].as_f64().unwrap();
        let exp_bump_f = expected["chassis"]["damping"]["bumpF"].as_f64().unwrap();
        let exp_bump_r = expected["chassis"]["damping"]["bumpR"].as_f64().unwrap();
        assert!(
            (actual_chassis.damping.rebound_f - exp_reb_f).abs() <= 0.1,
            "[{}] rebound_f actual {} vs exp {}",
            id,
            actual_chassis.damping.rebound_f,
            exp_reb_f
        );
        assert!(
            (actual_chassis.damping.rebound_r - exp_reb_r).abs() <= 0.1,
            "[{}] rebound_r actual {} vs exp {}",
            id,
            actual_chassis.damping.rebound_r,
            exp_reb_r
        );
        assert!(
            (actual_chassis.damping.bump_f - exp_bump_f).abs() <= 0.1,
            "[{}] bump_f actual {} vs exp {}",
            id,
            actual_chassis.damping.bump_f,
            exp_bump_f
        );
        assert!(
            (actual_chassis.damping.bump_r - exp_bump_r).abs() <= 0.1,
            "[{}] bump_r actual {} vs exp {}",
            id,
            actual_chassis.damping.bump_r,
            exp_bump_r
        );

        let exp_acc_f = expected["chassis"]["diff"]["accelF"].as_f64().unwrap();
        let exp_dec_f = expected["chassis"]["diff"]["decelF"].as_f64().unwrap();
        let exp_acc_r = expected["chassis"]["diff"]["accelR"].as_f64().unwrap();
        let exp_dec_r = expected["chassis"]["diff"]["decelR"].as_f64().unwrap();
        let exp_cr = expected["chassis"]["diff"]["centerRear"].as_f64().unwrap();
        assert!(
            (actual_chassis.diff.accel_f - exp_acc_f).abs() <= 0.1,
            "[{}] diff.accel_f actual {} vs exp {}",
            id,
            actual_chassis.diff.accel_f,
            exp_acc_f
        );
        assert!(
            (actual_chassis.diff.decel_f - exp_dec_f).abs() <= 0.1,
            "[{}] diff.decel_f actual {} vs exp {}",
            id,
            actual_chassis.diff.decel_f,
            exp_dec_f
        );
        assert!(
            (actual_chassis.diff.accel_r - exp_acc_r).abs() <= 0.1,
            "[{}] diff.accel_r actual {} vs exp {}",
            id,
            actual_chassis.diff.accel_r,
            exp_acc_r
        );
        assert!(
            (actual_chassis.diff.decel_r - exp_dec_r).abs() <= 0.1,
            "[{}] diff.decel_r actual {} vs exp {}",
            id,
            actual_chassis.diff.decel_r,
            exp_dec_r
        );
        assert!(
            (actual_chassis.diff.center_rear - exp_cr).abs() <= 0.1,
            "[{}] diff.center_rear actual {} vs exp {}",
            id,
            actual_chassis.diff.center_rear,
            exp_cr
        );

        // 3. Gearing
        let actual_gearing = calculate_aego_gearing(
            race_goal,
            num_gears,
            &car_params,
            max_rpm,
            secondary_correction.as_ref(),
        );
        if race_goal != RaceGoal::Road {
            assert_eq!(
                actual_gearing,
                fh6_backend::tuning::calculate_aego_gearing(
                    race_goal,
                    num_gears,
                    &car_params,
                    max_rpm,
                    secondary_correction.as_ref()
                )
            );
        }
        let exp_fd = expected["gearing"]["finalDrive"].as_f64().unwrap();
        assert_eq!(
            actual_gearing.unsupported,
            expected["gearing"]["unsupported"].as_bool(),
            "{id}: unsupported"
        );
        assert_eq!(
            actual_gearing.unsupported_reason.as_deref(),
            expected["gearing"]["unsupportedReason"].as_str(),
            "{id}: reason"
        );
        if race_goal == RaceGoal::Road {
            assert_eq!(
                actual_gearing.final_drive, exp_fd,
                "{id}: exact FD grid parity"
            );
            let expected_gears: Vec<f64> =
                serde_json::from_value(expected["gearing"]["gears"].clone()).unwrap();
            assert_eq!(
                actual_gearing.gears, expected_gears,
                "{id}: exact ratio grid parity"
            );
        }
        assert!(
            (actual_gearing.final_drive - exp_fd).abs() <= 0.02,
            "[{}] final_drive actual {} vs exp {}",
            id,
            actual_gearing.final_drive,
            exp_fd
        );

        let exp_gears = expected["gearing"]["gears"].as_array().unwrap();
        assert_eq!(
            actual_gearing.gears.len(),
            exp_gears.len(),
            "[{}] gear count actual {} vs exp {}",
            id,
            actual_gearing.gears.len(),
            exp_gears.len()
        );

        for (idx, exp_g) in exp_gears.iter().enumerate() {
            let eg = exp_g.as_f64().unwrap();
            let ag = actual_gearing.gears[idx];
            assert!(
                (ag - eg).abs() <= 0.02,
                "[{}] gear {} actual {} vs exp {}",
                id,
                idx + 1,
                ag,
                eg
            );
        }

        // Monotonic check
        for i in 1..actual_gearing.gears.len() {
            assert!(
                actual_gearing.gears[i] <= actual_gearing.gears[i - 1],
                "[{}] Gearing must be monotonically non-increasing: gear {} ({}) > gear {} ({})",
                id,
                i + 1,
                actual_gearing.gears[i],
                i,
                actual_gearing.gears[i - 1]
            );
        }
    }
}

#[test]
fn fractional_spring_bounds_never_overflow_max() {
    // 2008 Subaru Impreza WRX STi (car 1060 parameters from game conversion)
    // 871.1 lbs/in = 15.556079389400223 kgf/mm
    let car_params = TuningCarParams {
        weight: Some(1525.43),
        weight_distribution: Some(56.0),
        drivetrain: Some("AWD".into()),
        spring_front_min: Some(3.1108587),
        spring_front_max: Some(15.556079),
        spring_rear_min: Some(5.1341669),
        spring_rear_max: Some(15.556079),
        height_front_min: Some(16.51),
        height_front_max: Some(20.32),
        height_rear_min: Some(17.526),
        height_rear_max: Some(20.828),
        ..Default::default()
    };

    for goal in [
        RaceGoal::Road,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Drag,
    ] {
        let res = calculate_chassis_tuning(goal, &car_params);
        assert!(
            res.springs.front <= 15.556079,
            "[{:?}] Front spring {:.1} must not exceed max 15.556079",
            goal,
            res.springs.front
        );
        assert!(
            res.springs.front >= 3.1108587,
            "[{:?}] Front spring {:.1} must not be below min 3.1108587",
            goal,
            res.springs.front
        );
        assert!(
            res.springs.rear <= 15.556079,
            "[{:?}] Rear spring {:.1} must not exceed max 15.556079",
            goal,
            res.springs.rear
        );
        assert!(
            res.springs.rear >= 5.1341669,
            "[{:?}] Rear spring {:.1} must not be below min 5.1341669",
            goal,
            res.springs.rear
        );
    }
}

#[test]
fn gearing_boundary_singular_protection_and_monotonicity() {
    let params = TuningCarParams {
        weight: Some(1200.0),
        weight_distribution: Some(52.0),
        drivetrain: Some("AWD".into()),
        max_hp: Some(450.0),
        max_torque: Some(500.0),
        max_hp_rpm: Some(6500.0),
        max_torque_rpm: Some(4000.0),
        front_tire_width: Some(0.0),
        rear_tire_width: Some(0.0),
        front_tire_aspect: Some(0.0),
        rear_tire_aspect: Some(0.0),
        front_tire_rim: Some(0.0),
        rear_tire_rim: Some(0.0),
        ..Default::default()
    };

    for goal in [
        RaceGoal::DangerSign,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Road,
    ] {
        // Zero gears input must not panic and must safely normalize to 6 gears
        let res_zero = calculate_aego_gearing(goal, 0, &params, 7000.0, None);
        assert_ne!(res_zero.unsupported, Some(true));
        assert_eq!(res_zero.gears.len(), 6);
        assert!(res_zero.final_drive >= 2.0 && res_zero.final_drive <= 6.5);
        assert!(res_zero.gears.windows(2).all(|w| w[0] > w[1]));

        // NaN max_rpm must not panic or propagate NaN
        let res_nan_rpm = calculate_aego_gearing(goal, 6, &params, f64::NAN, None);
        assert_ne!(res_nan_rpm.unsupported, Some(true));
        assert!(res_nan_rpm.final_drive.is_finite());
        assert!(res_nan_rpm.final_drive >= 2.0 && res_nan_rpm.final_drive <= 6.5);
        assert!(res_nan_rpm.gears.iter().all(|g| g.is_finite() && *g > 0.0));
    }
}

#[test]
fn drag_rejects_original_invalid_inputs_before_gearing_fallbacks() {
    let params = TuningCarParams {
        weight: Some(1200.0),
        max_hp: Some(450.0),
        max_torque: Some(500.0),
        max_hp_rpm: Some(6500.0),
        max_torque_rpm: Some(4000.0),
        ..Default::default()
    };
    for solver in [
        calculate_aego_gearing,
        fh6_backend::tuning::calculate_aego_gearing,
    ] {
        for count in [0, 1, 3, 11, usize::MAX] {
            let result = solver(RaceGoal::Drag, count, &params, 7000.0, None);
            assert_eq!(result.unsupported, Some(true), "count={count}");
            assert!(result.gears.is_empty());
        }
        for rpm in [0.0, -1.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let result = solver(RaceGoal::Drag, 6, &params, rpm, None);
            assert_eq!(result.unsupported, Some(true), "rpm={rpm}");
            assert!(result.gears.is_empty());
        }
        let valid = solver(RaceGoal::Drag, 6, &params, 7000.0, None);
        assert_ne!(valid.unsupported, Some(true));
        assert_eq!(valid.gears.len(), 6);
        assert!(valid.gears.windows(2).all(|pair| pair[0] > pair[1]));
    }
}

#[test]
fn chassis_boundary_singular_protection_and_spring_inversion() {
    let inverted_params = TuningCarParams {
        weight: Some(-500.0),
        weight_distribution: Some(150.0),
        drivetrain: Some("AWD".into()),
        spring_front_min: Some(60.0),
        spring_front_max: Some(20.0),
        spring_rear_min: Some(70.0),
        spring_rear_max: Some(30.0),
        height_front_min: Some(20.0),
        height_front_max: Some(10.0),
        height_rear_min: Some(22.0),
        height_rear_max: Some(12.0),
        ..Default::default()
    };

    for goal in [
        RaceGoal::Road,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Drag,
        RaceGoal::DangerSign,
    ] {
        let aero = resolve_aero_downforce(&inverted_params);
        assert!(aero.front.is_finite() && aero.front > 0.0);
        assert!(aero.rear.is_finite() && aero.rear > 0.0);

        let res = calculate_chassis_tuning(goal, &inverted_params);
        assert!(res.springs.front.is_finite() && res.springs.front >= 60.0);
        assert!(res.springs.rear.is_finite() && res.springs.rear >= 70.0);
        assert!(res.springs.height_f.is_finite() && res.springs.height_f >= 20.0);
        assert!(res.springs.height_r.is_finite() && res.springs.height_r >= 22.0);
        assert!(res.damping.rebound_f >= 1.0 && res.damping.rebound_f <= 20.0);
        assert!(res.damping.rebound_r >= 1.0 && res.damping.rebound_r <= 20.0);
        assert!(res.damping.bump_f >= 1.0 && res.damping.bump_f <= 20.0);
        assert!(res.damping.bump_r >= 1.0 && res.damping.bump_r <= 20.0);
    }

    for wd in [0.0, 100.0, -10.0, f64::NAN] {
        let p = TuningCarParams {
            weight: Some(f64::NAN),
            weight_distribution: Some(wd),
            ..Default::default()
        };
        let aero = resolve_aero_downforce(&p);
        assert!(aero.front.is_finite() && aero.front > 0.0);
        assert!(aero.rear.is_finite() && aero.rear > 0.0);
        let chassis = calculate_chassis_tuning(RaceGoal::Road, &p);
        assert!(chassis.arb.front.is_finite() && chassis.arb.front >= 1.0);
        assert!(chassis.arb.rear.is_finite() && chassis.arb.rear >= 1.0);
    }
}

#[test]
fn alignment_boundary_singular_protection_and_camber_sign_invariance() {
    let extreme_params = TuningCarParams {
        weight: Some(-500.0),
        weight_distribution: Some(150.0),
        drivetrain: Some("RWD".into()),
        front_tire_width: Some(-245.0),
        rear_tire_width: Some(-275.0),
        front_tire_aspect: Some(-40.0),
        rear_tire_aspect: Some(-35.0),
        ..Default::default()
    };

    for goal in [
        RaceGoal::Road,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Drag,
        RaceGoal::DangerSign,
    ] {
        for season in [
            Season::Summer,
            Season::Autumn,
            Season::Winter,
            Season::Spring,
        ] {
            let res = calculate_static_alignment(goal, season, &extreme_params);
            assert!(
                res.pc_f.is_finite() && res.pc_f >= 15.0 && res.pc_f <= 55.0,
                "pc_f={}",
                res.pc_f
            );
            assert!(
                res.pc_r.is_finite() && res.pc_r >= 15.0 && res.pc_r <= 55.0,
                "pc_r={}",
                res.pc_r
            );
            assert!(res.hw_f.is_finite() && res.hw_f > 0.0, "hw_f={}", res.hw_f);
            assert!(res.hw_r.is_finite() && res.hw_r > 0.0, "hw_r={}", res.hw_r);
            assert!(
                res.camber.front.is_finite() && res.camber.front <= 0.0,
                "cf={}",
                res.camber.front
            );
            assert!(
                res.camber.rear.is_finite() && res.camber.rear <= 0.0,
                "cr={}",
                res.camber.rear
            );
            assert!(
                res.caster.is_finite() && res.caster >= 5.0 && res.caster <= 7.0,
                "caster={}",
                res.caster
            );
        }
    }

    for wd in [-50.0, 0.0, 100.0, 200.0, f64::NAN] {
        let p = TuningCarParams {
            weight: Some(1400.0),
            weight_distribution: Some(wd),
            ..Default::default()
        };
        let res = calculate_static_alignment(RaceGoal::Road, Season::Summer, &p);
        assert!(
            res.camber.rear <= 0.0,
            "cr must remain negative for wd={wd}, got {}",
            res.camber.rear
        );
        assert!(
            res.camber.front <= 0.0,
            "cf must remain negative for wd={wd}, got {}",
            res.camber.front
        );
        assert!(res.pc_f >= 15.0 && res.pc_f <= 55.0);
        assert!(res.pc_r >= 15.0 && res.pc_r <= 55.0);
    }
}
