use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
    road::RoadStore,
    tuning::evidence::EvidenceService,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn raw() -> Value {
    let replay: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_taycan_replay.json")).unwrap();
    let golden: Value =
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
    json!({"kind":"ev-capture","carId":"3445","setup":golden[0]["input"]["setup"],"powertrain":{"drivetrain":"AWD","maxHp":751,"maxTorque":1050},"frames":frames})
}
fn context(raw: &Value) -> Value {
    json!({"schemaVersion":"ev-context/v1","carId":"3445","identity":{"ordinal":3445,"performanceIndex":795,"carClass":4},"setup":raw["setup"],"powertrain":raw["powertrain"]})
}
fn request(raw: &Value, id: &Value, schema: &str) -> Value {
    json!({"schemaVersion":schema,"goal":"Road","season":"Summer","profile":{"weight":2200,"weight_distribution":50,"drivetrain":"AWD","maxHp":751,"maxTorque":1050,"isElectric":true,"evGearbox":raw["setup"]},"inputSnapshot":{"carId":"3445","evEvidenceConfirmation":context(raw)},"evidence":{"kind":"saved-ev","evidenceId":id}})
}
fn call(app: &App, method: &str, path: &str, body: Value) -> fh6_backend::error::ApiResult<Value> {
    let response = app.request(ApiRequest {
        method: method.into(),
        path: path.into(),
        query: BTreeMap::from([("carId".into(), "3445".into())]),
        headers: Default::default(),
        body: serde_json::to_vec(&body).unwrap(),
        upload_filename: None,
    })?;
    Ok(serde_json::from_slice(&response.body).unwrap())
}
#[test]
fn ev_live_export_import_restart_and_cli_mcp_replay_share_current_and_historical_owners() {
    use fh6_backend::mcp::McpServer;
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let raw = raw();
    let saved = call(&app, "POST", "/api/tuning/ev-evidence", raw.clone()).unwrap();
    let exported = json!({"schema":"ev-capture/v1","carId":"3445","setup":raw["setup"],"powertrain":raw["powertrain"],"frames":raw["frames"],"measurement":{"carId":"3445","gears":"forged"},"result":{"finalDrive":99},"exportedAt":"unknown-source-time"});
    let imported = call(&app, "POST", "/api/tuning/ev-import", exported).unwrap();
    assert_eq!(saved["state"], imported["state"]);
    let listed = call(&app, "GET", "/api/tuning/ev-evidence", Value::Null).unwrap();
    assert_eq!(listed.as_array().unwrap().len(), 2);
    assert!(listed
        .as_array()
        .unwrap()
        .iter()
        .all(|m| m.get("frames").is_none() && m.get("capture").is_none()));
    for schema in [
        "tuning-workflow-result/v1",
        "tuning-workflow-result/v2",
        "tuning-workflow-result/v3",
    ] {
        let mut args = request(&raw, &saved["evidenceId"], schema);
        if !schema.ends_with("v3") {
            args["inputSnapshot"]
                .as_object_mut()
                .unwrap()
                .remove("evEvidenceConfirmation");
        }
        let expected = call(&app, "POST", "/api/tuning/workflow", args.clone()).unwrap();
        assert_eq!(expected["readiness"]["gearingAvailable"], true);
        assert!(call(
            &app,
            "POST",
            "/api/road/api/road/compatibility",
            json!({"discipline":"Drag","recommendation":expected["recommendation"]})
        )
        .is_err());
        for path in ["/api/road/compatibility/", "/api/road//compatibility"] {
            assert!(call(
                &app,
                "POST",
                path,
                json!({"discipline":"Drag","recommendation":expected["recommendation"]})
            )
            .is_ok());
        }
        if schema.ends_with("v3") {
            let mut forged = expected["recommendation"].clone();
            forged["inputSnapshot"]
                .as_object_mut()
                .unwrap()
                .remove("evEvidenceConfirmation");
            assert!(call(
                &app,
                "POST",
                "/api/road/compatibility",
                json!({"discipline":"Drag","recommendation":forged})
            )
            .is_err());
        }
        assert_eq!(
            expected["recommendation"]["formulaVersion"],
            if schema.ends_with("v3") {
                "rust/ev-measured-workflow-v3"
            } else if schema.ends_with("v2") {
                "rust/ev-measured-workflow-v2"
            } else {
                "rust/ev-measured-workflow-v1"
            }
        );
        let road = call(&app,"POST","/api/road/workflows",json!({"identity":{"ordinal":3445,"performanceIndex":795,"drivetrain":2},"carName":"Taycan","event":{"name":"EV raw replay","format":"circuit"},"recommendation":expected["recommendation"]})).unwrap();
        let restarted = App::new(temp.path()).unwrap();
        let before = std::fs::read(temp.path().join("telemetry_sessions.db")).unwrap();
        assert_eq!(
            call(&restarted, "POST", "/api/tuning/workflow", args.clone()).unwrap(),
            expected
        );
        let mcp = McpServer::default().handle(&restarted,&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tuning_workflow","arguments":args}})).unwrap().unwrap();
        let result: Value =
            serde_json::from_str(mcp["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(result, expected);
        let cli = std::process::Command::new(env!("CARGO_BIN_EXE_fh6-agent"))
            .args([
                "solve",
                "workflow",
                "--args",
                &args.to_string(),
                "--data-dir",
                temp.path().to_str().unwrap(),
                "--backend-url",
                "http://127.0.0.1:1",
                "--json",
            ])
            .output()
            .unwrap();
        assert!(
            cli.status.success(),
            "{}",
            String::from_utf8_lossy(&cli.stdout)
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&cli.stdout).unwrap(),
            expected
        );
        assert_eq!(
            std::fs::read(temp.path().join("telemetry_sessions.db")).unwrap(),
            before
        );
        assert_eq!(road["identity"]["ordinal"], 3445);
    }
}
#[test]
fn ev_selection_requires_independent_identity_setup_and_powertrain_confirmation() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let raw = raw();
    let saved = call(&app, "POST", "/api/tuning/ev-evidence", raw.clone()).unwrap();
    let good = json!({"evidenceId":saved["evidenceId"],"confirmation":context(&raw)});
    let mut unconfirmed = request(&raw, &saved["evidenceId"], "tuning-workflow-result/v3");
    unconfirmed["inputSnapshot"]
        .as_object_mut()
        .unwrap()
        .remove("evEvidenceConfirmation");
    assert!(call(&app, "POST", "/api/tuning/workflow", unconfirmed).is_err());
    assert_eq!(
        call(&app, "POST", "/api/tuning/ev-selection", good.clone()).unwrap()["readyGears"],
        json!([1, 2])
    );
    for pointer in [
        "/confirmation/carId",
        "/confirmation/identity/ordinal",
        "/confirmation/identity/performanceIndex",
        "/confirmation/identity/carClass",
        "/confirmation/setup/finalDrive",
        "/confirmation/powertrain/maxHp",
        "/confirmation/schemaVersion",
    ] {
        let mut bad = good.clone();
        *bad.pointer_mut(pointer).unwrap() = json!(999);
        assert!(
            call(&app, "POST", "/api/tuning/ev-selection", bad).is_err(),
            "{pointer}"
        );
    }
    for field in ["drivetrain", "maxHp", "maxTorque"] {
        let mut args = request(&raw, &saved["evidenceId"], "tuning-workflow-result/v3");
        args["profile"][field] = if field == "drivetrain" {
            json!("FWD")
        } else {
            json!(100)
        };
        assert!(call(&app, "POST", "/api/tuning/workflow", args).is_err());
    }
    let mut args = request(&raw, &saved["evidenceId"], "tuning-workflow-result/v3");
    args["profile"]["isElectric"] = json!(false);
    assert!(call(&app, "POST", "/api/tuning/workflow", args.clone()).is_err());
    args["profile"]["transmission"] = json!({"type":"cvt","capability":"unknown"});
    args["schemaVersion"] = json!("tuning-workflow-result/v2");
    let cvt = call(&app, "POST", "/api/tuning/workflow", args).unwrap();
    assert_eq!(cvt["readiness"]["gearingAvailable"], false);
    assert!(cvt["recommendation"].is_null());
}
#[test]
fn ev_saved_replay_ignores_cached_moments_and_refuses_missing_or_unqualified_raw() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let raw = raw();
    let saved = call(&app, "POST", "/api/tuning/ev-evidence", raw.clone()).unwrap();
    let args = request(&raw, &saved["evidenceId"], "tuning-workflow-result/v3");
    let expected = call(&app, "POST", "/api/tuning/workflow", args.clone()).unwrap();
    let db = rusqlite::Connection::open(temp.path().join("telemetry_sessions.db")).unwrap();
    let cached: String = db
        .query_row(
            "SELECT document FROM road_documents WHERE id=?1",
            [saved["evidenceId"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    let mut cached: Value = serde_json::from_str(&cached).unwrap();
    cached["gears"] = json!([]);
    cached["summary"] = json!({"forged":true});
    db.execute(
        "UPDATE road_documents SET document=?1 WHERE id=?2",
        rusqlite::params![cached.to_string(), saved["evidenceId"].as_str().unwrap()],
    )
    .unwrap();
    assert_eq!(
        call(&app, "POST", "/api/tuning/workflow", args.clone()).unwrap(),
        expected
    );
    let observation_id = cached["observation"]["id"].as_str().unwrap();
    let original: String = db
        .query_row(
            "SELECT document FROM road_documents WHERE id=?1",
            [observation_id],
            |r| r.get(0),
        )
        .unwrap();
    for capture in [
        json!({"kind":"ev-capture","carId":"3445","setup":raw["setup"],"frames":[]}),
        json!({"kind":"unknown","frames":raw["frames"]}),
        json!({"kind":"ev-capture","carId":"999","setup":raw["setup"],"frames":raw["frames"]}),
    ] {
        let mut doc: Value = serde_json::from_str(&original).unwrap();
        doc["capture"] = capture;
        db.execute(
            "UPDATE road_documents SET document=?1 WHERE id=?2",
            rusqlite::params![doc.to_string(), observation_id],
        )
        .unwrap();
        assert!(call(&app, "POST", "/api/tuning/workflow", args.clone()).is_err());
    }
    db.execute("DELETE FROM road_documents WHERE id=?1", [observation_id])
        .unwrap();
    assert!(call(&app, "POST", "/api/tuning/workflow", args).is_err());
}
#[test]
fn ev_import_and_cold_discovery_preserve_unknowns_and_fail_closed() {
    let temp = tempfile::tempdir().unwrap();
    let db = temp.path().join("missing.db");
    let service = EvidenceService {
        store: RoadStore {
            db_path: db.to_string_lossy().into(),
        },
    };
    assert_eq!(service.list_ev("3445").unwrap(), json!([]));
    assert!(!db.exists());
    assert!(service.read_ev("missing").is_err());
    assert!(!db.exists());
    std::fs::write(&db, "invalid sqlite").unwrap();
    assert!(service.list_ev("3445").is_err());
    let app = App::new(temp.path()).unwrap();
    let oversized = app.request(ApiRequest {
        method: "POST".into(),
        path: "/api/tuning/ev-import".into(),
        query: Default::default(),
        headers: Default::default(),
        body: vec![b' '; 8 * 1024 * 1024 + 1],
        upload_filename: None,
    });
    assert!(oversized.is_err());
    let mut raw = raw();
    raw.as_object_mut().unwrap().remove("powertrain");
    raw["setup"]["finalDrive"] = Value::Null;
    raw["setup"]["gearRatios"] = json!([null]);
    raw["setup"]["gearAdjustable"] = json!([false]);
    raw["setup"]["finalDriveAdjustable"] = json!(false);
    raw["frames"] = json!(raw["frames"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f["Gear"] == 1)
        .cloned()
        .collect::<Vec<_>>());
    let saved = call(&app, "POST", "/api/tuning/ev-import", raw.clone()).unwrap();
    assert!(saved["metadata"]["powertrain"].is_null());
    assert_eq!(saved["metadata"]["setup"]["gearRatios"], json!([null]));
    let mut confirmation = context(&raw);
    confirmation["powertrain"] = json!({"drivetrain":"AWD","maxHp":null,"maxTorque":null});
    assert!(call(
        &app,
        "POST",
        "/api/tuning/ev-selection",
        json!({"evidenceId":saved["evidenceId"],"confirmation":confirmation})
    )
    .is_ok());
    raw["frames"] = json!([]);
    assert!(call(&app, "POST", "/api/tuning/ev-import", raw).is_err());
    assert!(call(
        &app,
        "POST",
        "/api/tuning/ev-import",
        json!({"schema":"ev-capture/v99","frames":[]})
    )
    .is_err());
    let too_many = json!({"kind":"ev-capture","carId":"3445","setup":saved["metadata"]["setup"],"frames":vec![json!({});30001]});
    assert!(call(&app, "POST", "/api/tuning/ev-import", too_many).is_err());
}
