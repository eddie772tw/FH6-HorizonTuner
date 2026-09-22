use fh6_backend::tuning::{
    calculate_aego_gearing, calculate_chassis_tuning, resolve_aero_downforce, RaceGoal,
    TuningCarParams, GearingSecondaryCorrection,
};
use serde_json::Value;
use std::path::Path;

#[test]
fn rust_tuning_core_matches_golden_fixtures() {
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
    assert_eq!(cases.len(), 18, "Must contain all 18 test cases");

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
        let exp_fd = expected["gearing"]["finalDrive"].as_f64().unwrap();
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
