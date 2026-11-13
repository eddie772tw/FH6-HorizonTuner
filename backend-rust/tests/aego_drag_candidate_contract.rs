use fh6_backend::tuning::{
    gearing::calculate_aego_gearing_historical as calculate_aego_gearing,
    gearing::{
        contracts::{CandidateGearingResult, RatioRange},
        drag::{adjusted_diagnostics, respects_hard_targets, solve_candidate, DragObservedBounds},
    },
    GearingSecondaryCorrection, RaceGoal, TuningCarParams,
};
use serde_json::{json, Value};

fn fixture() -> Value {
    serde_json::from_str(include_str!("../../tests/fixtures/aego_drag_joint_v1.json")).unwrap()
}
fn params() -> TuningCarParams {
    serde_json::from_value(fixture()["carParams"].clone()).unwrap()
}
fn target(mut p: TuningCarParams, speed: f64, source: &str) -> TuningCarParams {
    p.drag_finish_speed_kmh = Some(speed);
    p.drag_finish_speed_provenance = Some(source.into());
    p
}
fn range(min: f64, max: f64) -> RatioRange {
    RatioRange {
        min,
        max,
        step: 0.01,
    }
}
fn available(c: &CandidateGearingResult, count: usize) {
    assert_eq!(c.gearing.unsupported, None, "{}", c.diagnostics);
    assert_eq!(c.diagnostics["status"], "available");
    assert!(respects_hard_targets(&c.gearing, &c.diagnostics));
    assert_eq!(c.gearing.gears.len(), count);
    for value in std::iter::once(&c.gearing.final_drive).chain(&c.gearing.gears) {
        assert!(value.is_finite() && *value > 0.0);
        assert!((value * 100.0 - (value * 100.0).round()).abs() < 1e-7);
    }
}
fn unavailable(c: CandidateGearingResult) {
    assert_eq!(c.gearing.unsupported, Some(true), "{}", c.diagnostics);
    assert!(c.gearing.gears.is_empty());
    assert_eq!(
        c.diagnostics["dragFinishAvailability"]["status"],
        "unavailable"
    );
}

#[test]
fn final_rounded_explicit_endpoints_work_for_four_to_ten_gears_and_each_drive() {
    for count in 4..=10 {
        for drive in ["FWD", "AWD", "RWD"] {
            for provenance in ["manual", "telemetry"] {
                let mut p = target(params(), 250.0, provenance);
                p.drivetrain = Some(drive.into());
                let c = solve_candidate(count, &p, 7500.0, None, None);
                available(&c, count);
                assert_eq!(c.diagnostics["targetSpeedKmh"], 250.0);
                assert_eq!(
                    c.diagnostics["launchTargetSpeedKmh"].as_f64(),
                    fixture()["launchTargetsKmh"][drive].as_f64()
                );
                assert_eq!(c.diagnostics["finishGear"], count);
                assert_eq!(c.diagnostics["referenceRpm"], 5000.0);
                assert_eq!(c.diagnostics["finishEvidenceVerified"], false);
                assert_eq!(
                    c.diagnostics["speedSemantics"],
                    "pure-rolling-wheel-speed-at-peak-power-rpm"
                );
            }
        }
    }
}

#[test]
fn rust_reproduces_missing_historical_finish_rejection_and_candidate_refuses_both_entries() {
    let p = target(params(), 40.0, "manual");
    let sc = GearingSecondaryCorrection {
        simulated_top_speed: None,
        soft_max_speed: None,
        drag_finish_speed_kmh: Some(40.0),
        drag_finish_speed_provenance: Some("manual".into()),
    };
    for (entry, profile, secondary) in
        [("profile40", p, None), ("secondary40", params(), Some(&sc))]
    {
        let historical = calculate_aego_gearing(RaceGoal::Drag, 6, &profile, 7500.0, secondary);
        assert_eq!(historical.unsupported, None);
        assert_eq!(
            historical.final_drive,
            fixture()["historicalComparison"][entry]["finalDrive"]
                .as_f64()
                .unwrap()
        );
        assert_eq!(
            serde_json::to_value(&historical.gears).unwrap(),
            fixture()["historicalComparison"][entry]["gears"]
        );
        let candidate = solve_candidate(6, &profile, 7500.0, secondary, None);
        assert_eq!(candidate.diagnostics["targetSpeedKmh"], 40.0);
        assert!(candidate
            .gearing
            .unsupported_reason
            .as_ref()
            .unwrap()
            .contains("model's engineering constraints"));
        unavailable(candidate);
    }
}

#[test]
fn source_pairs_are_not_mixed_and_secondary_explicit_pair_has_precedence() {
    let p = target(params(), 250.0, "manual");
    let mut sc = GearingSecondaryCorrection {
        simulated_top_speed: None,
        soft_max_speed: None,
        drag_finish_speed_kmh: Some(260.0),
        drag_finish_speed_provenance: None,
    };
    unavailable(solve_candidate(6, &p, 7500.0, Some(&sc), None));
    sc.drag_finish_speed_provenance = Some("telemetry".into());
    let c = solve_candidate(6, &p, 7500.0, Some(&sc), None);
    available(&c, 6);
    assert_eq!(c.diagnostics["targetSpeedKmh"], 260.0);
    assert_eq!(c.diagnostics["finishInputEntry"], "secondary-correction");
    assert_eq!(c.diagnostics["targetSource"], "caller-declared-telemetry");
    for source in ["", "measured", "automatic"] {
        unavailable(solve_candidate(
            6,
            &target(params(), 250.0, source),
            7500.0,
            None,
            None,
        ));
    }
    let mut missing = params();
    missing.drag_finish_speed_kmh = Some(250.0);
    unavailable(solve_candidate(6, &missing, 7500.0, None, None));
    missing.drag_finish_speed_kmh = None;
    missing.drag_finish_speed_provenance = Some("manual".into());
    unavailable(solve_candidate(6, &missing, 7500.0, None, None));
}

#[test]
fn preview_constraints_remain_distinct_from_explicit_finish_and_never_rewrite_it() {
    let correction = GearingSecondaryCorrection {
        simulated_top_speed: Some(360.0),
        soft_max_speed: Some(330.0),
        drag_finish_speed_kmh: None,
        drag_finish_speed_provenance: None,
    };
    let prior = solve_candidate(6, &params(), 7500.0, Some(&correction), None);
    available(&prior, 6);
    assert_eq!(prior.diagnostics["targetSpeedKmh"], 220.0);
    assert_eq!(prior.diagnostics["previewCapApplied"], true);
    assert_eq!(
        prior.diagnostics["targetSource"],
        "inherited-drag-engineering-prior"
    );
    assert_eq!(prior.diagnostics["finishEvidenceVerified"], false);
    let explicit = solve_candidate(
        6,
        &target(params(), 250.0, "manual"),
        7500.0,
        Some(&correction),
        None,
    );
    assert_eq!(explicit.diagnostics["targetSpeedKmh"], 250.0);
    assert!(explicit
        .gearing
        .unsupported_reason
        .as_ref()
        .unwrap()
        .contains("preview constraint"));
    unavailable(explicit);
    let feasible = solve_candidate(
        6,
        &target(params(), 200.0, "manual"),
        7500.0,
        Some(&correction),
        None,
    );
    available(&feasible, 6);
    assert_eq!(feasible.diagnostics["targetSpeedKmh"], 200.0);
}

#[test]
fn observed_limits_override_priors_without_clamping_either_hard_endpoint() {
    let p = target(params(), 250.0, "manual");
    for fd in [2.0, 6.1, 7.0] {
        let bounds = DragObservedBounds {
            source: "user-observed".into(),
            final_drive: range(fd, fd),
            gears: vec![range(0.1, 6.0); 6],
        };
        let c = solve_candidate(6, &p, 7500.0, None, Some(&bounds));
        available(&c, 6);
        assert_eq!(c.gearing.final_drive, fd);
        assert_eq!(c.diagnostics["boundsSource"], "user-observed");
    }
    let base = solve_candidate(6, &p, 7500.0, None, None);
    let exact = DragObservedBounds {
        source: "user-observed".into(),
        final_drive: range(base.gearing.final_drive, base.gearing.final_drive),
        gears: base.gearing.gears.iter().map(|g| range(*g, *g)).collect(),
    };
    let c = solve_candidate(6, &p, 7500.0, None, Some(&exact));
    available(&c, 6);
    assert_eq!(c.gearing, base.gearing);
    let mut impossible = exact.clone();
    impossible.gears[5] = range(3.0, 3.0);
    unavailable(solve_candidate(6, &p, 7500.0, None, Some(&impossible)));
    impossible = exact;
    impossible.source = "inferred".into();
    unavailable(solve_candidate(6, &p, 7500.0, None, Some(&impossible)));
}

#[test]
fn invalid_inputs_and_non_ice_paths_do_not_yield_fallback_ratios() {
    for count in [0, 1, 3, 11] {
        unavailable(solve_candidate(count, &params(), 7500.0, None, None));
    }
    for limit in [0.0, -1.0, f64::NAN, 4000.0] {
        unavailable(solve_candidate(6, &params(), limit, None, None));
    }
    for (field, value) in [
        ("weight", json!(0)),
        ("maxHp", json!(0)),
        ("maxTorque", json!(0)),
        ("weightDistribution", json!(100)),
        ("drivetrain", json!("unknown")),
        ("rearTireWidth", json!(0)),
        ("maxHpRpm", json!(8000)),
        ("isElectric", json!(true)),
        ("aeroEfficiency", json!(2)),
    ] {
        let mut raw = fixture()["carParams"].clone();
        raw[field] = value;
        let p: TuningCarParams = serde_json::from_value(raw).unwrap();
        unavailable(solve_candidate(6, &p, 7500.0, None, None));
    }
    let mut missing = params();
    missing.max_torque = None;
    unavailable(solve_candidate(6, &missing, 7500.0, None, None));
}

#[test]
fn candidate_isolated_from_road_rally_and_non_driven_tire_inputs_and_adjustment_is_rechecked() {
    let p = params();
    let baseline = solve_candidate(6, &p, 7500.0, None, None);
    available(&baseline, 6);
    let mut unrelated = p.clone();
    unrelated.road_awd_rear_percent = Some(99.0);
    unrelated.rally_profile = Some(fh6_backend::tuning::RallyProfile::CrossCountry);
    unrelated.front_tire_width = Some(999.0);
    assert_eq!(
        solve_candidate(6, &unrelated, 7500.0, None, None).gearing,
        baseline.gearing
    );
    let mut adjusted = baseline.gearing.clone();
    adjusted.gears[5] *= 0.5;
    assert!(!respects_hard_targets(&adjusted, &baseline.diagnostics));
    let rejected = adjusted_diagnostics(&adjusted, &baseline.diagnostics);
    assert_eq!(rejected["status"], "unavailable");
    assert_eq!(
        rejected["targetSpeedKmh"],
        baseline.diagnostics["targetSpeedKmh"]
    );
    assert!(
        (rejected["actualSpeedKmh"].as_f64().unwrap()
            - baseline.diagnostics["actualSpeedKmh"].as_f64().unwrap() * 2.0)
            .abs()
            < 1e-8
    );
    assert_eq!(rejected["dragFinishAvailability"]["status"], "unavailable");
    let mut legal = baseline.gearing.clone();
    legal.final_drive += 0.01;
    legal.gears = baseline
        .gearing
        .gears
        .iter()
        .map(|g| (g * baseline.gearing.final_drive / legal.final_drive * 100.0).round() / 100.0)
        .collect();
    assert!(respects_hard_targets(&legal, &baseline.diagnostics));
    let refreshed = adjusted_diagnostics(&legal, &baseline.diagnostics);
    assert_eq!(refreshed["status"], "available");
    assert_eq!(refreshed["finalDrive"], legal.final_drive);
    assert_eq!(
        refreshed["gears"],
        serde_json::to_value(&legal.gears).unwrap()
    );
    assert_eq!(
        refreshed["targetSpeedKmh"],
        baseline.diagnostics["targetSpeedKmh"]
    );
    assert_ne!(
        refreshed["actualSpeedKmh"],
        baseline.diagnostics["actualSpeedKmh"]
    );
    assert_eq!(
        refreshed["dragFinishAvailability"]["actualKmh"],
        refreshed["actualSpeedKmh"]
    );
    let mut fwd = params();
    fwd.drivetrain = Some("FWD".into());
    let front = solve_candidate(6, &fwd, 7500.0, None, None);
    available(&front, 6);
    assert_eq!(front.diagnostics["drivenTireAxle"], "front");
    fwd.rear_tire_width = Some(999.0);
    assert_eq!(
        solve_candidate(6, &fwd, 7500.0, None, None).gearing,
        front.gearing
    );
}

#[test]
fn rounded_target_speeds_must_not_require_rpm_above_the_qualified_usable_limit() {
    let p = target(params(), 250.0, "manual");
    let limited = solve_candidate(6, &p, 5000.0, None, None);
    available(&limited, 6);
    for key in [
        "actualLaunchRpmAtTargetSpeed",
        "actualFinishRpmAtTargetSpeed",
    ] {
        assert!(limited.diagnostics[key].as_f64().unwrap() <= 5000.0 + 1e-8);
    }
    // This rounded grid remains within both speed tolerances but needs >5000 RPM
    // at the requested finish speed. A speed-only acceptance would incorrectly pass.
    let mut bad = limited.gearing.clone();
    bad.final_drive = 3.0;
    bad.gears = vec![1.86, 1.58, 1.34, 1.14, 0.97, 0.83];
    let radius = limited.diagnostics["tireRadiusM"].as_f64().unwrap();
    let actual = fh6_backend::tuning::gearing::calc_gear_speed(5000.0, 0.83, 3.0, radius) * 3.6;
    assert!((actual - 250.0).abs() <= 5.0);
    assert!(!respects_hard_targets(&bad, &limited.diagnostics));
    let diagnostic = adjusted_diagnostics(&bad, &limited.diagnostics);
    assert_eq!(diagnostic["status"], "unavailable");
    assert!(diagnostic["actualFinishRpmAtTargetSpeed"].as_f64().unwrap() > 5000.0);
    assert_eq!(diagnostic["targetSpeedKmh"], 250.0);
}
