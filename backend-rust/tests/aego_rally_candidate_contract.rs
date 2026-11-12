use fh6_backend::tuning::{
    gearing::{
        contracts::{CandidateGearingResult, RatioRange},
        rally::{respects_hard_targets, solve_candidate, RallyObservedBounds},
    },
    GearingSecondaryCorrection, RallyProfile, TuningCarParams,
};
use serde_json::{json, Value};

fn profile() -> TuningCarParams {
    serde_json::from_value(fixture()["inputs"]["carParams"].clone()).unwrap()
}

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_rally_joint_v1.json"
    ))
    .unwrap()
}

fn available(candidate: &CandidateGearingResult, count: usize) {
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
        (d["actualSpeedKmh"].as_f64().unwrap() - d["targetSpeedKmh"].as_f64().unwrap()).abs()
            <= d["endpointToleranceKmh"].as_f64().unwrap() + 1e-9
    );
}

fn range(min: f64, max: f64) -> RatioRange {
    RatioRange {
        min,
        max,
        step: 0.01,
    }
}

fn bounds(fd: f64, gears: Vec<RatioRange>) -> RallyObservedBounds {
    RallyObservedBounds {
        source: "user-observed".into(),
        final_drive: range(fd, fd),
        gears,
    }
}

#[test]
fn rounded_endpoint_search_keeps_a_feasible_adjacent_tick() {
    for (target, rpm, fd) in [(99.02_f64, 2500.0, 6.28), (99.0, 1392.8900153434108, 3.5)] {
        let mut params = profile();
        params.max_hp = Some((target / 28.0).powi(3));
        params.max_hp_rpm = Some(rpm);
        params.max_torque = Some(150.0);
        params.max_torque_rpm = Some(1500.0);
        let observed = bounds(fd, vec![range(0.1, 6.0); 6]);
        let candidate = solve_candidate(6, &params, 7500.0, None, Some(&observed));
        available(&candidate, 6);
        assert_eq!(candidate.gearing.final_drive, fd);
        assert_eq!(candidate.gearing.gears[5], 0.5);
        assert!(respects_hard_targets(
            &candidate.gearing,
            &candidate.diagnostics
        ));
    }
}

#[test]
fn historical_endpoint_counterexample_hits_the_predeclared_target() {
    let fixture = fixture();
    let candidate = solve_candidate(6, &profile(), 7500.0, None, None);
    available(&candidate, 6);
    let historical = fh6_backend::tuning::gearing::calculate_aego_gearing_v2(
        fh6_backend::tuning::RaceGoal::Rally,
        6,
        &profile(),
        7500.0,
        None,
    );
    assert_eq!(
        serde_json::to_value(&historical).unwrap(),
        fixture["historicalComparison"]["rustGearing"]
    );
    let historical_speed = fh6_backend::tuning::gearing::calc_gear_speed(
        5000.0,
        historical.gears[5],
        historical.final_drive,
        candidate.diagnostics["tireRadiusM"].as_f64().unwrap(),
    ) * 3.6;
    assert!(
        (historical_speed
            - fixture["historicalComparison"]["rustTopSpeedKmh"]
                .as_f64()
                .unwrap())
        .abs()
            < 1e-7
    );
    let d = &candidate.diagnostics;
    let expected = fixture["expected"]["targetSpeedKmh"].as_f64().unwrap();
    assert!((d["targetSpeedKmh"].as_f64().unwrap() - expected).abs() < 1e-8);
    assert_eq!(d["modelVersion"], "aego-rally-joint/v1");
    assert_eq!(
        d["speedSemantics"],
        "pure-rolling-wheel-speed-at-peak-power-rpm"
    );
    assert_eq!(d["boundsSource"], "model-prior-not-game-observation");
    assert_eq!(d["hardwareVerified"], false);
    assert_eq!(d["performanceValidated"], false);
    assert_eq!(d["referenceRpm"], 5000.0);
    assert_eq!(d["maxRpm"], 7500.0);
    assert!(
        fixture["historicalComparison"]["historicalTsTopSpeedKmh"]
            .as_f64()
            .unwrap()
            > expected * 2.0
    );
}

#[test]
fn equivalent_allocations_must_preserve_rally_hard_targets() {
    let candidate = solve_candidate(6, &profile(), 7500.0, None, None);
    assert!(respects_hard_targets(
        &candidate.gearing,
        &candidate.diagnostics
    ));
    let mut broken = candidate.gearing.clone();
    broken.gears[5] *= 0.5;
    assert!(!respects_hard_targets(&broken, &candidate.diagnostics));
    broken = candidate.gearing.clone();
    broken.gears.pop();
    assert!(!respects_hard_targets(&broken, &candidate.diagnostics));
    broken = candidate.gearing.clone();
    broken.final_drive += 0.001;
    assert!(!respects_hard_targets(&broken, &candidate.diagnostics));
    let mut diagnostic = candidate.diagnostics.clone();
    diagnostic["endpointToleranceKmh"] = json!(1000.0);
    assert!(!respects_hard_targets(&candidate.gearing, &diagnostic));
}

#[test]
fn four_to_ten_gears_and_each_drive_keep_endpoints_even_at_low_peak_rpm() {
    for count in 4..=10 {
        for drive in ["FWD", "RWD", "AWD"] {
            let mut params = profile();
            params.drivetrain = Some(drive.into());
            for rpm in [2500.0, 5000.0] {
                params.max_hp_rpm = Some(rpm);
                available(&solve_candidate(count, &params, 7500.0, None, None), count);
            }
        }
    }
}

#[test]
fn cross_country_shortens_the_complete_transmission_without_road_rpm_caps() {
    for count in 4..=10 {
        let mut params = profile();
        let mixed = solve_candidate(count, &params, 7500.0, None, None);
        params.rally_profile = Some(RallyProfile::CrossCountry);
        let cross = solve_candidate(count, &params, 7500.0, None, None);
        available(&mixed, count);
        available(&cross, count);
        let total = |g: &CandidateGearingResult| g.gearing.final_drive * g.gearing.gears[count - 1];
        assert!(total(&cross) > total(&mixed));
        assert!(
            (cross.diagnostics["targetSpeedKmh"].as_f64().unwrap()
                / mixed.diagnostics["targetSpeedKmh"].as_f64().unwrap()
                - 0.9)
                .abs()
                < 1e-12
        );
    }
}

#[test]
fn observed_bounds_override_model_priors_and_preferences_but_not_the_endpoint() {
    for fd in [2.0, 6.5, 7.0] {
        let observed = bounds(fd, vec![range(0.1, 6.0); 6]);
        let candidate = solve_candidate(6, &profile(), 7500.0, None, Some(&observed));
        available(&candidate, 6);
        assert_eq!(candidate.gearing.final_drive, fd);
        assert_eq!(
            candidate.diagnostics["outsideModelFinalDrivePrior"],
            fd > 6.5
        );
    }
    // The endpoint can be met with a very different shape. Shape is a preference,
    // so a narrow legal observation must not be rejected for missing first=2.7.
    let observed = bounds(
        3.5,
        [1.0, 0.99, 0.98, 0.97, 0.96, 0.94]
            .map(|g| range(g, g))
            .to_vec(),
    );
    let candidate = solve_candidate(6, &profile(), 7500.0, None, Some(&observed));
    available(&candidate, 6);
    assert_eq!(
        candidate.gearing.gears,
        vec![1.0, 0.99, 0.98, 0.97, 0.96, 0.94]
    );
    assert_eq!(candidate.diagnostics["shapePreferenceLimited"], true);
    let impossible = bounds(
        2.0,
        [4.0, 3.0, 2.5, 2.0, 1.5, 1.0].map(|g| range(g, g)).to_vec(),
    );
    let candidate = solve_candidate(6, &profile(), 7500.0, None, Some(&impossible));
    assert_eq!(candidate.gearing.unsupported, Some(true));
    assert!(candidate.gearing.gears.is_empty());
    assert!(candidate
        .gearing
        .unsupported_reason
        .unwrap()
        .contains("endpoint"));
}

#[test]
fn malformed_or_unordered_observations_never_yield_a_fallback_recommendation() {
    let mut observed = bounds(3.5, vec![range(0.1, 6.0); 6]);
    let mut bad = vec![];
    observed.source = "model-prior".into();
    bad.push(observed.clone());
    observed.source = "user-observed".into();
    observed.gears.pop();
    bad.push(observed.clone());
    observed.gears.push(range(0.1, 6.0));
    observed.final_drive.step = 0.1;
    bad.push(observed.clone());
    observed.final_drive = range(3.501, 3.501);
    bad.push(observed.clone());
    observed.final_drive = range(3.5, 3.5);
    observed.gears = vec![range(1.0, 1.0); 6];
    bad.push(observed);
    for bounds in bad {
        let result = solve_candidate(6, &profile(), 7500.0, None, Some(&bounds));
        assert_eq!(result.gearing.unsupported, Some(true));
        assert!(result.gearing.gears.is_empty());
    }
}

#[test]
fn preview_caps_are_not_finish_measurements_and_unrelated_inputs_are_isolated() {
    let params = profile();
    let base = solve_candidate(6, &params, 7500.0, None, None);
    let correction = GearingSecondaryCorrection {
        simulated_top_speed: Some(240.0),
        soft_max_speed: Some(210.0),
        drag_finish_speed_kmh: Some(40.0),
        drag_finish_speed_provenance: Some("manual".into()),
    };
    let capped = solve_candidate(6, &params, 7500.0, Some(&correction), None);
    available(&capped, 6);
    assert_eq!(capped.diagnostics["targetSpeedKmh"], 140.0);
    assert_eq!(capped.diagnostics["previewCapApplied"], true);
    let mut unrelated = params.clone();
    unrelated.road_awd_rear_percent = Some(99.0);
    unrelated.drag_finish_speed_kmh = Some(40.0);
    unrelated.drag_finish_speed_provenance = Some("manual".into());
    unrelated.aero_efficiency = Some(0.9);
    assert_eq!(
        solve_candidate(6, &unrelated, 7500.0, None, None).gearing,
        base.gearing
    );
    let bad_cap = GearingSecondaryCorrection {
        simulated_top_speed: Some(f64::NAN),
        ..correction
    };
    assert_eq!(
        solve_candidate(6, &params, 7500.0, Some(&bad_cap), None)
            .gearing
            .unsupported,
        Some(true)
    );
}

#[test]
fn fwd_uses_explicit_front_dimensions_and_missing_or_illegal_inputs_are_unavailable() {
    let mut params = profile();
    params.drivetrain = Some("FWD".into());
    params.front_tire_rim = Some(20.0);
    let fwd = solve_candidate(6, &params, 7500.0, None, None);
    available(&fwd, 6);
    assert_eq!(fwd.diagnostics["drivenTireAxle"], "front");
    params.drivetrain = Some("RWD".into());
    let rwd = solve_candidate(6, &params, 7500.0, None, None);
    assert!(
        fwd.diagnostics["wheelCircumferenceM"].as_f64().unwrap()
            > rwd.diagnostics["wheelCircumferenceM"].as_f64().unwrap()
    );
    let mut bad = vec![];
    for (field, value) in [
        ("weight", json!(0.0)),
        ("maxHp", json!(0.0)),
        ("maxTorque", json!(-1.0)),
        ("maxHpRpm", json!(8000.0)),
        ("weightDistribution", json!(100.0)),
        ("drivetrain", json!("unknown")),
        ("rearTireWidth", Value::Null),
    ] {
        let mut raw = fixture()["inputs"]["carParams"].clone();
        raw[field] = value;
        bad.push(serde_json::from_value::<TuningCarParams>(raw).unwrap());
    }
    params.drivetrain = Some("FWD".into());
    params.front_tire_width = None;
    bad.push(params);
    for params in bad {
        assert_eq!(
            solve_candidate(6, &params, 7500.0, None, None)
                .gearing
                .unsupported,
            Some(true)
        );
    }
    for (count, rpm) in [(3, 7500.0), (11, 7500.0), (6, 0.0), (6, f64::NAN)] {
        assert_eq!(
            solve_candidate(count, &profile(), rpm, None, None)
                .gearing
                .unsupported,
            Some(true)
        );
    }
}
