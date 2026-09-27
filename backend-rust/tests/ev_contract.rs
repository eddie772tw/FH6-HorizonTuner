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
fn ev_recommendation_can_enter_the_shared_verification_step() {
    let body = serde_json::json!({
        "identity": {"ordinal":3445,"performanceIndex":795,"drivetrain":2},
        "carName":"Taycan", "event":{"name":"EV validation","format":"circuit"},
        "recommendation":{"formulaVersion":"ev/measured-workflow-v1",
            "fields":{"gearing.finalDrive":{"value":4.03,"unit":"ratio"}}}
    });
    assert!(fh6_backend::road::validate_request("workflow", &body).is_ok());
    let mut unsupported = body;
    unsupported["recommendation"]["formulaVersion"] = "unrecognized".into();
    assert!(fh6_backend::road::validate_request("workflow", &unsupported).is_err());
}
