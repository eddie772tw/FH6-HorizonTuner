use fh6_backend::tuning::{
    calc_gear_speed, calculate_aego_gearing, gearing::road_launch_diagnostics, measurement,
    GearingSecondaryCorrection, RaceGoal, TuningCarParams,
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
        let result = calculate_aego_gearing(RaceGoal::Road, 7, &params, 9000.0, None);
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

#[test]
fn road_diagnostics_match_solver_limit_rpm_and_tire_fallbacks() {
    use fh6_backend::tuning::{aego_model::AegoModel, gearing::models};

    let mut base = synthetic();
    base.max_hp_rpm = None;
    base.max_torque_rpm = None;
    base.max_torque = None;
    let correction = GearingSecondaryCorrection {
        simulated_top_speed: Some(260.0),
        soft_max_speed: None,
        drag_finish_speed_kmh: None,
        drag_finish_speed_provenance: None,
    };
    let reference = models::solve(AegoModel::RoadLaunchV3, 6, &base, 7500.0, Some(&correction));
    assert_eq!(reference.diagnostics["status"], "available");
    for bad_limit in [0.0, -500.0, f64::NAN, f64::INFINITY] {
        let candidate = models::solve(
            AegoModel::RoadLaunchV3,
            6,
            &base,
            bad_limit,
            Some(&correction),
        );
        assert_eq!(candidate.gearing, reference.gearing);
        assert_eq!(candidate.diagnostics["status"], "available");
        assert_eq!(candidate.diagnostics["maxRpm"], 7500.0);
        assert_eq!(candidate.diagnostics, reference.diagnostics);
        assert!(models::respects_hard_targets(
            AegoModel::RoadLaunchV3,
            &candidate.gearing,
            &candidate.diagnostics
        ));
    }

    // Sub-decimeter / non-finite tires in road_launch_diagnostics must match the 2.0m fallback.
    let mut tiny_tire = synthetic();
    tiny_tire.rear_tire_width = Some(0.01);
    tiny_tire.rear_tire_aspect = Some(0.01);
    tiny_tire.rear_tire_rim = Some(0.01);
    let tiny_res = calculate_aego_gearing(RaceGoal::Road, 6, &tiny_tire, 0.0, None);
    let launch_diag = road_launch_diagnostics(&tiny_tire, f64::NAN, 0.0, -1.0, 200.0, &tiny_res);
    assert_eq!(launch_diag["effectiveLimitRpm"], 7500.0);
    assert_eq!(launch_diag["powerPeakRpm"], 7500.0 * 0.85);
    assert_eq!(launch_diag["torquePeakRpm"], 7500.0 * 0.60);
    assert!(launch_diag["speedPriorTotalRatio"]
        .as_f64()
        .unwrap()
        .is_finite());

    // Unavailable Road solve preserves its model conflict reason in versioned diagnostics.
    let mut infeasible = synthetic();
    infeasible.max_torque = Some(1.0);
    let conflict = models::solve(AegoModel::RoadLaunchV3, 6, &infeasible, 6000.0, None);
    assert_eq!(conflict.gearing.unsupported, Some(true));
    assert_eq!(conflict.diagnostics["status"], "unavailable");
    assert_eq!(
        conflict.diagnostics["reason"].as_str(),
        conflict.gearing.unsupported_reason.as_deref()
    );
}

#[test]
fn road_envelope_preferred_fd_overflow_torque_fallback_and_adjusted_closure() {
    use fh6_backend::tuning::{
        aego_model::AegoModel,
        gearing::{models, road},
    };

    // 1. Finite first_total > top_total with top_total / target_top_gear == +inf must not panic.
    let extreme = TuningCarParams {
        weight: Some(1400.0),
        weight_distribution: Some(50.0),
        drivetrain: Some("RWD".into()),
        max_hp: Some(300.0),
        max_torque: Some(1.8e-305),
        max_hp_rpm: Some(7000.0),
        max_torque_rpm: Some(4500.0),
        ..synthetic()
    };
    let sc = GearingSecondaryCorrection {
        simulated_top_speed: None,
        soft_max_speed: Some(6.5e-306),
        drag_finish_speed_kmh: None,
        drag_finish_speed_provenance: None,
    };
    let res = models::solve(AegoModel::RoadLaunchV3, 6, &extreme, 7500.0, Some(&sc));
    let first = res.diagnostics["targetFirstTotalRatio"].as_f64().unwrap();
    let top = res.diagnostics["targetTopTotalRatio"].as_f64().unwrap();
    assert!(first.is_finite() && top.is_finite() && first > top);
    assert!((top / road::get_target_top_gear_ratio(6)).is_infinite());
    assert_eq!(res.gearing.unsupported, Some(true));
    assert!(res.gearing.gears.is_empty());

    // 2. Missing/zero/non-finite torque derives identically across solver and road_launch_diagnostics.
    let car = TuningCarParams {
        weight: Some(1500.0),
        weight_distribution: Some(50.0),
        drivetrain: Some("RWD".into()),
        max_hp: Some(150.0),
        max_torque: None,
        max_hp_rpm: Some(6000.0),
        max_torque_rpm: Some(4500.0),
        ..synthetic()
    };
    let solved = models::solve(AegoModel::RoadLaunchV3, 6, &car, 7000.0, None);
    assert_eq!(solved.diagnostics["status"], "available");
    let exp_first = solved.diagnostics["targetFirstTotalRatio"]
        .as_f64()
        .unwrap();
    for bad in [0.0, -50.0, f64::NAN, f64::INFINITY] {
        let d = road_launch_diagnostics(&car, 7000.0, 6000.0, 4500.0, bad, &solved.gearing);
        let load = d["loadPriorTotalRatio"].as_f64().unwrap();
        let speed = d["speedPriorTotalRatio"].as_f64().unwrap();
        let selected = d["selectedTotalRatio"].as_f64().unwrap();
        assert!(load > speed, "load prior must govern for {bad}");
        assert!((load - exp_first).abs() < 1e-9 && (selected - exp_first).abs() < 1e-9);
    }

    // 3. Invalid Road adjustment clears stale actual* fields; malformed diagnostics never panic.
    let mut broken = solved.gearing.clone();
    broken.gears[0] = (broken.gears[0] - 0.5).max(1.0);
    let rejected = road::adjusted_diagnostics(&broken, &solved.diagnostics);
    assert_eq!(rejected["status"], "unavailable");
    for key in [
        "actualSpeedKmh",
        "endpointErrorKmh",
        "actualFirstTotalRatio",
        "actualTopTotalRatio",
    ] {
        assert!(rejected[key].is_null(), "{key} should clear on rejection");
    }
    for key in ["referenceRpm", "tireRadiusM", "targetSpeedKmh"] {
        let mut malformed = solved.diagnostics.clone();
        malformed[key] = Value::Null;
        assert!(!road::respects_hard_targets(&solved.gearing, &malformed));
        let out = road::adjusted_diagnostics(&solved.gearing, &malformed);
        assert_eq!(out["status"], "unavailable");
        assert!(out["actualSpeedKmh"].is_null());
    }
}
