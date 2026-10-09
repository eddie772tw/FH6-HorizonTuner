use fh6_backend::tuning::measurement::{advance, analyze, initial, readiness};
use serde_json::{json, Value};
#[test]
fn real_engine_capture_qualification_ignores_unreliable_race_flag() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_beetle_engine_captures.json"
    ))
    .unwrap();
    let capture = &fixture["captures"][0];
    let mut enabled = initial(capture["carId"].as_str().unwrap());
    let mut disabled = enabled.clone();
    for row in capture["samples"].as_array().unwrap() {
        let mut frame = Value::Object(
            fixture["fields"]
                .as_array()
                .unwrap()
                .iter()
                .zip(row.as_array().unwrap())
                .map(|(k, v)| (k.as_str().unwrap().to_owned(), v.clone()))
                .collect(),
        );
        frame = fh6_backend::tuning::measurement::capture_frame(&frame);
        let now = frame["TimestampMS"].as_f64().unwrap();
        frame["IsRaceOn"] = json!(1);
        enabled = advance(&enabled, &frame, true, now);
        frame["IsRaceOn"] = json!(0);
        disabled = advance(&disabled, &frame, true, now);
    }
    assert!(enabled["acceptedMs"].as_f64().unwrap() > 0.0);
    for key in ["acceptedMs", "bins", "status", "guidance", "identity"] {
        assert_eq!(disabled[key], enabled[key], "{key}");
    }
}
#[test]
fn frozen_real_captures_match_desktop_v4_analysis() {
    let captures: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_beetle_engine_captures.json"
    ))
    .unwrap();
    let expected: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/engine_desktop_v162_summaries.json"
    ))
    .unwrap();
    for (capture, expected) in captures["captures"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected.as_array().unwrap())
    {
        let samples: Vec<Value> = capture["samples"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| {
                Value::Object(
                    captures["fields"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .zip(row.as_array().unwrap())
                        .map(|(key, value)| (key.as_str().unwrap().to_owned(), value.clone()))
                        .collect(),
                )
            })
            .collect();
        let result = analyze(
            &json!({"observationId":capture["observationId"],"carId":capture["carId"],"capture":{"samples":samples}}),
        );
        let expected = &expected["expected"];
        for field in ["status", "reason", "analysisVersion", "observationId"] {
            assert_eq!(result[field], expected[field]);
        }
        for field in ["acceptedMs", "engineMaxRpm", "effectiveRedline"] {
            assert_eq!(result[field].as_f64(), expected[field].as_f64(), "{field}");
        }
        for peak in ["peakPower", "peakTorque"] {
            for field in ["rpm", "value"] {
                let a = result[peak][field].as_f64().unwrap();
                let b = expected[peak][field].as_f64().unwrap();
                assert!((a - b).abs() < 1e-9, "{peak}.{field}: {a} != {b}");
            }
        }
    }
}
#[test]
fn missing_motion_never_qualifies_and_identity_change_blocks() {
    let mut state = initial("1435");
    let mut frame = json!({"TimestampMS":0,"IsRaceOn":1,"CarOrdinal":1435,"CarClass":0,"CarPerformanceIndex":400,"EngineMaxRpm":6000,"CurrentEngineRpm":2000,"Gear":2,"PowerWatts":40000,"TorqueNewtons":150,"AccelInput":255,"BrakeInput":0,"ClutchInput":0,"HandBrakeInput":0});
    for i in 0..100 {
        frame["TimestampMS"] = json!(i * 200);
        state = advance(&state, &frame, true, (i * 200) as f64);
    }
    assert_eq!(state["acceptedMs"].as_f64(), Some(0.0));
    assert_eq!(readiness(&state, 19800.0)["ready"], false);
    frame["CarPerformanceIndex"] = json!(500);
    state = advance(&state, &frame, true, 20000.0);
    assert_eq!(state["status"], "blocked");
    assert_eq!(
        analyze(&json!({"carId":"1435","observationId":"old"}))["status"],
        "unavailable"
    );
}

#[test]
fn frozen_archive_qualification_retains_history_without_capture_payload() {
    use fh6_backend::tuning::measurement::parse_archive;
    let bins:Vec<_>=(0..9).map(|i|serde_json::json!({"index":i+6,"sampleCount":10,"averageRpm":3000+i*500,"averagePowerWatts":200000,"averageTorqueNewtons":400,"rpmSum":(3000+i*500)*10,"powerWattsSum":2000000,"torqueNewtonsSum":4000})).collect();
    let mut item = serde_json::json!({"schema":"engine-observation/v1","id":"saved-scan","carId":"42","source":"measured","capturedAt":1000,"dependencyKey":"k","data":{"carId":"42","status":"ready","guidance":"ready","acceptedMs":6500,"engineMaxRpm":8000,"identity":{"ordinal":42,"carClass":3,"performanceIndex":700},"lowestRpm":3000,"highestRpm":7500,"observedPeakPower":{"rpm":7000,"value":200000},"observedPeakTorque":{"rpm":5000,"value":400},"bins":bins}});
    let expected = serde_json::json!([item.clone()]);
    item["capture"] = serde_json::json!({"samples":[{}]});
    assert_eq!(parse_archive(&serde_json::json!([item.clone()])), expected);
    item["data"]["identity"]["ordinal"] = serde_json::json!(43);
    assert_eq!(
        parse_archive(&serde_json::json!([item])),
        serde_json::json!([])
    );
    assert_eq!(
        parse_archive(&serde_json::Value::Null),
        serde_json::json!([])
    );
}
