use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
    tuning::{
        evidence::{qualify, EvidenceRequest, QualifiedEvidence},
        measurement,
        workflow::{calculate_workflow, WorkflowRequest},
    },
};
use serde_json::{json, Value};
use std::sync::OnceLock;
fn input(drive: &str) -> Value {
    json!({"schemaVersion":"tuning-workflow-result/v1","goal":"Road","season":"Summer","profile":{"weight":780,"weight_distribution":54,"drivetrain":drive,"maxHp":75,"maxTorque":1,"adjustability":{"gears":6,"gearbox":"Full","suspension":"Race","arb":"Adjustable","diff":"Adjustable"}},"engine":{"engineMaxRpm":8000,"peakPowerRpm":7000,"peakTorqueRpm":5000,"peakTorqueNm":400},"ev":null,"inputSnapshot":{"carId":"1435"}})
}
fn base_capture() -> &'static (Value, Value) {
    static DATA: OnceLock<(Value, Value)> = OnceLock::new();
    DATA.get_or_init(||{
        let fixtures:Value=serde_json::from_str(include_str!("../../tests/fixtures/aego_beetle_engine_captures.json")).unwrap();let original=&fixtures["captures"][0];
        let samples:Vec<Value>=original["samples"].as_array().unwrap().iter().map(|row|Value::Object(fixtures["fields"].as_array().unwrap().iter().zip(row.as_array().unwrap()).map(|(k,v)|(k.as_str().unwrap().into(),v.clone())).collect())).collect();
        let batch=measurement::batch(&json!({"schemaVersion":"engine-batch/v1","carId":"1435","state":measurement::initial("1435"),"samples":samples,"nowMs":30000,"connected":true})).unwrap();
        let observation=json!({"schema":"engine-observation/v1","id":"real-beetle","carId":"1435","source":"measured","capturedAt":1000,"dependencyKey":"pending","data":batch["readySnapshot"]});
        (observation,json!({"schemaVersion":"tuning-capture/v1","metadata":{"carId":"1435"},"samples":samples,"references":{"engineObservationId":"real-beetle"}}))
    })
}
fn ice_evidence(drive: &str) -> Value {
    let (mut observation, mut capture) = base_capture().clone();
    let key = json!(["1435", drive, null, 75, 1]).to_string();
    observation["dependencyKey"] = json!(key);
    capture["references"]["dependencyKey"] = json!(key);
    json!({"kind":"engine-capture","observation":observation,"capture":capture})
}
fn proof(drive: &str) -> &'static QualifiedEvidence {
    static PROOFS: OnceLock<Vec<QualifiedEvidence>> = OnceLock::new();
    let drives = ["AWD", "RWD", "FWD"];
    &PROOFS.get_or_init(|| {
        drives
            .iter()
            .map(|d| {
                qualify(&serde_json::from_value::<EvidenceRequest>(ice_evidence(d)).unwrap())
                    .unwrap()
            })
            .collect()
    })[drives.iter().position(|d| *d == drive).unwrap()]
}
fn calculate(v: Value, drive: &str) -> Value {
    serde_json::to_value(
        proof(drive)
            .calculate(serde_json::from_value(v).unwrap())
            .unwrap(),
    )
    .unwrap()
}
fn call(app: &App, path: &str, body: Value) -> fh6_backend::error::ApiResult<Value> {
    let response = app.request(ApiRequest {
        method: "POST".into(),
        path: path.into(),
        query: Default::default(),
        headers: Default::default(),
        body: serde_json::to_vec(&body).unwrap(),
        upload_filename: None,
    })?;
    Ok(serde_json::from_slice(&response.body).unwrap())
}
fn save_engine(app: &App) {
    let raw = ice_evidence("AWD");
    call(
        app,
        "/api/road/engine-observations",
        json!({"observation":raw["observation"],"capture":raw["capture"]}),
    )
    .unwrap();
}
fn saved_request() -> Value {
    let mut r = input("AWD");
    r["evidence"] = json!({"kind":"saved-engine","observationId":"real-beetle"});
    r
}
fn ev_capture() -> Value {
    let replay: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_taycan_replay.json")).unwrap();
    let goldens: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    let frames: Vec<Value> = replay["runs"][0]["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            Value::Object(
                replay["columns"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .zip(row.as_array().unwrap())
                    .map(|(k, v)| (k.as_str().unwrap().into(), v.clone()))
                    .collect(),
            )
        })
        .collect();
    json!({"kind":"ev-capture","carId":"3445","setup":goldens[0]["input"]["setup"],"frames":frames})
}
#[test]
fn bare_peaks_or_forged_ev_moments_are_never_measured_recommendations() {
    let r: Value = serde_json::to_value(
        calculate_workflow(serde_json::from_value::<WorkflowRequest>(input("AWD")).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(r["readiness"]["measuredEngine"], false);
    assert!(r["recommendation"].is_null());
    assert!(r["gearing"].is_null());
    let fixtures: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    for f in fixtures.as_array().unwrap() {
        let mut r = input("AWD");
        r["profile"]["isElectric"] = json!(true);
        r["ev"] = f["input"].clone();
        let out = calculate_workflow(serde_json::from_value(r).unwrap()).unwrap();
        assert!(!out.readiness.measured_engine);
        assert!(out.recommendation.is_none());
    }
}
#[test]
fn qualified_capture_overrides_client_peaks_and_unsupported_gearing_is_not_ready() {
    let mut r = input("AWD");
    let a = calculate(r.clone(), "AWD");
    assert_eq!(a["readiness"]["gearingAvailable"], true);
    assert_eq!(
        a["recommendation"]["formulaVersion"],
        "rust/ice-measured-workflow-v1"
    );
    r["engine"] = json!({"engineMaxRpm":1,"peakPowerRpm":1,"peakTorqueRpm":1,"peakTorqueNm":1});
    let b = calculate(r.clone(), "AWD");
    assert_eq!(a, b);
    r["profile"]["adjustability"]["gears"] = json!(-1);
    let out = calculate(r, "AWD");
    assert_eq!(out["readiness"]["measuredEngine"], true);
    assert_eq!(out["readiness"]["gearingAvailable"], false);
    assert!(out["recommendation"].is_null());
}
#[test]
fn capability_filter_covers_every_family_and_drive() {
    for drive in ["AWD", "RWD", "FWD"] {
        for suspension in ["Fixed", "Street", "Sport", "Race"] {
            for gearbox in ["Fixed", "FinalDrive", "Full"] {
                let mut r = input(drive);
                r["profile"]["adjustability"]["suspension"] = json!(suspension);
                r["profile"]["adjustability"]["gearbox"] = json!(gearbox);
                let out = calculate(r, drive);
                let f = out["recommendation"]["fields"].as_object().unwrap();
                assert_eq!(f.contains_key("spring.front"), suspension == "Race");
                assert_eq!(f.contains_key("gearing.finalDrive"), gearbox != "Fixed");
                assert_eq!(f.contains_key("gearing.gear1"), gearbox == "Full");
                assert_eq!(f.contains_key("diff.front.acceleration"), drive != "RWD");
                assert_eq!(f.contains_key("diff.rear.acceleration"), drive != "FWD");
                assert_eq!(f.contains_key("diff.center"), drive == "AWD");
            }
        }
    }
}
#[test]
fn persisted_ice_requires_qualified_capture_and_exact_authoritative_result() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    save_engine(&app);
    let result = call(&app, "/api/tuning/workflow", saved_request()).unwrap();
    let road = call(
        &app,
        "/api/road/workflows",
        json!({"identity":{"ordinal":1435,"performanceIndex":400,"drivetrain":2},"carName":"Beetle","event":{"name":"Test","format":"circuit"},"recommendation":result["recommendation"]}),
    );
    assert!(road.is_ok(), "{:?}", road.err());
    let saved = call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":result["recommendation"]}),
    )
    .unwrap();
    assert_eq!(saved["recommendation"], result["recommendation"]);
    let mut bad = result["recommendation"].clone();
    bad["fields"]["gearing.finalDrive"]["value"] = json!(999);
    assert!(call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":bad})
    )
    .is_err());
    let mut altered_peak = result["recommendation"].clone();
    altered_peak["inputSnapshot"]["engineCalculation"]["peakTorque"]["value"] = json!(9999);
    assert!(call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":altered_peak})
    )
    .is_err());
    let recovered = App::new(temp.path()).unwrap();
    assert!(call(
        &recovered,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":result["recommendation"]})
    )
    .is_ok());
    let mut bad = saved_request();
    bad["profile"]["maxHp"] = json!(900);
    assert!(call(&app, "/api/tuning/workflow", bad).is_err());
    let mut wrong_car = saved_request();
    wrong_car["inputSnapshot"]["carId"] = json!("2");
    assert!(call(&app, "/api/tuning/workflow", wrong_car).is_err());
    let mut raw = ice_evidence("AWD");
    raw["capture"]["samples"] = json!([raw["capture"]["samples"][0]]);
    assert!(qualify(&serde_json::from_value(raw).unwrap()).is_err());
    let mut forged = result["recommendation"].clone();
    forged["inputSnapshot"]["evidenceId"] = Value::Null;
    assert!(call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":forged})
    )
    .is_err());
}
#[test]
fn ev_persistence_replays_frames_and_locked_ratios_remain_unapplied() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let mut raw = ev_capture();
    raw["setup"]["finalDriveAdjustable"] = json!(false);
    raw["setup"]["gearAdjustable"] = json!([false, false]);
    let proof = call(&app, "/api/tuning/ev-evidence", raw.clone()).unwrap();
    let mut r = input("AWD");
    r["profile"]["isElectric"] = json!(true);
    r["profile"]["evGearbox"] = raw["setup"].clone();
    r["inputSnapshot"]["carId"] = json!("3445");
    r["evidence"] = json!({"kind":"saved-ev","evidenceId":proof["evidenceId"]});
    let result = call(&app, "/api/tuning/workflow", r).unwrap();
    let road = call(
        &app,
        "/api/road/workflows",
        json!({"identity":{"ordinal":3445,"performanceIndex":795,"drivetrain":2},"carName":"Taycan","event":{"name":"Test","format":"circuit"},"recommendation":result["recommendation"]}),
    );
    assert!(road.is_ok(), "{:?}", road.err());
    let fields = result["recommendation"]["fields"].as_object().unwrap();
    assert!(!fields.keys().any(|k| k.starts_with("gearing.")));
    assert!(call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":result["recommendation"]})
    )
    .is_ok());
    raw["frames"] = json!([raw["frames"][0]]);
    assert!(call(&app, "/api/tuning/ev-evidence", raw).is_err());
    assert!(call(
        &app,
        "/api/tuning/ev-gearing",
        json!({"measurements":[],"setup":{}})
    )
    .is_err());
}
#[test]
fn mcp_and_offline_cli_use_same_qualified_owner() {
    use fh6_backend::mcp::McpServer;
    use std::process::Command;
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    save_engine(&app);
    let request = saved_request();
    let expected = call(&app, "/api/tuning/workflow", request.clone()).unwrap();
    let mcp=McpServer::default().handle(&app,&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tuning_workflow","arguments":request}})).unwrap().unwrap();
    let out: Value =
        serde_json::from_str(mcp["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(out, expected);
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
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        expected
    );
}

#[test]
fn offline_capture_file_needs_no_backend_or_existing_database() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("workflow.json");
    let mut request = input("AWD");
    request["evidence"] = ice_evidence("AWD");
    std::fs::write(&file, serde_json::to_vec(&request).unwrap()).unwrap();
    let absent = temp.path().join("no-database");
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fh6-agent"))
        .args([
            "solve",
            "workflow",
            "--args-file",
            file.to_str().unwrap(),
            "--data-dir",
            absent.to_str().unwrap(),
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
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["readiness"]["measuredEngine"], true);
    assert!(!result["recommendation"].is_null());
    assert_eq!(
        result["recommendation"]["inputSnapshot"]["evidenceSource"],
        "imported-capture"
    );
    assert!(!absent.exists());
}

#[test]
fn mcp_cold_evidence_analysis_does_not_mutate_saved_state() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    save_engine(&app);
    let before = app
        .tuning_evidence
        .store
        .list(None, Some("tuning-evidence/v1"), false)
        .unwrap();
    assert!(before.is_empty());
    let response=fh6_backend::mcp::McpServer::default().handle(&app,&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tuning_workflow","arguments":saved_request()}})).unwrap().unwrap();
    let result: Value =
        serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(result["readiness"]["measuredEngine"], true);
    assert!(result["recommendation"]["inputSnapshot"]["evidenceId"].is_null());
    assert_eq!(
        app.tuning_evidence
            .store
            .list(None, Some("tuning-evidence/v1"), false)
            .unwrap(),
        before
    );
}
