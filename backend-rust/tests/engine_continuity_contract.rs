use fh6_backend::tuning::measurement::{analyze, batch};
use serde_json::{json, Value};

fn samples() -> Vec<Value> {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_beetle_engine_captures.json"
    ))
    .unwrap();
    fixture["captures"][0]["samples"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            Value::Object(
                fixture["fields"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .zip(row.as_array().unwrap())
                    .map(|(key, value)| (key.as_str().unwrap().to_owned(), value.clone()))
                    .collect(),
            )
        })
        .collect()
}

fn run(samples: &[Value], state: Value, recover: bool) -> Value {
    let mut input = json!({"schemaVersion":"engine-batch/v1", "carId":"1435",
        "samples":samples, "state":state, "connected":true,"nowMs":100000});
    if recover {
        input["recoveryPolicy"] = json!("same-build-new-segment/v1");
    }
    batch(&input).unwrap()
}

#[test]
fn two_same_build_clock_resets_recover_and_saved_segment_replays_identically() {
    let recorded = samples();
    let mut idle = recorded[0].clone();
    idle["timestampMS"] = json!(60000);
    idle["accelInput"] = json!(0);
    let before = run(&[idle.clone()], Value::Null, true);
    assert_eq!(before["state"]["acceptedMs"], 0);
    let mut first_reset = idle.clone();
    first_reset["timestampMS"] = json!(30000);
    let mut input = vec![first_reset, idle];
    input.extend(recorded.clone());
    let strict = run(&input, before["state"].clone(), false);
    assert_eq!(strict["state"]["guidance"], "timestamp-regressed");
    assert!(strict.get("continuity").is_none());
    let live = run(&input, before["state"].clone(), true);
    assert_eq!(live["readiness"]["ready"], true);
    assert_eq!(live["readyReadiness"]["ready"], true);
    assert_eq!(live["continuity"]["restartCount"], 2);
    assert_eq!(live["continuity"]["segmentStartIndex"], 2);
    let end = live["continuity"]["readySampleEndIndex"].as_u64().unwrap() as usize;
    let replay = analyze(&json!({"carId":"1435", "observationId":"new-segment",
        "capture":{"samples":&input[2..end]}, "expected":live["readySnapshot"]}));
    assert_eq!(replay["status"], "ready");
    assert_eq!(replay["acceptedMs"], live["readySnapshot"]["acceptedMs"]);
    assert_eq!(
        replay["engineMaxRpm"],
        live["readySnapshot"]["engineMaxRpm"]
    );
}

#[test]
fn completed_segment_is_returned_separately_when_a_later_segment_is_incomplete() {
    let mut input = samples();
    let ready_length = input.len();
    let mut reset = input[0].clone();
    reset["accelInput"] = json!(0);
    input.push(reset);
    let live = run(&input, Value::Null, true);
    assert_eq!(live["state"]["acceptedMs"], 0);
    assert_eq!(live["continuity"]["segmentStartIndex"], ready_length);
    assert!(live["readySnapshot"].is_null());
    let retained = &live["continuity"]["retainedSnapshot"];
    assert_eq!(retained["state"]["status"], "ready");
    assert_eq!(retained["readiness"]["ready"], true);
    assert_eq!(retained["sampleEndIndex"], ready_length);
}

#[test]
fn monotonic_disconnect_recovers_but_changed_build_and_strict_block_do_not() {
    let mut frame = samples()[0].clone();
    frame["timestampMS"] = json!(60000);
    let before = run(&[frame.clone()], Value::Null, true);
    let disconnected = batch(&json!({"schemaVersion":"engine-batch/v1", "carId":"1435",
        "state":before["state"],"samples":[],"connected":false,"nowMs":105000,
        "recoveryPolicy":"same-build-new-segment/v1"}))
    .unwrap();
    frame["timestampMS"] = json!(61000);
    let resumed = run(&[frame.clone()], disconnected["state"].clone(), true);
    assert_eq!(resumed["continuity"]["restartCount"], 0);
    assert_ne!(resumed["state"]["status"], "blocked");
    frame["timestampMS"] = json!(0);
    frame["performanceIndex"] = json!(401);
    let changed = run(&[frame.clone()], before["state"].clone(), true);
    assert_eq!(changed["state"]["guidance"], "identity-changed");
    assert_eq!(changed["continuity"]["restartCount"], 0);
    frame["performanceIndex"] = json!(400);
    let blocked = run(&[frame.clone()], before["state"].clone(), false);
    assert_eq!(
        run(&[frame], blocked["state"].clone(), true)["state"]["status"],
        "blocked"
    );
    assert!(batch(&json!({"schemaVersion":"engine-batch/v1","recoveryPolicy":"future"})).is_err());
}
