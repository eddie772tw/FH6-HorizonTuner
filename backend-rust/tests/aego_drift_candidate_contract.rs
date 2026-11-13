use fh6_backend::tuning::{
    gearing::calculate_aego_gearing_historical as calculate_aego_gearing,
    gearing::{
        contracts::{CandidateGearingResult, RatioRange},
        drift::{
            adjusted_diagnostics, respects_hard_targets, solve_candidate, DriftObservedBounds,
            DriftWorkingTarget,
        },
        kinematics::calc_gear_speed,
    },
    RaceGoal, RallyProfile, TuningCarParams,
};
use serde_json::{json, Value};

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_drift_working_v1.json"
    ))
    .unwrap()
}
fn profile() -> TuningCarParams {
    serde_json::from_value(fixture()["inputs"]["carParams"].clone()).unwrap()
}
fn target() -> DriftWorkingTarget {
    serde_json::from_value(fixture()["inputs"]["target"].clone()).unwrap()
}
fn available(candidate: &CandidateGearingResult, count: usize, limit: f64) {
    assert_eq!(
        candidate.gearing.unsupported, None,
        "{}",
        candidate.diagnostics
    );
    assert_eq!(candidate.gearing.gears.len(), count);
    assert!(candidate.gearing.gears.windows(2).all(|g| g[0] > g[1]));
    for value in std::iter::once(&candidate.gearing.final_drive).chain(&candidate.gearing.gears) {
        assert!(value.is_finite() && *value > 0.0);
        assert!((value * 100.0 - (value * 100.0).round()).abs() < 1e-7);
    }
    let d = &candidate.diagnostics;
    assert!(
        d["wheelSpeedErrorKmh"].as_f64().unwrap().abs()
            <= d["endpointToleranceKmh"].as_f64().unwrap() + 1e-9
    );
    assert!(d["actualRpmAtTargetWheelSpeed"].as_f64().unwrap() <= limit + 1e-7);
    assert!(d["groundSpeedKmh"].is_null());
    assert!(d["workingBand"].is_null());
    assert!(respects_hard_targets(&candidate.gearing, d));
}
fn range(min: f64, max: f64) -> RatioRange {
    RatioRange {
        min,
        max,
        step: 0.01,
    }
}

#[test]
fn explicit_working_point_is_traceable_without_claiming_a_usable_band_or_ground_speed() {
    let candidate = solve_candidate(6, &profile(), 7500.0, Some(&target()), None);
    available(&candidate, 6, 7500.0);
    assert_eq!(
        serde_json::to_value(&candidate.gearing).unwrap(),
        fixture()["expected"]["gearing"]
    );
    let d = &candidate.diagnostics;
    assert_eq!(d["modelVersion"], "aego-drift-working/v1");
    assert_eq!(d["mainGear"], 3);
    assert_eq!(d["referenceRpm"], 5000.0);
    assert_eq!(d["targetWheelSpeedKmh"], 100.0);
    assert_eq!(d["targetSource"], "user-target");
    assert_eq!(d["speedSemantics"], fixture()["expected"]["speedSemantics"]);
    assert_eq!(d["shapePrior"], fixture()["expected"]["shapePrior"]);
    assert_eq!(d["workingBandStatus"], "unavailable-no-qualified-curve");
    assert_eq!(d["hardwareVerified"], false);
    assert_eq!(d["performanceValidated"], false);
}

#[test]
fn all_gear_counts_and_drives_preserve_the_requested_main_gear_and_distinct_high_gears() {
    for count in 4..=10 {
        for drive in ["RWD", "AWD", "FWD"] {
            let mut p = profile();
            p.drivetrain = Some(drive.into());
            for main in 1..=count {
                let mut t = target();
                t.main_gear = main;
                let c = solve_candidate(count, &p, 7500.0, Some(&t), None);
                available(&c, count, 7500.0);
                assert_eq!(
                    c.diagnostics["drivenTireAxle"],
                    if drive == "FWD" { "front" } else { "rear" }
                );
                if drive == "FWD" {
                    assert!(c.diagnostics["drivetrainApplicability"]
                        .as_str()
                        .unwrap()
                        .contains("not-power-drift"));
                }
            }
        }
    }
}

#[test]
fn saturation_is_visible_and_input_sensitivity_does_not_invent_torque_based_working_bands() {
    let mut t = target();
    t.wheel_speed_kmh = 40.0;
    let c = solve_candidate(6, &profile(), 7500.0, Some(&t), None);
    available(&c, 6, 7500.0);
    assert_eq!(c.diagnostics["status"], "limited");
    assert_eq!(c.diagnostics["finalDriveSaturated"], true);
    assert_eq!(c.diagnostics["shapePreferenceLimited"], true);
    let base = solve_candidate(6, &profile(), 7500.0, Some(&target()), None);
    for torque in [200.0, 400.0, 600.0, 1000.0] {
        let mut p = profile();
        p.max_torque = Some(torque);
        let current = solve_candidate(6, &p, 7500.0, Some(&target()), None);
        assert_eq!(current.gearing, base.gearing);
        assert!(current.diagnostics["workingBand"].is_null());
    }
    let mut shifted = target();
    shifted.wheel_speed_kmh = 130.0;
    let changed = solve_candidate(6, &profile(), 7500.0, Some(&shifted), None);
    available(&changed, 6, 7500.0);
    let anchor = |c: &CandidateGearingResult| c.gearing.final_drive * c.gearing.gears[2];
    assert!(anchor(&changed) < anchor(&base));
}

#[test]
fn narrow_observed_ranges_can_override_shape_but_not_the_main_endpoint() {
    let gears = vec![3.0, 2.0, 1.5, 1.0, 0.8, 0.6];
    let p = profile();
    let mut t = target();
    let circumference = (245.0 * 0.4 * 2.0 + 18.0 * 25.4) * std::f64::consts::PI / 1000.0;
    t.wheel_speed_kmh = calc_gear_speed(
        t.target_rpm,
        1.5,
        3.5,
        circumference / (2.0 * std::f64::consts::PI),
    ) * 3.6;
    let bounds = DriftObservedBounds {
        source: "user-observed".into(),
        final_drive: range(3.5, 3.5),
        gears: gears.iter().map(|g| range(*g, *g)).collect(),
    };
    let c = solve_candidate(6, &p, 7500.0, Some(&t), Some(&bounds));
    available(&c, 6, 7500.0);
    assert_eq!(c.gearing.gears, gears);
    assert_eq!(c.diagnostics["shapePreferenceLimited"], true);
    t.wheel_speed_kmh = 40.0;
    let c = solve_candidate(6, &p, 7500.0, Some(&t), Some(&bounds));
    assert_eq!(c.gearing.unsupported, Some(true));
    assert!(c.gearing.gears.is_empty());
    for bounds in [
        DriftObservedBounds {
            source: "model-prior".into(),
            ..bounds.clone()
        },
        DriftObservedBounds {
            gears: vec![range(1.0, 1.0); 6],
            ..bounds.clone()
        },
        DriftObservedBounds {
            final_drive: range(3.501, 3.501),
            ..bounds.clone()
        },
    ] {
        assert_eq!(
            solve_candidate(6, &p, 7500.0, Some(&target()), Some(&bounds))
                .gearing
                .unsupported,
            Some(true)
        );
    }
}

#[test]
fn missing_invalid_or_client_curve_evidence_never_becomes_a_working_band() {
    let p = profile();
    assert_eq!(
        solve_candidate(6, &p, 7500.0, None, None)
            .gearing
            .unsupported,
        Some(true)
    );
    for patch in [
        json!({"source":"telemetry"}),
        json!({"mainGear":0}),
        json!({"mainGear":7}),
        json!({"targetRpm":0}),
        json!({"targetRpm":8000}),
        json!({"wheelSpeedKmh":0}),
    ] {
        let mut raw = serde_json::to_value(target()).unwrap();
        for (key, value) in patch.as_object().unwrap() {
            raw[key] = value.clone();
        }
        let t: DriftWorkingTarget = serde_json::from_value(raw).unwrap();
        assert_eq!(
            solve_candidate(6, &p, 7500.0, Some(&t), None)
                .gearing
                .unsupported,
            Some(true)
        );
    }
    // Neither partial nor purportedly complete client curves are a qualification boundary.
    for curve in [
        json!([]),
        json!([{"rpm":3500,"power":200}]),
        json!({"qualified":true,"coverage":"full"}),
    ] {
        let mut raw = serde_json::to_value(target()).unwrap();
        raw["curve"] = curve;
        assert!(serde_json::from_value::<DriftWorkingTarget>(raw).is_err());
    }
    for count in [0, 3, 11] {
        assert_eq!(
            solve_candidate(count, &p, 7500.0, Some(&target()), None)
                .gearing
                .unsupported,
            Some(true)
        );
    }
    for rpm in [0.0, f64::NAN, f64::INFINITY] {
        assert_eq!(
            solve_candidate(6, &p, rpm, Some(&target()), None)
                .gearing
                .unsupported,
            Some(true)
        );
    }
    let mut p = profile();
    p.drivetrain = Some("FWD".into());
    p.front_tire_width = None;
    assert_eq!(
        solve_candidate(6, &p, 7500.0, Some(&target()), None)
            .gearing
            .unsupported,
        Some(true)
    );
    p = profile();
    p.weight = Some(0.0);
    assert_eq!(
        solve_candidate(6, &p, 7500.0, Some(&target()), None)
            .gearing
            .unsupported,
        Some(true)
    );
}

#[test]
fn effective_limiter_is_a_hard_rounded_operating_rpm_limit() {
    assert_eq!(
        solve_candidate(6, &profile(), 4400.0, Some(&target()), None)
            .gearing
            .unsupported,
        Some(true)
    );
    let mut t = target();
    t.target_rpm = 4800.0;
    for speed in [80.0, 100.0, 130.0] {
        t.wheel_speed_kmh = speed;
        let c = solve_candidate(6, &profile(), 4800.0, Some(&t), None);
        available(&c, 6, 4800.0);
    }
}

#[test]
fn adjusted_ratios_must_keep_the_main_endpoint_and_effective_rpm_limit() {
    let c = solve_candidate(6, &profile(), 7500.0, Some(&target()), None);
    assert!(respects_hard_targets(&c.gearing, &c.diagnostics));
    let mut altered = c.gearing.clone();
    altered.gears[2] += 0.1;
    assert!(!respects_hard_targets(&altered, &c.diagnostics));
    assert_eq!(
        adjusted_diagnostics(&altered, &c.diagnostics)["status"],
        "unavailable"
    );
    assert!(adjusted_diagnostics(&altered, &c.diagnostics)["actualWheelSpeedKmh"].is_null());
    let mut limiter = c.diagnostics.clone();
    limiter["usableLimitRpm"] = json!(5000.0);
    assert!(!respects_hard_targets(&c.gearing, &limiter));
    for altered in [
        {
            let mut g = c.gearing.clone();
            g.gears.pop();
            g
        },
        {
            let mut g = c.gearing.clone();
            g.gears[3] = g.gears[2];
            g
        },
        {
            let mut g = c.gearing.clone();
            g.final_drive += 0.001;
            g
        },
    ] {
        assert!(!respects_hard_targets(&altered, &c.diagnostics));
    }
    // A different rounded equivalent is accepted, and its actual diagnostics
    // must describe that selection rather than the immutable original gearing.
    let mut adjusted = c.gearing.clone();
    adjusted.final_drive = 4.0;
    adjusted.gears = c
        .gearing
        .gears
        .iter()
        .map(|g| (g * c.gearing.final_drive / 4.0 * 100.0).round() / 100.0)
        .collect();
    assert!(respects_hard_targets(&adjusted, &c.diagnostics));
    let d = adjusted_diagnostics(&adjusted, &c.diagnostics);
    assert_ne!(d["actualTotalRatio"], c.diagnostics["actualTotalRatio"]);
    assert_ne!(
        d["actualWheelSpeedKmh"],
        c.diagnostics["actualWheelSpeedKmh"]
    );
    assert_eq!(
        d["targetWheelSpeedKmh"],
        c.diagnostics["targetWheelSpeedKmh"]
    );
    assert_eq!(d["targetSource"], c.diagnostics["targetSource"]);
    assert!(d["actualRpmAtTargetWheelSpeed"].as_f64().unwrap() <= 7500.0);
}

#[test]
fn unrelated_models_production_and_chassis_stay_owned_by_their_original_owners() {
    let p = profile();
    let c = solve_candidate(6, &p, 7500.0, Some(&target()), None);
    let mut changed = p.clone();
    changed.road_awd_rear_percent = Some(99.0);
    changed.rally_profile = Some(RallyProfile::CrossCountry);
    changed.drag_finish_speed_kmh = Some(40.0);
    changed.drag_finish_speed_provenance = Some("manual".into());
    assert_eq!(
        solve_candidate(6, &changed, 7500.0, Some(&target()), None).gearing,
        c.gearing
    );
    let expected = fixture()["historicalComparison"]["gears"].clone();
    for (torque, fd) in [(200.0, 6.1), (400.0, 6.1), (600.0, 6.1), (1000.0, 5.8)] {
        let mut p = profile();
        p.max_torque = Some(torque);
        let historical = calculate_aego_gearing(RaceGoal::Drift, 6, &p, 7500.0, None);
        assert_eq!(historical.final_drive, fd);
        assert_eq!(serde_json::to_value(historical.gears).unwrap(), expected);
    }
}
