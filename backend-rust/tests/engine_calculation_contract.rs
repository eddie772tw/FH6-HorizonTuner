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

#[test]
fn measurement_hotpath_preserves_early_rejections_and_peaks_edge_cases() {
    use fh6_backend::tuning::measurement::{batch, capture_frame, peaks};
    let edge_bins = json!([
        {"index": -1.0, "sampleCount": 3, "averagePowerWatts": 100.0, "averageTorqueNewtons": 200.0, "averageRpm": 1000.0},
        {"index": 0.0, "sampleCount": 4, "averagePowerWatts": 150.0, "averageTorqueNewtons": 250.0, "averageRpm": 1500.0},
        {"index": 64.0, "sampleCount": 5, "averagePowerWatts": 300.0, "averageTorqueNewtons": 350.0, "averageRpm": 7000.0}
    ]);
    let edge_peaks = peaks(&edge_bins);
    assert_eq!(edge_peaks["power"]["value"].as_f64(), Some(150.0));
    assert_eq!(edge_peaks["power"]["rpm"].as_f64(), Some(1500.0));
    let sample = |ts: f64, rl: f64| json!({"timestampMS":ts,"isRaceOn":1,"carOrdinal":1435,"carClass":0,"performanceIndex":400,"engineMaxRpm":rl,"rpm":3000.0,"speedMps":25.0,"gear":2,"powerWatts":100000.0,"torqueNewtons":300.0,"accelInput":255,"brakeInput":0,"clutchInput":0,"handBrakeInput":0,"tireSlipRatio":[0.0,0.0,0.0,0.0]});
    let s1 = advance(
        &initial("1435"),
        &capture_frame(&sample(1000.0, 6000.0)),
        true,
        1000.0,
    );
    let stalled = advance(&s1, &capture_frame(&sample(1000.0, 6000.0)), true, 1016.0);
    assert_eq!(
        (&stalled["guidance"], &stalled["lastTimestampMs"]),
        (&json!("timestamp-stalled"), &s1["lastTimestampMs"])
    );
    let regressed = advance(&s1, &capture_frame(&sample(500.0, 6000.0)), true, 1016.0);
    assert_eq!(
        (&regressed["status"], &regressed["guidance"]),
        (&json!("blocked"), &json!("timestamp-regressed"))
    );
    let redline_changed = advance(&s1, &capture_frame(&sample(1016.0, 7000.0)), true, 1016.0);
    assert_eq!(
        (
            &redline_changed["guidance"],
            &redline_changed["engineMaxRpm"]
        ),
        (&json!("identity-changed"), &s1["engineMaxRpm"])
    );
    let b = batch(&json!({"schemaVersion":"engine-batch/v1","carId":"1435","state":initial("1435"),"samples":[sample(1000.0,6000.0),sample(1600.0,6000.0),sample(1616.0,6000.0)],"nowMs":1616.0,"connected":true})).unwrap();
    assert_eq!(b["state"]["rpmEvidenceBins"].as_array().unwrap().len(), 1);
    assert_eq!(b["state"]["bins"].as_array().unwrap().len(), 1);
}
