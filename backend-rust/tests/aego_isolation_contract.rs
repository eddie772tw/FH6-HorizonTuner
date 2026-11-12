use fh6_backend::tuning::{
    gearing::calculate_aego_gearing_historical as calculate_aego_gearing,
    gearing::{
        allocation::allocate_total_ratios,
        calculate_aego_gearing_v2,
        contracts::{RatioBounds, RatioRange},
    },
    GearingSecondaryCorrection, RaceGoal, RallyProfile, TuningCarParams,
};

fn synthetic(drive: &str) -> TuningCarParams {
    serde_json::from_value(serde_json::json!({
        "weight":1400.0,"weightDistribution":55.0,"drivetrain":drive,
        "maxHp":300.0,"maxTorque":400.0,"maxHpRpm":5000.0,"maxTorqueRpm":3500.0,
        "frontTireWidth":225.0,"frontTireAspect":45.0,"frontTireRim":17.0,
        "rearTireWidth":245.0,"rearTireAspect":40.0,"rearTireRim":18.0,
        "aeroEfficiency":0.5
    }))
    .unwrap()
}

#[test]
fn historical_nonroad_replays_frozen_owner_including_corrections_and_rejections() {
    let correction = GearingSecondaryCorrection {
        simulated_top_speed: Some(120.0),
        soft_max_speed: Some(140.0),
        drag_finish_speed_kmh: Some(40.0),
        drag_finish_speed_provenance: Some("manual".into()),
    };
    for drive in ["AWD", "RWD", "FWD"] {
        let p = synthetic(drive);
        for goal in [
            RaceGoal::Rally,
            RaceGoal::Drift,
            RaceGoal::Drag,
            RaceGoal::DangerSign,
        ] {
            for count in [0, 4, 6, 10, 11] {
                for sc in [None, Some(&correction)] {
                    assert_eq!(
                        calculate_aego_gearing(goal, count, &p, 7500.0, sc),
                        calculate_aego_gearing_v2(goal, count, &p, 7500.0, sc),
                        "{goal:?}/{drive}/{count}"
                    );
                }
            }
        }
    }
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
