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
    // Frozen actual desktop projection: the React hook test verifies every replay frame.
    let channels: Vec<String> = serde_json::from_str(include_str!(
        "../../tests/fixtures/ev_desktop_transport_channels.json"
    ))
    .unwrap();
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
                    .filter(|(k, _)| {
                        channels
                            .iter()
                            .any(|channel| Some(channel.as_str()) == k.as_str())
                    })
                    .map(|(k, v)| (k.as_str().unwrap().into(), v.clone()))
                    .collect(),
            )
        })
        .collect();
    json!({"kind":"ev-capture","carId":"3445","setup":goldens[0]["input"]["setup"],"frames":frames})
}

#[test]
fn inline_evidence_uses_the_qualified_capture_and_honest_provenance() {
    let raw = ice_evidence("AWD");
    let out = calculate(input("AWD"), "AWD");
    let id = &raw["observation"]["data"]["identity"];
    let expected = fh6_backend::tuning::tire_evidence::observe(
        raw["capture"]["samples"].as_array().unwrap(),
        &json!({"carOrdinal":id["ordinal"],"performanceIndex":id["performanceIndex"],"carClass":id["carClass"]}),
    );
    assert_eq!(out["tireEvidence"], expected);
    let p = &out["evidenceProvenance"];
    assert_eq!(p["carId"], "1435");
    assert_eq!(p["identity"], *id);
    assert_eq!(p["source"], "imported-capture");
    assert_eq!(p["analysisVersion"], "engine-loaded-sweep/v4");
    assert_eq!(p["observationRecordedAt"], 1000.0);
    for key in [
        "capturedAt",
        "sessionId",
        "setupVersion",
        "upgradeVersion",
        "lapWindow",
        "timeWindow",
    ] {
        assert!(p[key].is_null());
    }
    for (key, value) in [("carId", json!("wrong")), ("isElectric", json!(true))] {
        let mut request = input("AWD");
        if key == "carId" {
            request["inputSnapshot"][key] = value;
        } else {
            request["profile"][key] = value;
        }
        assert!(proof("AWD")
            .calculate(serde_json::from_value(request).unwrap())
            .is_err());
    }
    let ev = qualify(&serde_json::from_value::<EvidenceRequest>(ev_capture()).unwrap()).unwrap();
    let p = ev.provenance();
    assert_eq!(p["powertrain"], "ev");
    assert!(p["observationRecordedAt"].is_null());
    assert!(p["dependencyKey"].is_null());
    assert!(ev.tire_evidence().is_none());
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
        "rust/ice-measured-workflow-v2"
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
fn road_shift_diagnostics_use_the_qualified_effective_limit() {
    for (source, car, limit) in [
        (
            include_str!("../../tests/fixtures/aego_beetle_limiter_capture.json"),
            "1435",
            5248.0,
        ),
        (
            include_str!("../../tests/fixtures/aego_pajero_limiter_capture.json"),
            "2652",
            7999.0,
        ),
    ] {
        let fixture: Value = serde_json::from_str(source).unwrap();
        let samples: Vec<Value> = fixture["samples"]
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
                        .map(|(k, v)| (k.as_str().unwrap().into(), v.clone()))
                        .collect(),
                )
            })
            .collect();
        let batch = measurement::batch(&json!({
            "schemaVersion":"engine-batch/v1", "carId":car,
            "state":measurement::initial(car), "samples":samples,
            "nowMs":20000, "connected":true
        }))
        .unwrap();
        let key = json!([car, "RWD", null, 75, 1]).to_string();
        let raw = json!({"kind":"engine-capture",
            "observation":{"schema":"engine-observation/v1", "id":"limiter-audit",
                "carId":car, "source":"measured", "capturedAt":1000,
                "dependencyKey":key, "data":batch["readySnapshot"]},
            "capture":{"schemaVersion":"tuning-capture/v1", "metadata":{"carId":car},
                "samples":samples,
                "references":{"engineObservationId":"limiter-audit", "dependencyKey":key}}
        });
        let mut request = input("RWD");
        request["evidence"] = raw;
        request["inputSnapshot"] = json!({"carId":car,
            "engineCalculation":{"effectiveRedline":1},
            "roadLaunch":{"effectiveLimitRpm":999}});
        let out = serde_json::to_value(
            calculate_workflow(serde_json::from_value(request).unwrap()).unwrap(),
        )
        .unwrap();
        // The profile is only a workflow harness; this is not a Pajero tune baseline.
        let snapshot = &out["recommendation"]["inputSnapshot"];
        let nominal = snapshot["engineCalculation"]["engineMaxRpm"]
            .as_f64()
            .unwrap();
        assert!(nominal > limit);
        assert_eq!(snapshot["engineCalculation"]["effectiveRedline"], limit);
        assert_eq!(snapshot["roadLaunch"]["effectiveLimitRpm"], limit);
        let gears = out["gearing"]["gears"].as_array().unwrap();
        for (pair, landing) in gears.windows(2).zip(
            snapshot["roadLaunch"]["shiftLandingRpmsAtLimit"]
                .as_array()
                .unwrap(),
        ) {
            let expected = limit * pair[1].as_f64().unwrap() / pair[0].as_f64().unwrap();
            assert!((landing.as_f64().unwrap() - expected).abs() < 1e-9);
        }
    }
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
    let result = call(&app, "/api/tuning/workflow", r.clone()).unwrap();
    let road = call(
        &app,
        "/api/road/workflows",
        json!({"identity":{"ordinal":3445,"performanceIndex":795,"drivetrain":2},"carName":"Taycan","event":{"name":"Test","format":"circuit"},"recommendation":result["recommendation"]}),
    );
    let saved = road.unwrap();
    drop(app);
    let app = App::new(temp.path()).unwrap();
    assert_eq!(call(&app, "/api/tuning/workflow", r).unwrap(), result);
    assert_eq!(saved["identity"]["ordinal"], 3445);

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

#[test]
fn ev_desktop_projection_requires_observed_steering_for_qualification() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let raw = ev_capture();
    let batch = call(&app, "/api/tuning/ev-batch", json!({"schemaVersion":"ev-batch/v1","state":fh6_backend::tuning::ev_measurement::initial("3445"),"frames":raw["frames"]})).unwrap();
    assert_eq!(batch["readyGears"], json!([1, 2]));
    assert!(call(&app, "/api/tuning/ev-evidence", raw.clone()).is_ok());
    let mut missing = raw;
    for frame in missing["frames"].as_array_mut().unwrap() {
        frame.as_object_mut().unwrap().remove("SteerInput");
    }
    let batch = call(&app, "/api/tuning/ev-batch", json!({"schemaVersion":"ev-batch/v1","state":fh6_backend::tuning::ev_measurement::initial("3445"),"frames":missing["frames"]})).unwrap();
    assert_eq!(batch["readyGears"], json!([]));
    assert!(call(&app, "/api/tuning/ev-evidence", missing).is_err());
}

#[test]
fn road_model_versions_validate_with_their_own_owner_and_do_not_rewrite_history() {
    use fh6_backend::tuning::{gearing::calculate_aego_gearing_v2, RaceGoal, TuningCarParams};
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    save_engine(&app);
    // Synthetic draft geometry isolates model versioning; the engine capture stays unchanged.
    let mut request = saved_request();
    request["profile"]["weight"] = json!(200);
    request["inputSnapshot"]["gearingModelVersion"] = json!("caller-cannot-select-model");
    let current =
        call(&app, "/api/tuning/workflow", request.clone()).unwrap()["recommendation"].clone();
    assert_eq!(current["formulaVersion"], "rust/ice-measured-workflow-v2");
    assert_eq!(
        current["inputSnapshot"]["gearingModelVersion"],
        "aego-road-launch-envelope/v3"
    );
    assert!(current["inputSnapshot"]["roadLaunch"]["shiftLandingRpmsAtLimit"].is_array());
    let mut p: TuningCarParams = serde_json::from_value(request["profile"].clone()).unwrap();
    let engine = proof("AWD").engine().unwrap();
    p.max_hp_rpm = Some(engine.peak_power_rpm);
    p.max_torque_rpm = Some(engine.peak_torque_rpm);
    p.max_torque = engine.peak_torque_nm;
    let old_gearing = calculate_aego_gearing_v2(RaceGoal::Road, 6, &p, engine.engine_max_rpm, None);
    assert_ne!(old_gearing.unsupported, Some(true));
    let mut historical = current.clone();
    historical["formulaVersion"] = json!("rust/ice-measured-workflow-v1");
    historical["inputSnapshot"]["gearingModelVersion"] = json!("aego-road-joint/v2");
    historical["inputSnapshot"]
        .as_object_mut()
        .unwrap()
        .remove("roadLaunch");
    historical["fields"]["gearing.finalDrive"]["value"] = json!(old_gearing.final_drive);
    for (i, g) in old_gearing.gears.iter().enumerate() {
        historical["fields"][format!("gearing.gear{}", i + 1)]["value"] = json!(g);
    }
    assert_ne!(historical["fields"], current["fields"]);
    let mut forged_history = historical.clone();
    forged_history["inputSnapshot"]["gearingModelVersion"] = json!("aego-road-launch-envelope/v3");
    forged_history["inputSnapshot"]["roadLaunch"] = json!({"selectedTotalRatio":999});
    assert!(
        app.tuning_evidence
            .verify_recommendation(&forged_history, None)
            .is_err(),
        "historical v1 must reject caller-supplied v3 model metadata"
    );
    forged_history["inputSnapshot"]["gearingModelVersion"] = json!("aego-road-joint/v2");
    assert!(app
        .tuning_evidence
        .verify_recommendation(&forged_history, None)
        .is_err());
    forged_history["inputSnapshot"]
        .as_object_mut()
        .unwrap()
        .remove("roadLaunch");
    forged_history["inputSnapshot"]["gearingModelVersion"] = json!("unknown-model");
    assert!(app
        .tuning_evidence
        .verify_recommendation(&forged_history, None)
        .is_err());
    let mut unlabeled_history = historical.clone();
    unlabeled_history["inputSnapshot"]
        .as_object_mut()
        .unwrap()
        .remove("gearingModelVersion");
    app.tuning_evidence
        .verify_recommendation(&unlabeled_history, None)
        .unwrap();
    let saved = call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":historical}),
    )
    .unwrap();
    assert_eq!(saved["recommendation"], historical);
    assert!(call(
        &app,
        "/api/road/compatibility",
        json!({"discipline":"Drag","recommendation":current})
    )
    .is_ok());
    let mut relabeled = historical.clone();
    relabeled["formulaVersion"] = json!("rust/ice-measured-workflow-v2");
    assert!(app
        .tuning_evidence
        .verify_recommendation(&relabeled, None)
        .is_err());
    let mut altered = current.clone();
    altered["inputSnapshot"]["roadLaunch"]["selectedTotalRatio"] = json!(999);
    assert!(app
        .tuning_evidence
        .verify_recommendation(&altered, None)
        .is_err());
    let mut other_request = request.clone();
    other_request["goal"] = json!("Rally");
    other_request["inputSnapshot"]["roadLaunch"] = json!({"selectedTotalRatio":999});
    let other =
        call(&app, "/api/tuning/workflow", other_request).unwrap()["recommendation"].clone();
    assert!(other.is_object());
    assert!(other["inputSnapshot"].get("gearingModelVersion").is_none());
    assert!(other["inputSnapshot"].get("roadLaunch").is_none());
    app.tuning_evidence
        .verify_recommendation(&other, None)
        .unwrap();
    let mut forged_other = other.clone();
    forged_other["inputSnapshot"]["roadLaunch"] = json!({"selectedTotalRatio":999});
    assert!(app
        .tuning_evidence
        .verify_recommendation(&forged_other, None)
        .is_err());
    drop(app);
    let restarted = App::new(temp.path()).unwrap();
    restarted
        .tuning_evidence
        .verify_recommendation(&historical, None)
        .unwrap();
    restarted
        .tuning_evidence
        .verify_recommendation(&current, None)
        .unwrap();
}
