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

#[test]
fn export_neutralizes_csv_formula_injection_in_metadata() {
    let cases = [
        ("=cmd|'/C calc'!A0", "+SUM(1,1)"),
        ("-2+3", "@SUM(1,1)"),
        ("  =HYPERLINK(\"http://evil.example\")", "\t=1+1"),
        ("\r=1+1", "\n=1+1"),
    ];
    let sample = [json!({"time": 0.1, "AccelerationX": -9.81})];
    for (session_id, car_name) in cases {
        let bytes = motec::export(
            &json!({"session_id": session_id, "car_name": car_name}),
            &sample,
        )
        .unwrap();
        let csv = String::from_utf8_lossy(&bytes);
        let (imported_meta, _) = motec::import(&bytes).unwrap();
        assert_eq!(imported_meta["session_id"], format!("'{session_id}"));
        assert_eq!(imported_meta["car_name"], format!("'{car_name}"));
        // Negative numeric telemetry values must remain numeric for MoTeC/spreadsheet parsing.
        assert!(csv.contains(",-1.000,"), "negative telemetry altered: {csv}");
    }
    // Idempotence and benign hyphenated car names remain uncorrupted.
    let benign = motec::export(
        &json!({"session_id": "'=already_escaped", "car_name": "Porsche 911 - GT3"}),
        &sample,
    )
    .unwrap();
    let (benign_meta, _) = motec::import(&benign).unwrap();
    assert_eq!(benign_meta["session_id"], "'=already_escaped");
    assert_eq!(benign_meta["car_name"], "Porsche 911 - GT3");
}
