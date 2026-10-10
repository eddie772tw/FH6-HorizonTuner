use fh6_backend::tuning::{
    alignment::calculate_static_alignment,
    calculate_chassis_tuning,
    workflow::{calculate_workflow, WorkflowRequest},
};
use serde_json::{json, Value};

fn input() -> Value {
    json!({"schemaVersion":"tuning-workflow-result/v1","goal":"Road","season":"Summer","profile":{"weight":1400,"weight_distribution":48,"drivetrain":"RWD","adjustability":{"suspension":"Race","arb":"Adjustable","diff":"Adjustable"},"spring_front_min":30,"spring_front_max":200,"spring_rear_min":30,"spring_rear_max":200,"height_front_min":10,"height_front_max":20,"height_rear_min":10,"height_rear_max":20,"arb_front_min":1,"arb_front_max":65,"arb_rear_min":1,"arb_rear_max":65},"engine":null,"ev":null,"inputSnapshot":{"carId":"42"}})
}
fn result(input: Value) -> Value {
    serde_json::to_value(calculate_workflow(serde_json::from_value(input).unwrap()).unwrap())
        .unwrap()
}
fn field<'a>(result: &'a Value, key: &str) -> &'a Value {
    result["baselinePreview"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["key"] == key)
        .unwrap()
}
#[test]
fn neutral_preview_keeps_formal_output_for_all_goals_and_units() {
    for goal in ["Road", "Rally", "Drift", "Drag"] {
        let mut raw = input();
        raw["goal"] = json!(goal);
        let request: WorkflowRequest = serde_json::from_value(raw.clone()).unwrap();
        let profile = serde_json::from_value(request.profile.clone()).unwrap();
        let expected_c =
            serde_json::to_value(calculate_chassis_tuning(request.goal, &profile)).unwrap();
        let expected_a = serde_json::to_value(calculate_static_alignment(
            request.goal,
            request.season,
            &profile,
        ))
        .unwrap();
        let out = result(raw);
        assert_eq!(out["chassis"], expected_c);
        assert_eq!(out["alignment"], expected_a);
        assert_eq!(
            field(&out, "spring.front")["recommended"],
            expected_c["springs"]["front"]
        );
        assert_eq!(
            field(&out, "height.front")["recommended"],
            expected_c["springs"]["heightF"]
        );
        assert_eq!(
            field(&out, "pressure.front")["recommended"],
            expected_a["pcF"]
        );
        for (key, unit) in [
            ("spring.front", "kgf/mm"),
            ("height.front", "cm"),
            ("pressure.front", "psi"),
            ("camber.front", "deg"),
            ("diff.rear.acceleration", "%"),
        ] {
            assert_eq!(field(&out, key)["unit"], unit);
        }
        assert_eq!(out["baselinePreview"]["stiffness"], "neutral");
        assert_eq!(out["baselinePreview"]["balance"], "neutral");
        assert!(out["recommendation"].is_null());
    }
}
#[test]
fn missing_weight_or_distribution_cannot_apply_plausible_fallbacks() {
    for (key, reason, value) in [
        ("weight", "missing-weight", Value::Null),
        ("weight", "missing-weight", json!(0)),
        ("weight_distribution", "missing-distribution", Value::Null),
        ("weight_distribution", "missing-distribution", json!(100)),
    ] {
        let mut raw = input();
        raw["profile"][key] = value;
        let out = result(raw);
        assert_eq!(out["baselinePreview"]["canApply"], false);
        assert!(out["baselinePreview"]["missingInputs"]
            .as_array()
            .unwrap()
            .contains(&json!(reason)));
        assert!(field(&out, "pressure.front")["recommended"].is_null());
    }
}
#[test]
fn locks_and_unknown_invalid_ranges_are_explicit_and_unapplied() {
    let mut raw = input();
    raw["profile"]["adjustability"]["suspension"] = json!("Fixed");
    let out = result(raw);
    for key in [
        "spring.front",
        "height.front",
        "camber.front",
        "rebound.front",
    ] {
        assert_eq!(field(&out, key)["reason"], "capability-locked");
        assert!(field(&out, key)["recommended"].is_null());
        assert!(!out["baselinePreview"]["affectedFields"]
            .as_array()
            .unwrap()
            .contains(&json!(key)));
    }
    for (min, max, reason) in [
        (Value::Null, json!(200), "unknown-range"),
        (json!(200), json!(30), "invalid-range"),
        (json!(-2), json!(200), "invalid-range"),
    ] {
        let mut raw = input();
        raw["profile"]["spring_front_min"] = min;
        raw["profile"]["spring_front_max"] = max;
        let out = result(raw);
        assert_eq!(field(&out, "spring.front")["reason"], reason);
        assert!(field(&out, "spring.front")["recommended"].is_null());
    }
    let mut raw = input();
    raw["profile"]["arb_front_min"] = json!(-1);
    let out = result(raw);
    assert_eq!(field(&out, "arb.front")["reason"], "invalid-range");
}
#[test]
fn current_zero_is_valid_unknown_units_are_not_and_repeat_apply_has_no_changes() {
    let mut raw = input();
    raw["inputSnapshot"]["baselineCurrent"] =
        json!({"toe.front":{"value":0,"unit":"deg"},"spring.front":{"value":100,"unit":"lb/in"}});
    let out = result(raw.clone());
    assert_eq!(field(&out, "toe.front")["current"], 0.0);
    assert_eq!(
        field(&out, "toe.front")["delta"],
        field(&out, "toe.front")["recommended"]
    );
    assert!(field(&out, "spring.front")["current"].is_null());
    let mut current = serde_json::Map::new();
    for field in out["baselinePreview"]["fields"].as_array().unwrap() {
        if field["status"] == "available" {
            current.insert(
                field["key"].as_str().unwrap().into(),
                json!({"value":field["recommended"],"unit":field["unit"]}),
            );
        }
    }
    raw["inputSnapshot"]["baselineCurrent"] = Value::Object(current);
    let out = result(raw);
    assert_eq!(out["baselinePreview"]["canApply"], false);
    assert!(out["baselinePreview"]["affectedFields"]
        .as_array()
        .unwrap()
        .is_empty());
}
