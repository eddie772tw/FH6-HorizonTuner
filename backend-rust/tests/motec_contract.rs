use fh6_backend::motec;
use serde_json::{json, Value};

fn equivalent(actual: &Value, expected: &Value, path: &str) {
    if let (Some(a), Some(b)) = (actual.as_f64(), expected.as_f64()) {
        assert!(
            (a - b).abs() <= 1e-8 * b.abs().max(1.0),
            "{path}: {a} != {b}"
        );
    } else if let (Some(a), Some(b)) = (actual.as_object(), expected.as_object()) {
        assert_eq!(a.len(), b.len(), "{path}");
        for (k, v) in b {
            equivalent(&a[k], v, &format!("{path}.{k}"));
        }
    } else if let (Some(a), Some(b)) = (actual.as_array(), expected.as_array()) {
        assert_eq!(a.len(), b.len(), "{path}");
        for (i, (a, b)) in a.iter().zip(b).enumerate() {
            equivalent(a, b, &format!("{path}[{i}]"));
        }
    } else {
        assert_eq!(actual, expected, "{path}");
    }
}
#[test]
fn csv_and_debrief_match_python_reference() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/motec.json")).unwrap();
    let points = fixture["points"].as_array().unwrap();
    assert_eq!(
        String::from_utf8(motec::export(&fixture["metadata"], points).unwrap()).unwrap(),
        include_str!("fixtures/motec.csv")
    );
    let (metadata, points) = motec::import(include_bytes!("fixtures/motec.csv")).unwrap();
    equivalent(&metadata, &fixture["parsedMetadata"], "metadata");
    equivalent(&json!(points), &fixture["parsed"], "parsed");
    equivalent(
        &motec::debrief(fixture["points"].as_array().unwrap()),
        &fixture["debrief"],
        "debrief",
    );
    assert_eq!(motec::debrief(&[]), fixture["emptyDebrief"]);
}
