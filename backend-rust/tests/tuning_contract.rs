use fh6_backend::tuning::{
    alignment::{calculate_static_alignment, Season},
    calculate_chassis_tuning, resolve_aero_downforce, RaceGoal, TuningCarParams,
};
use serde_json::Value;
use std::path::Path;

#[test]
fn current_chassis_preserves_all_21_immutable_golden_cases() {
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

        // Retired ICE gear values remain immutable historical data. Active models
        // have their own reviewed baselines; no old solver is retained for parity.
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

#[test]
fn aero_downforce_singular_protection_and_asymmetric_closure() {
    use fh6_backend::tuning::chassis::get_road_awd_rear_percent;

    // Case 1: Rear wing equipped (150 kgf), front aero missing/corrupted as NaN, negative, or Infinity
    for singular_front in [f64::NAN, -20.0, f64::INFINITY, f64::NEG_INFINITY] {
        let params = TuningCarParams {
            weight: Some(1400.0),
            weight_distribution: Some(54.0),
            drivetrain: Some("RWD".into()),
            aero_downforce_front: Some(singular_front),
            aero_downforce_rear: Some(150.0),
            ..Default::default()
        };
        let aero = resolve_aero_downforce(&params);
        assert_eq!(
            aero.rear, 150.0,
            "Rear aero must preserve user input of 150.0 kgf"
        );
        assert!(
            aero.front.is_finite() && aero.front > 0.0,
            "Front aero must be positively derived"
        );

        let chassis = calculate_chassis_tuning(RaceGoal::Road, &params);
        assert!(chassis.springs.front.is_finite() && chassis.springs.rear.is_finite());
        assert!(chassis.damping.rebound_f.is_finite() && chassis.damping.rebound_r.is_finite());
    }

    // Case 2: Front splitter equipped (120 kgf), rear aero missing/corrupted as NaN
    let params_front = TuningCarParams {
        weight: Some(1400.0),
        weight_distribution: Some(52.0),
        drivetrain: Some("AWD".into()),
        aero_downforce_front: Some(120.0),
        aero_downforce_rear: Some(f64::NAN),
        ..Default::default()
    };
    let aero_front = resolve_aero_downforce(&params_front);
    assert_eq!(
        aero_front.front, 120.0,
        "Front aero must preserve user input of 120.0 kgf"
    );
    assert!(
        aero_front.rear.is_finite() && aero_front.rear > 0.0,
        "Rear aero must be positively derived"
    );

    // Case 3: Both aero inputs are NaN / Infinity / negative
    let params_corrupt = TuningCarParams {
        weight: Some(1400.0),
        aero_downforce_front: Some(f64::NAN),
        aero_downforce_rear: Some(f64::INFINITY),
        ..Default::default()
    };
    let aero_corrupt = resolve_aero_downforce(&params_corrupt);
    assert!(aero_corrupt.front.is_finite() && aero_corrupt.front > 0.0);
    assert!(aero_corrupt.rear.is_finite() && aero_corrupt.rear > 0.0);

    // Case 4: AWD rear torque split with NaN fallback
    let params_awd_nan = TuningCarParams {
        weight_distribution: Some(55.0),
        road_awd_rear_percent: Some(f64::NAN),
        ..Default::default()
    };
    let awd_rear = get_road_awd_rear_percent(&params_awd_nan);
    assert!(
        awd_rear >= 60.0 && awd_rear <= 85.0,
        "AWD rear split with NaN must fallback to physical ratio, got {awd_rear}"
    );
}

#[test]
fn chassis_weight_distribution_nan_protection_and_symmetry_closure() {
    use fh6_backend::tuning::chassis::get_road_awd_rear_percent;

    // Case 1: NaN weight distribution must fall back to 50.0% neutral balance
    let p_nan = TuningCarParams {
        weight: Some(1400.0),
        weight_distribution: Some(f64::NAN),
        drivetrain: Some("RWD".into()),
        spring_front_min: Some(20.0),
        spring_front_max: Some(100.0),
        spring_rear_min: Some(20.0),
        spring_rear_max: Some(100.0),
        ..Default::default()
    };
    let p_50 = TuningCarParams {
        weight_distribution: Some(50.0),
        ..p_nan.clone()
    };

    let chassis_nan = calculate_chassis_tuning(RaceGoal::Road, &p_nan);
    let chassis_50 = calculate_chassis_tuning(RaceGoal::Road, &p_50);

    // Front/rear ARB and damping must be symmetric and match 50.0% baseline
    assert_eq!(chassis_nan.arb.front, chassis_50.arb.front);
    assert_eq!(chassis_nan.arb.rear, chassis_50.arb.rear);
    assert_eq!(chassis_nan.arb.front, chassis_nan.arb.rear);
    assert_eq!(chassis_nan.springs.front, chassis_50.springs.front);
    assert_eq!(chassis_nan.springs.rear, chassis_50.springs.rear);
    assert_eq!(chassis_nan.damping.rebound_f, chassis_nan.damping.rebound_r);
    assert_eq!(chassis_nan.damping.rebound_f, chassis_50.damping.rebound_f);

    // Case 2: get_road_awd_rear_percent with NaN weight_distribution must be 70.0%
    let awd_split_nan = get_road_awd_rear_percent(&p_nan);
    let awd_split_50 = get_road_awd_rear_percent(&p_50);
    assert_eq!(awd_split_nan, 70.0);
    assert_eq!(awd_split_nan, awd_split_50);

    // Case 3: Rally mode must also preserve symmetry under NaN weight_distribution
    let rally_nan = calculate_chassis_tuning(RaceGoal::Rally, &p_nan);
    let rally_50 = calculate_chassis_tuning(RaceGoal::Rally, &p_50);
    assert_eq!(rally_nan.springs.front, rally_50.springs.front);
    assert_eq!(rally_nan.springs.rear, rally_50.springs.rear);
    assert_eq!(rally_nan.damping.rebound_f, rally_nan.damping.rebound_r);

    // Case 4: Zero or non-finite torque in Road gearing must not panic or diverge to INFINITY
    let p_zero_torque = TuningCarParams {
        max_hp: Some(300.0),
        max_torque: Some(0.0),
        max_hp_rpm: Some(6000.0),
        max_torque_rpm: Some(4000.0),
        ..p_nan
    };
    let road_gearing = fh6_backend::tuning::calculate_aego_gearing(
        RaceGoal::Road,
        6,
        &p_zero_torque,
        7000.0,
        None,
    );
    assert_ne!(road_gearing.unsupported, Some(true));
    assert!(road_gearing.final_drive >= 2.0 && road_gearing.final_drive <= 6.1);
    assert_eq!(road_gearing.gears.len(), 6);
    assert!(road_gearing.gears.windows(2).all(|w| w[0] > w[1]));
}

#[test]
fn alignment_drivetrain_normalization_and_gearing_kinematics_closure() {
    use fh6_backend::tuning::{calc_gear_rpm, calc_gear_speed};

    // Case 1: Drivetrain case & whitespace normalization in static alignment
    let p_fwd_upper = TuningCarParams {
        weight: Some(1200.0),
        weight_distribution: Some(60.0),
        drivetrain: Some("FWD".into()),
        ..Default::default()
    };
    let p_fwd_lower = TuningCarParams {
        drivetrain: Some("  fwd  ".into()),
        ..p_fwd_upper.clone()
    };
    let align_upper = calculate_static_alignment(RaceGoal::Road, Season::Summer, &p_fwd_upper);
    let align_lower = calculate_static_alignment(RaceGoal::Road, Season::Summer, &p_fwd_lower);
    assert_eq!(align_upper, align_lower);

    // In Drag mode, FWD must have front traction tire pressure (lower) and rear stiff (higher)
    let drag_fwd_upper = calculate_static_alignment(RaceGoal::Drag, Season::Summer, &p_fwd_upper);
    let drag_fwd_lower = calculate_static_alignment(RaceGoal::Drag, Season::Summer, &p_fwd_lower);
    assert_eq!(drag_fwd_upper, drag_fwd_lower);
    assert!(drag_fwd_lower.pc_f < drag_fwd_lower.pc_r);

    // Case 2: calc_gear_speed & calc_gear_rpm singular value & non-finite protection
    for bad_val in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 0.0, -10.0] {
        assert_eq!(calc_gear_speed(bad_val, 2.5, 4.0, 0.32), 0.0);
        assert_eq!(calc_gear_speed(6000.0, bad_val, 4.0, 0.32), 0.0);
        assert_eq!(calc_gear_speed(6000.0, 2.5, bad_val, 0.32), 0.0);
        assert_eq!(calc_gear_speed(6000.0, 2.5, 4.0, bad_val), 0.0);

        assert_eq!(calc_gear_rpm(bad_val, 2.5, 4.0, 0.32), 0.0);
        assert_eq!(calc_gear_rpm(30.0, bad_val, 4.0, 0.32), 0.0);
        assert_eq!(calc_gear_rpm(30.0, 2.5, bad_val, 0.32), 0.0);
        assert_eq!(calc_gear_rpm(30.0, 2.5, 4.0, bad_val), 0.0);
    }

    // Kinematic consistency under valid finite inputs
    let speed = calc_gear_speed(6000.0, 2.5, 4.0, 0.32);
    let rpm_back = calc_gear_rpm(speed, 2.5, 4.0, 0.32);
    assert!((rpm_back - 6000.0).abs() < 1e-6);
}

#[test]
fn chassis_drift_degeneracy_and_workflow_drivetrain_normalization() {
    use fh6_backend::tuning::workflow::mechanical_fields;
    use serde_json::json;

    // Case 1: Drift mode with fixed/degenerate spring rate (k_min == k_max) must retain neutral 10.5 damping
    let p_fixed_spring = TuningCarParams {
        weight: Some(1200.0),
        weight_distribution: Some(50.0),
        drivetrain: Some("RWD".into()),
        spring_front_min: Some(50.0),
        spring_front_max: Some(50.0),
        spring_rear_min: Some(50.0),
        spring_rear_max: Some(50.0),
        ..Default::default()
    };
    let drift_fixed = calculate_chassis_tuning(RaceGoal::Drift, &p_fixed_spring);
    assert_eq!(
        drift_fixed.damping.rebound_f, 10.5,
        "Degenerate front spring rate in Drift must yield neutral 10.5 damping, not 1.0 collapse"
    );
    assert_eq!(
        drift_fixed.damping.rebound_r, 10.5,
        "Degenerate rear spring rate in Drift must yield neutral 10.5 damping, not 1.0 collapse"
    );
    assert_eq!(drift_fixed.damping.bump_f, 6.3);
    assert_eq!(drift_fixed.damping.bump_r, 6.3);

    // Case 2: Drift and Drag with non-finite / corrupted inputs must not panic or propagate NaN
    let p_corrupt = TuningCarParams {
        weight: Some(f64::NAN),
        weight_distribution: Some(-20.0),
        spring_front_min: Some(f64::INFINITY),
        ..Default::default()
    };
    let drift_corrupt = calculate_chassis_tuning(RaceGoal::Drift, &p_corrupt);
    assert!(drift_corrupt.springs.front.is_finite() && drift_corrupt.springs.front > 0.0);
    assert!(drift_corrupt.damping.rebound_f.is_finite() && drift_corrupt.damping.rebound_f > 0.0);

    let drag_corrupt = calculate_chassis_tuning(RaceGoal::Drag, &p_corrupt);
    assert!(drag_corrupt.springs.front.is_finite() && drag_corrupt.springs.front > 0.0);

    // Case 3: Workflow mechanical_fields drivetrain normalization (case-insensitive & trimmed)
    let c = calculate_chassis_tuning(RaceGoal::Road, &p_fixed_spring);
    let a = calculate_static_alignment(RaceGoal::Road, Season::Summer, &p_fixed_spring);

    for (input_drive, has_front_diff, has_rear_diff, has_center_diff) in [
        ("rwd", false, true, false),
        (" RWD ", false, true, false),
        ("fwd", true, false, false),
        (" FWD ", true, false, false),
        ("awd", true, true, true),
        (" AWD ", true, true, true),
    ] {
        let profile = json!({ "drivetrain": input_drive });
        let fields = mechanical_fields(&profile, &c, &a);
        assert_eq!(
            fields.contains_key("diff.front.acceleration"),
            has_front_diff,
            "drivetrain '{input_drive}' front diff mismatch"
        );
        assert_eq!(
            fields.contains_key("diff.rear.acceleration"),
            has_rear_diff,
            "drivetrain '{input_drive}' rear diff mismatch"
        );
        assert_eq!(
            fields.contains_key("diff.center"),
            has_center_diff,
            "drivetrain '{input_drive}' center diff mismatch"
        );
    }
}

#[test]
fn existing_danger_sign_values_match_pre_cleanup_baselines() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/danger_sign_existing_behavior.json"
    ))
    .unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let profile = serde_json::from_value(case["profile"].clone()).unwrap();
        let correction: Option<fh6_backend::tuning::GearingSecondaryCorrection> =
            serde_json::from_value(case["correction"].clone()).unwrap();
        let actual = fh6_backend::tuning::calculate_aego_gearing(
            RaceGoal::DangerSign,
            case["count"].as_u64().unwrap() as usize,
            &profile,
            case["rpm"].as_f64().unwrap(),
            correction.as_ref(),
        );
        let expected: fh6_backend::tuning::GearingResult =
            serde_json::from_value(case["expected"].clone()).unwrap();
        assert_eq!(actual, expected, "{case}");
    }
}
