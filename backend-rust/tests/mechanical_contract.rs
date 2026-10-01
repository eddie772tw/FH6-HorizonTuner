use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
    tuning::calculation::{calculate_mechanical, MechanicalRequest},
};
use serde_json::{json, Value};

fn same_numbers(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => assert_eq!(a.as_f64(), b.as_f64()),
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (key, value) in b {
                same_numbers(&a[key], value);
            }
        }
        _ => assert_eq!(actual, expected),
    }
}
#[test]
fn mechanical_result_preserves_frozen_desktop_inputs() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/mechanical_desktop_v162.json"
    ))
    .unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let request: MechanicalRequest = serde_json::from_value(json!({"schemaVersion":"tuning-mechanical/v1", "goal":case["goal"],"season":case["season"],"profile":case["profile"]})).unwrap();
        let result = serde_json::to_value(calculate_mechanical(&request).unwrap()).unwrap();
        same_numbers(&result["alignment"], &case["alignment"]);
        same_numbers(&result["chassis"], &case["chassis"]);
    }
}
#[test]
fn local_transport_validates_schema_and_preserves_null_defaults() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let call = |body: Value| {
        app.request(ApiRequest {
            method: "POST".into(),
            path: "/api/tuning/mechanical".into(),
            query: Default::default(),
            headers: Default::default(),
            body: serde_json::to_vec(&body).unwrap(),
            upload_filename: None,
        })
    };
    let mut body = json!({"schemaVersion":"tuning-mechanical/v1","goal":"Road","season":"Summer","profile":{"weight":null,"spring_front_min":null}});
    let result = call(body.clone()).unwrap();
    assert_eq!(result.status, 200);
    let value: Value = serde_json::from_slice(&result.body).unwrap();
    assert!(value["chassis"]["springs"]["front"].is_number());
    body["schemaVersion"] = json!("future/v9");
    assert!(call(body.clone()).is_err());
    body["schemaVersion"] = json!("tuning-mechanical/v1");
    body["profile"] = Value::Null;
    assert!(call(body.clone()).is_err());
    body.as_object_mut().unwrap().remove("profile");
    assert!(call(body).is_err());
}
