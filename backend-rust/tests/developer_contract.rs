use fh6_backend::tuning::{capabilities, developer};
use serde_json::Value;
fn same(a: &Value, b: &Value) {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => assert_eq!(a.as_f64(), b.as_f64()),
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                same(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (k, b) in b {
                same(&a[k], b);
            }
        }
        _ => assert_eq!(a, b),
    }
}
#[test]
fn versioned_developer_model_preserves_frozen_desktop_outputs() {
    let cases: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/developer_desktop_v162.json"
    ))
    .unwrap();
    for c in cases.as_array().unwrap() {
        same(&developer::calculate(&c["input"]).unwrap(), &c["output"]);
        same(
            &capabilities::contract(&c["input"]["car"]),
            &c["capabilityContract"],
        );
    }
}
