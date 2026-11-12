use fh6_backend::tuning::{
    aego_model::{historical_model, AegoModel},
    RaceGoal,
};

#[test]
fn independent_ids_are_strict_and_goal_checked() {
    let models = [
        AegoModel::RoadJointV2,
        AegoModel::RoadLaunchV3,
        AegoModel::RallyV1,
        AegoModel::DriftV1,
        AegoModel::DragV1,
    ];
    let goals = [
        RaceGoal::Road,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Drag,
        RaceGoal::DangerSign,
    ];
    for model in models {
        assert_eq!(serde_json::to_value(model).unwrap(), model.id());
        for goal in goals {
            assert_eq!(
                AegoModel::parse_for_goal(model.id(), goal).ok(),
                (model.goal() == goal).then_some(model)
            );
        }
    }
    for id in [
        "aego-road-launch-envelope/v4",
        "aego-rally/v2",
        "aego-drift/v2",
        "aego-drag/v2",
        "latest",
        "",
        "AEGO-RALLY/V1",
    ] {
        for goal in goals {
            assert!(AegoModel::parse_for_goal(id, goal).is_err());
        }
    }
    assert!(AegoModel::production(RaceGoal::DangerSign).is_none());
}

#[test]
fn missing_historical_ids_use_frozen_formula_schema_and_goal_mapping() {
    for (goal, old, current) in [
        (
            RaceGoal::Road,
            AegoModel::RoadJointV2,
            AegoModel::RoadLaunchV3,
        ),
        (RaceGoal::Rally, AegoModel::RallyV1, AegoModel::RallyV1),
        (RaceGoal::Drift, AegoModel::DriftV1, AegoModel::DriftV1),
        (RaceGoal::Drag, AegoModel::DragV1, AegoModel::DragV1),
    ] {
        for (formula, schema, expected) in [
            (
                "rust/ice-measured-workflow-v1",
                "tuning-workflow-result/v1",
                old,
            ),
            (
                "rust/ice-measured-workflow-v3",
                "tuning-workflow-result/v2",
                current,
            ),
        ] {
            assert_eq!(
                historical_model(formula, schema, goal, None).unwrap(),
                Some(expected)
            );
            assert_eq!(
                historical_model(formula, schema, goal, Some(expected.id())).unwrap(),
                Some(expected)
            );
            assert!(historical_model(formula, schema, goal, Some("unknown/v99")).is_err());
        }
        assert!(historical_model(
            "rust/ice-measured-workflow-v99",
            "tuning-workflow-result/v2",
            goal,
            None
        )
        .is_err());
        assert!(historical_model(
            "rust/ice-measured-workflow-v1",
            "tuning-workflow-result/v2",
            goal,
            None
        )
        .is_err());
        assert!(historical_model(
            "rust/ice-measured-workflow-v3",
            "tuning-workflow-result/v1",
            goal,
            None
        )
        .is_err());
    }
    assert_eq!(
        historical_model(
            "rust/ice-measured-workflow-v2",
            "tuning-workflow-result/v1",
            RaceGoal::Road,
            None
        )
        .unwrap(),
        Some(AegoModel::RoadLaunchV3)
    );
    assert!(historical_model(
        "rust/ice-measured-workflow-v2",
        "tuning-workflow-result/v1",
        RaceGoal::Rally,
        None
    )
    .is_err());
    assert!(historical_model(
        "rust/ice-measured-workflow-v1",
        "tuning-workflow-result/v1",
        RaceGoal::Road,
        Some(AegoModel::RoadLaunchV3.id())
    )
    .is_err());
    for (formula, schema) in [
        ("rust/ev-measured-workflow-v1", "tuning-workflow-result/v1"),
        ("rust/ev-measured-workflow-v2", "tuning-workflow-result/v2"),
        ("rust/ev-measured-workflow-v3", "tuning-workflow-result/v3"),
    ] {
        assert_eq!(
            historical_model(formula, schema, RaceGoal::Road, None).unwrap(),
            None
        );
        assert!(historical_model(
            formula,
            schema,
            RaceGoal::Road,
            Some(AegoModel::RoadLaunchV3.id())
        )
        .is_err());
    }
    assert_eq!(
        historical_model(
            "rust/ice-measured-workflow-v1",
            "tuning-workflow-result/v1",
            RaceGoal::DangerSign,
            None
        )
        .unwrap(),
        None
    );
}
