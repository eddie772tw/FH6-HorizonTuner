//! Synthetic contract fixtures only: no real CVT vehicle or solver calibration.
use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
    tuning::{
        self, cvt,
        workflow::{calculate_workflow, WorkflowRequest},
    },
};
use serde_json::{json, Value};

fn synthetic() -> Value {
    let identity = json!({"ordinal":42,"performanceIndex":500,"carClass":2});
    let sourced =
        |value| json!({"value":value,"source":"measurement","reference":"synthetic-fixture-only"});
    let transmission = json!({"type":"cvt","capability":"final-drive-only"});
    let config = json!({"id":"synthetic-config","source":"game-visible","reference":"synthetic-fixture-only","installedParts":"synthetic-only",
        "finalDrive":sourced(3.0),"finalDriveMinimum":sourced(2.0),"finalDriveMaximum":sourced(4.0),"tireCircumferenceM":sourced(2.0),"ratioMinimum":sourced(0.7),"ratioMaximum":sourced(2.1)});
    let frames: Vec<_> = (0..=60).map(|i|json!({"timestampMs":(i*20) as f64,"identity":identity,"configurationId":"synthetic-config",
        "speedMps":10.0+i as f64*0.1,"engineRpm":6000.0,"throttle":255.0,"brake":0.0,"clutch":0.0,"handbrake":0.0,
        "normalizedSlip":[0.0,0.0,0.0,0.0],"gear":1,"isRaceOn":true})).collect();
    json!({"schemaVersion":"tuning-workflow-result/v1","goal":"Road","season":"Summer",
        "profile":{"weight":1200,"weight_distribution":50,"maxHp":250,"isElectric":false,"transmission":transmission,"adjustability":{"gears":6,"gearbox":"Full"}},
        "engine":{"engineMaxRpm":8000,"peakPowerRpm":7000,"peakTorqueRpm":6000},"ev":null,
        "inputSnapshot":{"carId":"42","identity":identity,"cvtConfiguration":config},
        "evidence":{"kind":"cvt-capture","capture":{"schemaVersion":"cvt-capture/v1","carId":"42","identity":identity,"transmission":transmission,
            "configuration":config,"provenance":{"source":"session-replay","reference":"synthetic-fixture-only","capturedAt":null,"gameBuild":null,"recorderVersion":null},
            "units":{"timestamp":"ms","speed":"m/s","rpm":"rpm","controls":"byte","slip":"normalized-ratio"},"frames":frames}}})
}
fn run(v: Value) -> Value {
    serde_json::to_value(
        calculate_workflow(serde_json::from_value::<WorkflowRequest>(v).unwrap()).unwrap(),
    )
    .unwrap()
}
fn has(out: &Value, code: &str) -> bool {
    out["cvt"]["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == code)
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
#[test]
fn qualified_hygiene_never_claims_a_solver_or_applicable_result() {
    for goal in ["Road", "Drag", "Drift", "Rally", "DangerSign"] {
        let mut v = synthetic();
        v["goal"] = json!(goal);
        let out = run(v);
        assert_eq!(out["cvt"]["captureStatus"], "qualified");
        assert_eq!(out["cvt"]["acceptedSampleCount"], 61);
        assert_eq!(out["cvt"]["longestContinuousMs"], 1200.0);
        assert_eq!(out["cvt"]["status"], "unsupported");
        assert!(out["cvt"]["ratioPreview"].is_null());
        assert!(out["recommendation"].is_null() && out["gearing"].is_null());
        assert_eq!(out["readiness"]["gearingAvailable"], false);
        assert_eq!(out["readiness"]["measuredEngine"], false);
        assert!(has(&out, "solver-not-implemented"));
    }
}
#[test]
fn explicit_mode_and_capabilities_cannot_enter_ice_or_ev_models() {
    for (cap, code) in [
        ("unknown", "capability-unknown"),
        ("fixed", "transmission-locked"),
        ("simulated-gears", "simulated-gears-not-supported"),
    ] {
        let mut v = synthetic();
        v["profile"]["transmission"]["capability"] = json!(cap);
        assert!(has(&run(v), code));
    }
    let mut v = synthetic();
    v["profile"]["isElectric"] = json!(true);
    assert!(has(&run(v), "powertrain-transmission-combination"));
    let profile: tuning::TuningCarParams =
        serde_json::from_value(synthetic()["profile"].clone()).unwrap();
    let old = tuning::calculate_aego_gearing(tuning::RaceGoal::Road, 6, &profile, 8000.0, None);
    assert_eq!(old.unsupported, Some(true));
    assert!(old.gears.is_empty());
    let dev = tuning::developer::calculate(
        &json!({"car":synthetic()["profile"],"raceGoal":"Road","surface":"tarmac"}),
    )
    .unwrap();
    assert_eq!(dev["gearing"]["unsupported"], true);
    let capability = tuning::capabilities::contract(&synthetic()["profile"]);
    assert!(capability["controls"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["section"] == "gearing")
        .all(|c| c["unlocked"] == false));
}
#[test]
fn missing_unknown_sources_and_wrong_modes_are_diagnosed_without_defaults() {
    let mut v = synthetic();
    v.as_object_mut().unwrap().remove("evidence");
    assert!(has(&run(v), "raw-capture-required"));
    for field in [
        "finalDrive",
        "finalDriveMinimum",
        "finalDriveMaximum",
        "tireCircumferenceM",
        "ratioMinimum",
        "ratioMaximum",
    ] {
        let mut v = synthetic();
        v["evidence"]["capture"]["configuration"][field] = Value::Null;
        assert!(has(&run(v), "value-missing"));
        let mut v = synthetic();
        v["evidence"]["capture"]["configuration"][field]["source"] = json!("unknown");
        assert!(has(&run(v), "source-unknown"));
    }
    let mut v = synthetic();
    v["evidence"] = json!({"kind":"saved-engine","observationId":"old"});
    assert!(has(&run(v), "evidence-mode-mismatch"));
    let mut v = synthetic();
    v["profile"].as_object_mut().unwrap().remove("transmission");
    assert!(calculate_workflow(serde_json::from_value(v).unwrap()).is_err());
}
#[test]
fn units_non_finite_invalid_channels_and_limits_fail_closed() {
    for (field, bad) in [
        ("timestamp", "s"),
        ("speed", "km/h"),
        ("controls", "percent"),
        ("slip", "physical-slip"),
    ] {
        let mut v = synthetic();
        v["evidence"]["capture"]["units"][field] = json!(bad);
        assert!(has(&run(v), "units-mismatch"));
    }
    for bad in [
        json!(-1),
        json!("Infinity"),
        json!(f64::NAN),
        json!(f64::INFINITY),
    ] {
        let mut v = synthetic();
        v["evidence"]["capture"]["frames"][0]["speedMps"] = bad;
        assert_ne!(run(v)["cvt"]["captureStatus"], "qualified");
    }
    let mut v = synthetic();
    v["evidence"]["capture"]["configuration"]["ratioMinimum"]["value"] = json!(3.0);
    assert!(has(&run(v), "ratio-limits-invalid"));
    let mut v = synthetic();
    v["evidence"]["capture"]["frames"][0]["throttle"] = json!(256);
    assert!(has(&run(v), "channel-invalid"));
    let mut v = synthetic();
    v["evidence"]["capture"]["schemaVersion"] = json!("cvt-capture/v99");
    assert!(has(&run(v), "capture-version-unsupported"));
}
#[test]
fn continuity_identity_and_configuration_changes_are_not_combined() {
    for t in [json!(100), json!(0), json!(2000)] {
        let mut v = synthetic();
        v["evidence"]["capture"]["frames"][30]["timestampMs"] = t;
        assert_eq!(run(v)["cvt"]["captureStatus"], "invalid");
    }
    for field in ["ordinal", "performanceIndex", "carClass"] {
        let mut v = synthetic();
        v["evidence"]["capture"]["frames"][30]["identity"][field] = json!(9);
        assert!(has(&run(v), "frame-identity-changed"));
        let mut v = synthetic();
        v["inputSnapshot"]["identity"][field] = json!(9);
        assert!(has(&run(v), "identity-changed"));
    }
    let mut v = synthetic();
    v["evidence"]["capture"]["frames"][30]["configurationId"] = json!("changed");
    assert!(has(&run(v), "frame-configuration-changed"));
    let mut v = synthetic();
    v["inputSnapshot"]["cvtConfiguration"]["finalDrive"]["value"] = json!(4.0);
    assert!(has(&run(v), "configuration-changed"));
    for (field, value) in [
        ("speedMps", json!(0.1)),
        ("brake", json!(1)),
        ("clutch", json!(1)),
        ("handbrake", json!(1)),
        ("throttle", json!(100)),
        ("normalizedSlip", json!([0, 0, 1, 0])),
        ("engineRpm", json!(3000)),
        ("gear", json!(2)),
        ("isRaceOn", json!(false)),
    ] {
        let mut v = synthetic();
        v["evidence"]["capture"]["frames"][30][field] = value;
        assert!(has(&run(v), "continuous-loaded-window-required"), "{field}");
    }
}
#[test]
fn raw_capture_round_trip_preserves_unknown_metadata_and_replays_at_every_entry() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let request = synthetic();
    let capture: cvt::Capture =
        serde_json::from_value(request["evidence"]["capture"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(capture).unwrap(),
        request["evidence"]["capture"]
    );
    let expected = call(&app, "/api/tuning/workflow", request.clone()).unwrap();
    let saved = call(&app, "/api/tuning/cvt-evidence", request.clone()).unwrap();
    let archived = app
        .tuning_evidence
        .store
        .get(
            saved["evidenceId"].as_str().unwrap(),
            Some("cvt-evidence/v1"),
            None,
        )
        .unwrap();
    assert_eq!(archived["capture"], request["evidence"]["capture"]);
    for field in ["capturedAt", "gameBuild", "recorderVersion"] {
        assert!(archived["capture"]["provenance"][field].is_null());
    }
    let mut request = request;
    request["evidence"] = json!({"kind":"saved-cvt","evidenceId":saved["evidenceId"]});
    assert_eq!(
        call(&app, "/api/tuning/workflow", request.clone()).unwrap(),
        expected
    );
    let mcp=fh6_backend::mcp::McpServer::default().handle(&app,&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tuning_workflow","arguments":request}})).unwrap().unwrap();
    let out: Value =
        serde_json::from_str(mcp["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(out, expected);
    let file = temp.path().join("request.json");
    std::fs::write(&file, request.to_string()).unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fh6-agent"))
        .args([
            "solve",
            "workflow",
            "--args-file",
            file.to_str().unwrap(),
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
    let out: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(out, expected);
    request["inputSnapshot"]["identity"]["performanceIndex"] = json!(501);
    assert!(has(
        &call(&app, "/api/tuning/workflow", request).unwrap(),
        "identity-changed"
    ));
}
#[test]
fn legacy_profiles_are_not_inferred_from_names_or_gear_count() {
    for electric in [false, true] {
        for gears in [1, 2, 6] {
            let profile =
                json!({"isElectric":electric,"carName":"CVT","adjustability":{"gears":gears}});
            assert!(!cvt::selected(&profile));
            let normalized = tuning::profile::normalize(&profile);
            assert!(normalized.get("transmission").is_none());
            let params: tuning::TuningCarParams = serde_json::from_value(profile).unwrap();
            assert!(serde_json::to_value(params)
                .unwrap()
                .get("transmission")
                .is_none());
        }
    }
    let normalized = tuning::profile::normalize(&synthetic()["profile"]);
    assert_eq!(
        normalized["transmission"],
        synthetic()["profile"]["transmission"]
    );
}
