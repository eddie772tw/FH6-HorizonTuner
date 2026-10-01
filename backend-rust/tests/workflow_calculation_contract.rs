use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
    tuning::workflow::{calculate_workflow, WorkflowRequest},
};
use serde_json::{json, Value};
fn input() -> Value {
    json!({"schemaVersion":"tuning-workflow-result/v1","goal":"Road","season":"Summer",
      "profile":{"weight":1400,"weight_distribution":54,"drivetrain":"AWD","maxHp":300,"maxTorque":1,
        "adjustability":{"gears":6,"gearbox":"Full","suspension":"Race","arb":"Adjustable","diff":"Adjustable"}},
      "engine":{"engineMaxRpm":8000,"peakPowerRpm":7000,"peakTorqueRpm":5000,"peakTorqueNm":400},
      "ev":null,"inputSnapshot":{"carId":"1","engineObservation":{"id":"frozen","capture":{"samples":[1,2,3]}}}})
}
fn calculate(v: Value) -> Value {
    serde_json::to_value(
        calculate_workflow(serde_json::from_value::<WorkflowRequest>(v).unwrap()).unwrap(),
    )
    .unwrap()
}
#[test]
fn measured_torque_and_unsupported_gearing_have_one_readiness_owner() {
    let mut request = input();
    let result = calculate(request.clone());
    assert_eq!(result["readiness"]["gearingAvailable"], true);
    assert_eq!(
        result["recommendation"]["formulaVersion"],
        "rust/ice-measured-workflow-v1"
    );
    assert!(
        result["recommendation"]["inputSnapshot"]["engineObservation"]
            .get("capture")
            .is_none()
    );
    request["engine"]["peakTorqueNm"] = json!(1);
    let unsupported = calculate(request.clone());
    assert_eq!(unsupported["gearing"]["unsupported"], true);
    assert_eq!(unsupported["readiness"]["gearingAvailable"], false);
    assert!(unsupported["recommendation"].is_null());
    request["engine"] = Value::Null;
    let missing = calculate(request);
    assert_eq!(missing["readiness"]["measuredEngine"], false);
    assert!(missing["gearing"].is_null());
}
#[test]
fn capability_filter_covers_every_family_and_drive() {
    for drive in ["AWD", "RWD", "FWD"] {
        for suspension in ["Fixed", "Street", "Sport", "Race"] {
            for gearbox in ["Fixed", "FinalDrive", "Full"] {
                let mut request = input();
                request["profile"]["drivetrain"] = json!(drive);
                request["profile"]["adjustability"]["suspension"] = json!(suspension);
                request["profile"]["adjustability"]["gearbox"] = json!(gearbox);
                request["profile"]["adjustability"]["arb"] = json!("Fixed");
                request["profile"]["adjustability"]["diff"] = json!("Fixed");
                let result = calculate(request);
                let fields = result["recommendation"]["fields"].as_object().unwrap();
                assert!(fields.contains_key("pressure.front"));
                for family in [
                    "spring", "height", "rebound", "bump", "camber", "toe", "caster",
                ] {
                    assert_eq!(
                        fields.contains_key(&format!("{family}.front")),
                        suspension == "Race"
                    );
                }
                assert!(!fields
                    .keys()
                    .any(|k| k.starts_with("arb.") || k.starts_with("diff.")));
                assert_eq!(
                    fields.contains_key("gearing.finalDrive"),
                    gearbox != "Fixed"
                );
                assert_eq!(fields.contains_key("gearing.gear1"), gearbox == "Full");
            }
        }
    }
}
#[test]
fn unavailable_ev_never_uses_ice_and_locked_ratios_stay_unapplied() {
    let mut request = input();
    request["profile"]["isElectric"] = json!(true);
    let unavailable = calculate(request.clone());
    assert!(unavailable["gearing"].is_null());
    assert_eq!(unavailable["readiness"]["gearingAvailable"], false);
    let fixtures: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    for fixture in fixtures.as_array().unwrap() {
        request["ev"] = fixture["input"].clone();
        let result = calculate(request.clone());
        if result["gearing"].is_null() {
            assert!(result["recommendation"].is_null());
            continue;
        }
        let g = &result["gearing"];
        let fields = result["recommendation"]["fields"].as_object().unwrap();
        if g["finalDrive"].is_null() || g["adjustability"]["finalDrive"] == false {
            assert!(!fields.contains_key("gearing.finalDrive"));
        }
        for (i, ratio) in g["gears"].as_array().unwrap().iter().enumerate() {
            if ratio.is_null() || g["adjustability"]["gears"][i] == false {
                assert!(!fields.contains_key(&format!("gearing.gear{}", i + 1)));
            }
        }
    }
}
#[test]
fn transport_and_persistence_retain_versioned_result() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let call = |path: &str, body: Value| {
        app.request(ApiRequest {
            method: "POST".into(),
            path: path.into(),
            query: Default::default(),
            headers: Default::default(),
            body: serde_json::to_vec(&body).unwrap(),
            upload_filename: None,
        })
    };
    let bins: Vec<_> = (0..8).map(|index| json!({"index":index,"sampleCount":10,"averageRpm":3000.0,"averagePowerWatts":200000.0,"averageTorqueNewtons":400.0,"rpmSum":30000.0,"powerWattsSum":2000000.0,"torqueNewtonsSum":4000.0})).collect();
    let observation = json!({"schema":"engine-observation/v1","id":"engine-1","carId":"1","source":"measured","capturedAt":1000,"dependencyKey":"k","data":{"carId":"1","status":"ready","engineMaxRpm":8000,"acceptedMs":6000,"identity":{"ordinal":1,"performanceIndex":700,"carClass":3},"bins":bins}});
    call("/api/road/engine-observations",json!({"observation":observation,"capture":{"schemaVersion":"tuning-capture/v1","metadata":{"carId":"1"},"references":{"engineObservationId":"engine-1","dependencyKey":"k"},"samples":[{"carOrdinal":"1","engineMaxRpm":8000,"powerWatts":200000,"torqueNewtons":400}]}})).unwrap();
    let mut request = input();
    request["inputSnapshot"] = json!({"carId":"1","engineObservation":observation});
    let response = call("/api/tuning/workflow", request).unwrap();
    let result: Value = serde_json::from_slice(&response.body).unwrap();
    let saved = call(
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":result["recommendation"]}),
    )
    .unwrap();
    let saved: Value = serde_json::from_slice(&saved.body).unwrap();
    assert_eq!(saved["recommendation"], result["recommendation"]);
    let mut unknown = input();
    unknown["schemaVersion"] = json!("unknown/v1");
    assert!(call("/api/tuning/workflow", unknown).is_err());
}

#[test]
fn mcp_and_offline_cli_use_the_same_workflow_owner() {
    use fh6_backend::mcp::McpServer;
    use std::process::Command;
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let request = input();
    let expected = calculate(request.clone());
    let result=McpServer::default().handle(&app,&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tuning_workflow","arguments":request}})).unwrap().unwrap();
    let text = result["result"]["content"][0]["text"].as_str().unwrap();
    let mcp: Value = serde_json::from_str(text).unwrap();
    assert_eq!(mcp, expected);
    let output = Command::new(env!("CARGO_BIN_EXE_fh6-agent"))
        .args([
            "solve",
            "workflow",
            "--args",
            &request.to_string(),
            "--data-dir",
            temp.path().to_str().unwrap(),
            "--backend-url",
            "http://127.0.0.1:1",
            "--json",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let cli: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(cli, expected);
}

#[test]
fn ev_recommendation_persists_with_bounded_ev_evidence_and_rejects_edits() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let fixtures: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    let ev = fixtures[0]["input"].clone();
    let mut request = input();
    request["profile"]["isElectric"] = json!(true);
    request["profile"]["evGearbox"] = ev["setup"].clone();
    request["ev"] = ev.clone();
    let initial = calculate(request.clone());
    request["inputSnapshot"] = json!({"carId":"1","goal":"Road","season":"Summer","profile":request["profile"],"evResult":initial["gearing"],"evMeasurement":{"status":"collecting","frameCount":1000,"identity":{"ordinal":1,"performanceIndex":700,"carClass":3},"gears":ev["measurements"]}});
    let result = calculate(request);
    let call = |recommendation: Value| {
        app.request(ApiRequest {
            method: "POST".into(),
            path: "/api/road/compatibility".into(),
            query: Default::default(),
            headers: Default::default(),
            body: serde_json::to_vec(&json!({"discipline":"Drag","recommendation":recommendation}))
                .unwrap(),
            upload_filename: None,
        })
    };
    let saved = call(result["recommendation"].clone());
    assert!(saved.is_ok(), "{:?}", saved.err());
    let mut edited = result["recommendation"].clone();
    edited["fields"]["pressure.front"]["value"] = json!(100);
    assert!(call(edited).is_err());
    let mut wrong_car = result["recommendation"].clone();
    wrong_car["inputSnapshot"]["carId"] = json!("2");
    assert!(call(wrong_car).is_err());
}

#[test]
fn invalid_measured_inputs_never_report_ready() {
    for key in [
        "engineMaxRpm",
        "peakPowerRpm",
        "peakTorqueRpm",
        "peakTorqueNm",
    ] {
        let mut request = input();
        request["engine"][key] = json!(0);
        let result = calculate(request);
        assert_eq!(result["readiness"]["measuredEngine"], false);
        assert!(result["recommendation"].is_null());
    }
}
