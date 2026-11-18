use fh6_backend::tuning::{aego_model::AegoModel, RaceGoal};
#[test]
fn four_current_model_ids_are_strict_and_goal_checked() {
    for goal in [
        RaceGoal::Road,
        RaceGoal::Rally,
        RaceGoal::Drift,
        RaceGoal::Drag,
    ] {
        let model = AegoModel::production(goal).unwrap();
        assert_eq!(AegoModel::parse_for_goal(model.id(), goal).unwrap(), model);
        assert_eq!(serde_json::to_value(model).unwrap(), model.id());
        for other in [
            RaceGoal::Road,
            RaceGoal::Rally,
            RaceGoal::Drift,
            RaceGoal::Drag,
        ] {
            assert_eq!(
                AegoModel::parse_for_goal(model.id(), other).is_ok(),
                goal == other
            );
        }
        assert!(AegoModel::parse_for_goal("latest", goal).is_err());
    }
    assert!(AegoModel::production(RaceGoal::DangerSign).is_none());
}
