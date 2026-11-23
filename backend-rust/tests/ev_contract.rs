use fh6_backend::tuning::{
    calculate_aego_gearing,
    ev::{calculate_ev_gearing, EvGearingInput},
    RaceGoal, TuningCarParams,
};
use serde_json::Value;

fn close(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            assert!((a - b).abs() <= 1e-8 * b.abs().max(1.0), "{a} != {b}");
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                close(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (key, b) in b {
                close(&a[key], b);
            }
        }
        _ => assert_eq!(actual, expected),
    }
}

#[test]
fn ev_solver_matches_shared_taycan_and_boundary_fixtures() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    for case in cases {
        let input: EvGearingInput = serde_json::from_value(case["input"].clone()).unwrap();
        close(
            &serde_json::to_value(calculate_ev_gearing(&input)).unwrap(),
            &case["expected"],
        );
    }
}

#[test]
fn electric_profile_never_enters_legacy_gearing() {
    let params: TuningCarParams =
        serde_json::from_value(serde_json::json!({"isElectric":true})).unwrap();
    for goal in [
        RaceGoal::Road,
        RaceGoal::Drag,
        RaceGoal::Drift,
        RaceGoal::Rally,
    ] {
        let result = calculate_aego_gearing(goal, 6, &params, 17000.0, None);
        assert_eq!(result.unsupported, Some(true));
        assert!(result.gears.is_empty());
    }
}

#[test]
fn ev_enforces_sparse_monotonicity_order_invariant_power_band_and_finite_closure() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    let baseline_input: EvGearingInput = serde_json::from_value(cases[0]["input"].clone()).unwrap();
    let baseline = calculate_ev_gearing(&baseline_input).unwrap();

    // 1. Permutation-invariant 95% peak-power band on unsorted curve bins.
    let mut unsorted = baseline_input.clone();
    for gear in &mut unsorted.measurements {
        gear.curve.reverse();
        gear.curve.rotate_left(3);
    }
    let from_unsorted = calculate_ev_gearing(&unsorted).unwrap();
    for (a, b) in from_unsorted.envelopes.iter().zip(&baseline.envelopes) {
        assert_eq!(a.power_band_start_rpm, b.power_band_start_rpm);
        assert_eq!(a.power_band_end_rpm, b.power_band_end_rpm);
        assert!(a.power_band_start_rpm <= a.power_band_end_rpm);
    }

    // 2. Sparse 3-speed ratios: valid across None gap succeeds; inverted/equal across None fails.
    let mut g3 = baseline_input.measurements[1].clone();
    g3.gear = 3;
    g3.rpm_per_kmh.mean = baseline_input.measurements[0].rpm_per_kmh.mean / 4.0;
    let mut sparse_valid = baseline_input.clone();
    sparse_valid.setup.gear_ratios = vec![Some(4.0), None, Some(1.0)];
    sparse_valid.setup.gear_adjustable = vec![false, false, false];
    sparse_valid.measurements.push(g3.clone());
    assert!(calculate_ev_gearing(&sparse_valid).is_some());

    let mut sparse_inverted = sparse_valid.clone();
    sparse_inverted.setup.gear_ratios = vec![Some(1.0), None, Some(4.0)];
    sparse_inverted.measurements[0].rpm_per_kmh.mean = g3.rpm_per_kmh.mean;
    sparse_inverted.measurements[2].rpm_per_kmh.mean =
        baseline_input.measurements[0].rpm_per_kmh.mean;
    assert!(calculate_ev_gearing(&sparse_inverted).is_none());

    let mut sparse_equal = sparse_valid;
    sparse_equal.setup.gear_ratios = vec![Some(2.0), None, Some(2.0)];
    sparse_equal.measurements[0].rpm_per_kmh.mean = baseline_input.measurements[1].rpm_per_kmh.mean;
    sparse_equal.measurements[2].rpm_per_kmh.mean = baseline_input.measurements[1].rpm_per_kmh.mean;
    assert!(calculate_ev_gearing(&sparse_equal).is_none());

    // 3. Kinematic consistency must reject INF/INF = NaN overflow on tiny positive ratios.
    let mut overflow_known = baseline_input.clone();
    overflow_known.setup.gear_ratios = vec![Some(1e-308), Some(1e-309)];
    overflow_known.measurements[1].rpm_per_kmh.mean = 5000.0;
    assert!(calculate_ev_gearing(&overflow_known).is_none());

    // 4. Scale overflow/underflow and bound_speed_kmh overflow must return None.
    for (setup_fd, cand_fd) in [(1e-308, 20.0), (20.0, f64::from_bits(1))] {
        let mut scaled = baseline_input.clone();
        scaled.setup.final_drive_adjustable = true;
        scaled.setup.final_drive = Some(setup_fd);
        scaled.candidate_final_drive = Some(cand_fd);
        assert!(calculate_ev_gearing(&scaled).is_none());
    }
    let mut speed_overflow = baseline_input;
    speed_overflow.setup.gear_ratios = vec![None, None];
    speed_overflow.measurements[0].rpm_per_kmh.mean = 1e-308;
    speed_overflow.measurements[0].rpm_per_kmh.m2 = 0.0;
    assert!(calculate_ev_gearing(&speed_overflow).is_none());
}
