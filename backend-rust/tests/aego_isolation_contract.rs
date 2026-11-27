use fh6_backend::tuning::{
    gearing::calculate_aego_gearing,
    gearing::{
        allocation::allocate_total_ratios,
        contracts::{RatioBounds, RatioRange},
    },
    RaceGoal, RallyProfile, TuningCarParams,
};

fn synthetic(drive: &str) -> TuningCarParams {
    serde_json::from_value(serde_json::json!({
        "weight":1400.0,"weightDistribution":55.0,"drivetrain":drive,
        "maxHp":300.0,"maxTorque":400.0,"maxHpRpm":5000.0,"maxTorqueRpm":3500.0,
        "frontTireWidth":225.0,"frontTireAspect":45.0,"frontTireRim":17.0,
        "rearTireWidth":245.0,"rearTireAspect":40.0,"rearTireRim":18.0,
        "aeroEfficiency":0.5,"driftWorkingTarget":{"mainGear":3,"targetRpm":4000,"wheelSpeedKmh":90,"source":"user-target"}
    }))
    .unwrap()
}

#[test]
fn each_goal_ignores_other_models_profile_controls() {
    for drive in ["AWD", "RWD", "FWD"] {
        let p = synthetic(drive);
        for goal in [
            RaceGoal::Road,
            RaceGoal::Rally,
            RaceGoal::Drift,
            RaceGoal::Drag,
            RaceGoal::DangerSign,
        ] {
            let mut unrelated = p.clone();
            if goal != RaceGoal::Road {
                unrelated.road_awd_rear_percent = Some(95.0);
            }
            if goal != RaceGoal::Rally {
                unrelated.rally_profile = Some(RallyProfile::CrossCountry);
            }
            if goal != RaceGoal::Drag {
                unrelated.drag_finish_speed_kmh = Some(40.0);
                unrelated.drag_finish_speed_provenance = Some("manual".into());
            }
            for count in 4..=10 {
                assert_eq!(
                    calculate_aego_gearing(goal, count, &p, 7500.0, None),
                    calculate_aego_gearing(goal, count, &unrelated, 7500.0, None),
                    "{goal:?}/{drive}/{count}"
                );
            }
        }
    }
}

#[test]
fn explicit_allocation_preserves_totals_on_the_callers_grid_or_refuses() {
    let bounds = RatioBounds {
        final_drive: RatioRange {
            min: 2.0,
            max: 6.5,
            step: 0.01,
        },
        gears: RatioRange {
            min: 0.4,
            max: 6.0,
            step: 0.01,
        },
    };
    for totals in [
        vec![12.0, 8.0, 5.0, 3.0],
        vec![20.0, 15.0, 10.0, 8.0, 6.0, 4.0],
    ] {
        let result = allocate_total_ratios(&totals, bounds, 3.52, 0.01).unwrap();
        assert!(result.gears.windows(2).all(|v| v[0] > v[1]));
        for (gear, total) in result.gears.iter().zip(totals) {
            assert!((gear * result.final_drive / total - 1.0).abs() <= 0.01);
        }
    }
    // Every positive number is not a feasible ratio: reject range, order and grid conflicts.
    for totals in [
        vec![50.0, 3.0],
        vec![12.0, 0.1],
        vec![3.0, 4.0],
        vec![2.001, 2.0],
        vec![f64::NAN, 1.0],
    ] {
        assert!(allocate_total_ratios(&totals, bounds, 3.52, 0.0).is_none());
    }
    let invalid = RatioBounds {
        final_drive: RatioRange {
            min: 2.0,
            max: 6.5,
            step: 0.0,
        },
        ..bounds
    };
    assert!(allocate_total_ratios(&[12.0, 3.0], invalid, 3.52, 0.01).is_none());
}

#[test]
fn allocation_enforces_grid_projection_total_order_and_overflow_closure() {
    let r = |min, max, step| RatioRange { min, max, step };
    let b = |final_drive, gears| RatioBounds { final_drive, gears };

    let span_totals = [21.02, 14.0, 9.0, 5.0, 3.0, 2.78];
    let span = allocate_total_ratios(
        &span_totals,
        b(r(2.0, 6.5, 0.01), r(0.80, 6.00, 0.01)),
        3.50,
        0.01,
    )
    .unwrap();
    assert_eq!(
        (span.final_drive, span.gears[0], span.gears[5]),
        (3.50, 6.00, 0.80)
    );
    assert!(span.gears.windows(2).all(|w| w[0] > w[1]));
    assert!(span
        .gears
        .iter()
        .zip(span_totals)
        .all(|(g, t)| (g * span.final_drive / t - 1.0).abs() <= 0.01));

    let capped = allocate_total_ratios(
        &[21.02, 5.0],
        b(r(3.50, 3.50, 0.01), r(0.80, 6.005, 0.01)),
        3.50,
        0.01,
    )
    .unwrap();
    assert_eq!(capped.gears[0], 6.00);

    let top = allocate_total_ratios(
        &[12.2, 6.1],
        b(r(2.20, 6.10, 0.01), r(0.40, 6.00, 0.01)),
        6.10,
        0.001,
    )
    .unwrap();
    assert_eq!(top.final_drive, 6.10);

    let full = b(r(2.0, 6.5, 0.01), r(0.40, 6.00, 0.01));
    assert_eq!(
        allocate_total_ratios(&[8.0, 4.0], full, 1e20, 0.01)
            .unwrap()
            .final_drive,
        6.50
    );
    assert_eq!(
        allocate_total_ratios(&[8.0, 4.0], full, -f64::MAX, 0.01)
            .unwrap()
            .final_drive,
        2.00
    );
    assert_eq!(
        allocate_total_ratios(&[10.545, 5.2725], full, 3.515, 0.01)
            .unwrap()
            .final_drive,
        3.51
    );

    let fine = allocate_total_ratios(
        &[1.0 + 5e-10, 1.0 + 4e-10],
        b(r(1.0, 1.0 + 1e-11, 1e-13), r(1.0, 1.0 + 1e-8, 1e-10)),
        1.0 + 5e-12,
        1e-9,
    )
    .unwrap();
    assert!(fine.gears[0] > fine.gears[1]);

    let overflow = allocate_total_ratios(
        &[1.797e308, 1.2e308],
        b(r(1e200, 1e200, 1e198), r(1.0e108, 2.0e108, 1e106)),
        -f64::MAX,
        0.01,
    )
    .unwrap();
    assert_eq!(overflow.gears[0], 1.80e108);
    assert!(overflow.gears[0] > overflow.gears[1]);

    let subnormal = allocate_total_ratios(
        &[2e-308, 1e-308],
        b(r(1e-154, 1e-154, 1e-156), r(1e-154, 2e-154, 1e-156)),
        1e-154,
        1e-6,
    )
    .unwrap();
    assert!(subnormal.gears[0] > subnormal.gears[1]);
    assert!(allocate_total_ratios(
        &[3.0, 2.0, 1.0],
        b(r(2.0, 2.0, 0.01), r(1.0, 1.01, 0.01)),
        2.0,
        0.5
    )
    .is_none());
}

#[test]
fn subnormal_product_with_large_final_drive_rejects_out_of_tolerance_ratios() {
    let r = |min, max, step| RatioRange { min, max, step };
    let b = |final_drive, gears| RatioBounds { final_drive, gears };
    let t1 = 2.0e-308_f64;
    let t2 = 9.65e-309_f64;
    // True relative errors for final_drive = 1e14, gears = [2e-322, 1e-322] are ~1.1869% and ~2.3970% (> 1%)
    let res = allocate_total_ratios(
        &[t1, t2],
        b(r(1e14, 1e14, 1e12), r(1e-322, 2e-322, 1e-322)),
        1e14,
        0.01,
    );
    assert!(
        res.is_none(),
        "expected rejection when true relative error > 1%, got {res:?}"
    );

    // Symmetric case: subnormal final_drive with large gear (> 1.0)
    let sym_reject = allocate_total_ratios(
        &[t1, t2],
        b(r(1e-322, 1e-322, 1e-322), r(1e14, 2e14, 1e14)),
        1e-322,
        0.01,
    );
    assert!(
        sym_reject.is_none(),
        "expected rejection in symmetric subnormal final_drive case, got {sym_reject:?}"
    );

    // Exact acceptance case in subnormal product regime with large final_drive:
    // 40 * 2^-1074 * 1e14 ≈ 1.9762625833649862e-308, 20 * 2^-1074 * 1e14 ≈ 9.881312916824931e-309
    let exact_accept = allocate_total_ratios(
        &[1.9762625833649862e-308, 9.881312916824931e-309],
        b(r(1e14, 1e14, 1e12), r(1e-322, 2e-322, 1e-322)),
        1e14,
        1e-6,
    )
    .unwrap();
    assert_eq!(exact_accept.final_drive, 1e14);
    assert!(exact_accept.gears[0] > exact_accept.gears[1]);

    // Overflow product rejection when true relative error exceeds tighter tolerance
    let overflow_reject = allocate_total_ratios(
        &[1.797e308, 1.2e308],
        b(r(1e200, 1e200, 1e198), r(1.0e108, 2.0e108, 1e106)),
        1e200,
        0.001,
    );
    assert!(overflow_reject.is_none());
}
