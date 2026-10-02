use fh6_backend::tuning::{
    calc_gear_speed, calculate_aego_gearing,
    gearing::{calculate_aego_gearing_v2, road_launch_diagnostics},
    measurement, GearingSecondaryCorrection, RaceGoal, TuningCarParams,
};
use serde_json::{json, Value};
fn synthetic() -> TuningCarParams {
    let history: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_road_history_462.json"
    ))
    .unwrap();
    serde_json::from_value(history["profile"].clone()).unwrap()
}
fn radius(p: &TuningCarParams) -> f64 {
    if p.drivetrain.as_deref() == Some("FWD") {
        (p.front_tire_width.unwrap_or(245.0) * p.front_tire_aspect.unwrap_or(40.0) / 100.0 * 2.0
            + p.front_tire_rim.unwrap_or(18.0) * 25.4)
            / 2000.0
    } else {
        (p.rear_tire_width.unwrap_or(245.0) * p.rear_tire_aspect.unwrap_or(40.0) / 100.0 * 2.0
            + p.rear_tire_rim.unwrap_or(18.0) * 25.4)
            / 2000.0
    }
}
#[test]
fn frozen_history_is_characterization_not_new_model_correctness() {
    let history: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_road_history_462.json"
    ))
    .unwrap();
    let mut p = synthetic();
    for (field, rpm) in [
        ("result", 9023.778268980559),
        ("alternate", 8804.031901079223),
    ] {
        p.max_hp_rpm = Some(rpm);
        let old = calculate_aego_gearing_v2(RaceGoal::Road, 7, &p, 10000.0, None);
        let final_history = history["cases"].as_array().unwrap().last().unwrap();
        assert_gearing(&old, &final_history[field]);
        let current = calculate_aego_gearing(RaceGoal::Road, 7, &p, 10000.0, None);
        assert_ne!(current.unsupported, Some(true));
        // Only this characterized synthetic case agrees with v1.6; no blanket rollback claim.
        assert_gearing(&current, &history["cases"][0][field]);
        // Restore access to the inherited power-peak speed target, within grid rounding.
        let speed = calc_gear_speed(rpm, current.gears[0], current.final_drive, radius(&p)) * 3.6;
        assert!((speed - 76.5).abs() < 0.15, "{speed}");
        let landings: Vec<_> = current
            .gears
            .windows(2)
            .map(|g| 10000.0 * g[1] / g[0])
            .collect();
        // This synthetic seven-speed example returns between its two supplied peak RPMs.
        // That window is not a generic lower usable power band or optimal-shift guarantee.
        assert!(landings.iter().all(|r| *r >= 6000.0 && *r <= rpm));
        println!(
            "HIGH {rpm}: {} landings={landings:?}",
            serde_json::to_string(&current).unwrap()
        );
    }
}
#[test]
fn envelope_grid_and_split_contract_across_drives_counts_mass_and_torque() {
    let mut feasible = 0;
    let mut conflicts = 0;
    for drive in ["FWD", "RWD", "AWD"] {
        for split in [None, Some(0.0), Some(70.0), Some(100.0)] {
            for mass in [500.0, 801.952, 1400.0, 2100.0] {
                for torque in [80.0, 158.631, 400.0, 1323.3977695167287, 2400.0, 4000.0] {
                    for count in 4..=10 {
                        let mut p = synthetic();
                        p.drivetrain = Some(drive.into());
                        p.road_awd_rear_percent = split;
                        p.weight = Some(mass);
                        p.max_torque = Some(torque);
                        let r = calculate_aego_gearing(RaceGoal::Road, count, &p, 10000.0, None);
                        if r.unsupported == Some(true) {
                            assert!(
                                torque < 1323.3977695167287,
                                "high-torque synthetic envelope should remain feasible"
                            );
                            conflicts += 1;
                            assert!(r.gears.is_empty());
                            assert!(r.unsupported_reason.is_some());
                            continue;
                        }
                        feasible += 1;
                        assert_eq!(r.gears.len(), count);
                        assert!((2.0..=6.1).contains(&r.final_drive));
                        assert!((1.0..=6.0).contains(&r.gears[0]));
                        assert!(r.gears.iter().all(|g| (0.4..=6.0).contains(g)
                            && (g * 100.0 - (g * 100.0).round()).abs() < 1e-9));
                        assert!(r.gears.windows(2).all(|g| g[0] - g[1] >= 0.01 - 1e-9));
                        let d = road_launch_diagnostics(
                            &p,
                            10000.0,
                            p.max_hp_rpm.unwrap(),
                            6000.0,
                            torque,
                            &r,
                        );
                        let chosen = d["selectedTotalRatio"].as_f64().unwrap();
                        assert!(
                            (r.final_drive * r.gears[0] - chosen).abs()
                                <= r.final_drive * 0.005 + 1e-9
                        );
                        let target_speed = p.max_hp.unwrap().powf(1.0 / 3.0) * 37.0 * 1.06 * 0.95;
                        let top =
                            p.max_hp_rpm.unwrap() * 2.0 * std::f64::consts::PI * radius(&p) * 60.0
                                / (target_speed * 1000.0);
                        assert!(
                            (r.final_drive * r.gears[count - 1] - top).abs()
                                <= r.final_drive * 0.005 + 1e-9
                        );
                        // Default is a true input default, not a different model branch.
                        if drive == "AWD" && split.is_none() {
                            p.road_awd_rear_percent = Some(70.0);
                            assert_eq!(
                                serde_json::to_value(&r).unwrap(),
                                serde_json::to_value(calculate_aego_gearing(
                                    RaceGoal::Road,
                                    count,
                                    &p,
                                    10000.0,
                                    None
                                ))
                                .unwrap()
                            );
                        }
                    }
                }
            }
        }
    }
    assert!(feasible > 0 && conflicts > 0);
    println!("MATRIX feasible={feasible} conflicts={conflicts}");
}
#[test]
fn secondary_limits_preserve_both_targets_or_report_specific_conflict() {
    let p = synthetic();
    for limit in [500.0, 320.0, 180.0, 30.0] {
        let sc = GearingSecondaryCorrection {
            simulated_top_speed: Some(limit),
            soft_max_speed: Some(limit),
            drag_finish_speed_kmh: None,
            drag_finish_speed_provenance: None,
        };
        let r = calculate_aego_gearing(RaceGoal::Road, 7, &p, 10000.0, Some(&sc));
        if limit == 30.0 {
            assert_eq!(r.unsupported, Some(true));
            assert!(r.gears.is_empty());
            continue;
        }
        assert_ne!(r.unsupported, Some(true));
        let d = road_launch_diagnostics(
            &p,
            10000.0,
            p.max_hp_rpm.unwrap(),
            6000.0,
            p.max_torque.unwrap(),
            &r,
        );
        assert!(
            (r.final_drive * r.gears[0] - d["selectedTotalRatio"].as_f64().unwrap()).abs()
                <= r.final_drive * 0.005 + 1e-9
        );
        let speed =
            calc_gear_speed(10000.0, *r.gears.last().unwrap(), r.final_drive, radius(&p)) * 3.6;
        assert!(speed <= limit * 1.02); // bounded grid rounding, not a vehicle-speed guarantee
    }
}
#[test]
fn existing_low_power_goldens_and_real_limiter_evidence_remain_unchanged() {
    let goldens: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/tuning_golden_fixtures.json"
    ))
    .unwrap();
    for c in goldens["cases"].as_array().unwrap().iter().filter(|c| {
        c["id"].as_str().unwrap().starts_with("road_beetle")
            || c["id"] == "road_launch_target_infeasible"
            || c["id"] == "aego_weak_engine_4speed"
    }) {
        let p = serde_json::from_value(c["inputs"]["carParams"].clone()).unwrap();
        let r = calculate_aego_gearing(
            RaceGoal::Road,
            c["inputs"]["numGears"].as_u64().unwrap() as usize,
            &p,
            c["inputs"]["maxRpm"].as_f64().unwrap(),
            None,
        );
        assert_gearing(&r, &c["expected"]["gearing"]);
    }
    for (source, car, limit) in [
        (
            include_str!("../../tests/fixtures/aego_beetle_limiter_capture.json"),
            "1435",
            5248.0,
        ),
        (
            include_str!("../../tests/fixtures/aego_pajero_limiter_capture.json"),
            "2652",
            7999.0,
        ),
    ] {
        let capture: Value = serde_json::from_str(source).unwrap();
        let samples: Vec<Value> = capture["samples"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| {
                Value::Object(
                    capture["fields"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .zip(row.as_array().unwrap())
                        .map(|(k, v)| (k.as_str().unwrap().into(), v.clone()))
                        .collect(),
                )
            })
            .collect();
        let analysis = measurement::analyze(
            &json!({"carId":car,"observationId":"existing-fixture","capture":{"samples":samples}}),
        );
        assert_eq!(analysis["status"], "ready");
        assert_eq!(analysis["analysisVersion"], "engine-loaded-sweep/v4");
        assert_eq!(analysis["effectiveRedline"], limit);
        if car == "1435" {
            let c = goldens["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "road_beetle_race_six_3983")
                .unwrap();
            let mut p: TuningCarParams =
                serde_json::from_value(c["inputs"]["carParams"].clone()).unwrap();
            p.max_hp_rpm = analysis["peakPower"]["rpm"].as_f64();
            p.max_torque_rpm = analysis["peakTorque"]["rpm"].as_f64();
            p.max_torque = analysis["peakTorque"]["value"].as_f64();
            assert_eq!(
                calculate_aego_gearing(RaceGoal::Road, 6, &p, limit, None),
                calculate_aego_gearing_v2(RaceGoal::Road, 6, &p, limit, None)
            );
        }
        println!("CAPTURE {car} {}", analysis);
    }
}

fn assert_gearing(actual: &fh6_backend::tuning::GearingResult, expected: &Value) {
    assert_eq!(actual.final_drive, expected["finalDrive"].as_f64().unwrap());
    assert_eq!(
        actual.gears,
        expected["gears"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_f64().unwrap())
            .collect::<Vec<_>>()
    );
    assert_eq!(actual.unsupported, expected["unsupported"].as_bool());
    assert_eq!(
        actual.unsupported_reason.as_deref(),
        expected["unsupportedReason"].as_str()
    );
}

#[test]
fn new_model_has_separate_reviewed_baselines() {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_road_launch_v3.json"
    ))
    .unwrap();
    assert_eq!(fixtures["modelVersion"], "aego-road-launch-envelope/v3");
    for case in fixtures["cases"].as_array().unwrap() {
        let inputs = &case["inputs"];
        let params = serde_json::from_value(inputs["carParams"].clone()).unwrap();
        let correction = inputs
            .get("secondaryCorrection")
            .map(|v| serde_json::from_value(v.clone()).unwrap());
        let r = calculate_aego_gearing(
            RaceGoal::Road,
            inputs["numGears"].as_u64().unwrap() as usize,
            &params,
            inputs["maxRpm"].as_f64().unwrap(),
            correction.as_ref(),
        );
        assert_gearing(&r, &case["expected"]);
    }
}

#[test]
fn reported_pagani_static_profile_characterizes_defaults_and_explicit_rpm_scenarios() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_road_report_462.json"
    ))
    .unwrap();
    assert_eq!(fixture["reported"]["numGears"], 7);
    for case in fixture["cases"].as_array().unwrap() {
        let params: TuningCarParams =
            serde_json::from_value(case["inputs"]["carParams"].clone()).unwrap();
        let rpm = case["inputs"]["maxRpm"].as_f64().unwrap();
        assert!((params.weight.unwrap() - 2434.0 / 2.20462).abs() < 1e-9);
        assert!((params.max_torque.unwrap() - 824.0 / 0.73756).abs() < 1e-9);
        assert!((radius(&params) - 0.3457).abs() < 1e-12);
        let frozen = calculate_aego_gearing_v2(RaceGoal::Road, 7, &params, rpm, None);
        assert_gearing(&frozen, &case["historical"]["ca195c7"]);
        let current = calculate_aego_gearing(RaceGoal::Road, 7, &params, rpm, None);
        assert_gearing(&current, &case["historical"]["cd96d86"]);
        assert_ne!(
            current.gears,
            serde_json::from_value::<Vec<f64>>(fixture["reported"]["old"]["gears"].clone())
                .unwrap()
        );
        println!(
            "REPORT {} {}",
            case["id"],
            serde_json::to_string(&current).unwrap()
        );
    }
}

#[test]
fn reported_static_load_bound_cannot_round_to_reported_first_endpoint() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_road_report_462.json"
    ))
    .unwrap();
    let mut params: TuningCarParams = serde_json::from_value(fixture["profile"].clone()).unwrap();
    let upper =
        params.weight.unwrap() * 9.81 * radius(&params) / (params.max_torque.unwrap() * 0.90);
    // Even the best possible aG=1 prior falls below the interval that rounds to
    // G1=1.00 at FD3.78. Neither RPM nor aero can increase this load-only target.
    assert!((upper - 3.7237700307813437).abs() < 1e-12);
    assert!(upper < 3.78 * (1.0 - 0.005));
    for split in 0..=100 {
        params.road_awd_rear_percent = Some(split as f64);
        let result = calculate_aego_gearing_v2(RaceGoal::Road, 7, &params, 9000.0, None);
        let diagnostics = road_launch_diagnostics(
            &params,
            9000.0,
            8000.0,
            6000.0,
            params.max_torque.unwrap(),
            &result,
        );
        assert!(diagnostics["loadPriorTotalRatio"].as_f64().unwrap() <= upper + 1e-12);
    }
}
