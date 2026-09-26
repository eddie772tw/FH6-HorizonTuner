use fh6_backend::{app::App, mcp::McpServer};
use serde_json::json;
use std::{collections::BTreeSet, sync::Arc};

fn app() -> (Arc<App>, tempfile::TempDir) {
    let root = tempfile::tempdir().expect("test directory");
    std::fs::write(
        root.path().join("settings.json"),
        r#"{"language":"en-us","speedUnit":"kmh"}"#,
    )
    .unwrap();
    std::fs::write(
        root.path().join("hud_config.json"),
        r#"{"enabled":true,"showTeleMaster":true}"#,
    )
    .unwrap();
    std::fs::create_dir_all(root.path().join("logs")).unwrap();
    std::fs::write(root.path().join("logs/backend.log"), "fixture log\n").unwrap();
    let app = App::new(root.path()).expect("test app");
    std::fs::write(
        root.path().join("settings.json"),
        r#"{"language":"en-us","speedUnit":"kmh"}"#,
    )
    .unwrap();
    (app, root)
}

#[test]
fn initialize_and_tool_registry_match_json_rpc_contract() {
    let (app, _root) = app();
    let mut server = McpServer::default();
    let init = server.handle(&app, &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}})).unwrap().unwrap();
    assert_eq!(init["result"]["protocolVersion"], "2024-11-05");
    let list = server
        .handle(
            &app,
            &json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 26);
    assert_eq!(
        server.status(&app.config.settings())["transport"],
        "streamable-http"
    );
}

#[test]
fn mcp_reads_real_car_names_and_api_written_presets_without_cross_car_fallback() {
    let (app, root) = app();
    let service = fh6_backend::mcp::McpService::new(&app);
    let cars = service.search_cars(Some("Toyota 2000"), None, None);
    assert!(cars
        .iter()
        .any(|car| car["car_id"] == "247" && car["name"] == "1969 Toyota 2000 GT"));
    assert_eq!(
        service.car_details("247").unwrap()["name"],
        "1969 Toyota 2000 GT"
    );
    let preset = json!({"schemaVersion":"tuning-preset/v1","createdAt":"2026-09-26T00:00:00Z","parameters":{"arb_front":3.0}});
    app.config
        .handle("POST", "/api/tunings/247/road-test", &preset)
        .unwrap()
        .unwrap();
    assert_eq!(service.preset("247", "road-test"), Some(preset));
    let list = service.presets(Some("247"));
    assert_eq!(list[0]["schema_version"], "tuning-preset/v1");
    assert_eq!(list[0]["created_at"], "2026-09-26T00:00:00Z");
    std::fs::write(
        root.path().join("tunings/other-car.json"),
        r#"{"car_id":"249"}"#,
    )
    .unwrap();
    assert!(service.preset("247", "other-car").is_none());
    assert!(service.preset("247", "../settings").is_none());
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("escaped.json"), r#"{"car_id":"247"}"#).unwrap();
    let link = root.path().join("tunings").join("linked");
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    #[cfg(windows)]
    {
        let status = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "junction failed: stdout={}, stderr={}",
            String::from_utf8_lossy(&status.stdout),
            String::from_utf8_lossy(&status.stderr)
        );
    }
    assert!(!service
        .presets(Some("247"))
        .iter()
        .any(|v| v["preset_name"] == "escaped"));
    assert!(service.preset("247", "escaped").is_none());
    #[cfg(unix)]
    std::fs::remove_file(&link).unwrap();
    #[cfg(windows)]
    std::fs::remove_dir(&link).unwrap();
    assert!(outside.path().join("escaped.json").exists());
}

#[test]
fn tool_errors_and_solver_are_json_contracts() {
    let (app, _root) = app();
    let mut server = McpServer::default();
    let missing = server.handle(&app, &json!({"jsonrpc":"2.0","id":"x","method":"tools/call","params":{"name":"get_session_summary","arguments":{}}})).unwrap().unwrap();
    assert_eq!(missing["error"]["code"], -32602);
    let solver = server.handle(&app, &json!({"jsonrpc":"2.0","id":"s","method":"tools/call","params":{"name":"run_gearing_solver","arguments":{"max_rpm":8000,"peak_hp_rpm":7200,"top_speed_kmh":320}}})).unwrap().unwrap();
    let gearing: serde_json::Value =
        serde_json::from_str(solver["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(gearing["gears_count"], 6);
    assert_eq!(gearing["gears"][0]["ratio"], 3.2);
    assert!(gearing["final_drive"].as_f64().unwrap() > 0.0);
    let diagnosis = server
        .handle(
            &app,
            &json!({"jsonrpc":"2.0","id":"d","method":"tools/call","params":{"name":"diagnose_telemetry_handling","arguments":{"tire_temps":[105.0,106.0,85.0,86.0],"symptom":"understeer_entry"}}}),
        )
        .unwrap()
        .unwrap();
    let diagnosis: serde_json::Value =
        serde_json::from_str(diagnosis["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(diagnosis["convergence_status"], "adjustment_required");
    assert!(diagnosis["actionable_directives"][0]
        .as_str()
        .unwrap()
        .contains("Front axle overheat"));
    let resource = server
        .handle(
            &app,
            &json!({"jsonrpc":"2.0","id":"r","method":"resources/read","params":{"uri":"http://invalid/scheme"}}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(resource["error"]["code"], -32602);
    let note = server
        .handle(
            &app,
            &json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
        )
        .unwrap();
    assert!(note.is_none());
    for params in [
        json!([]),
        json!({"name":"get_system_settings","arguments":[]}),
        json!({"name":"diagnose_telemetry_handling","arguments":{"tire_temps":[90,null,"90",90]}}),
    ] {
        let response = server
            .handle(
                &app,
                &json!({"jsonrpc":"2.0","id":99,"method":"tools/call","params":params}),
            )
            .unwrap()
            .unwrap();
        assert_eq!(response["error"]["code"], -32602);
    }
    let response=server.handle(&app,&json!({"jsonrpc":"2.0","id":100,"method":"tools/call","params":{"name":"run_gearing_solver","arguments":{"max_rpm":8000,"peak_hp_rpm":7200,"gears_count":1000000000}}})).unwrap().unwrap();
    let result: serde_json::Value =
        serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert!(result.get("error").is_some());
}

fn assert_json_equivalent(actual: &serde_json::Value, expected: &serde_json::Value, path: &str) {
    match (actual, expected) {
        (serde_json::Value::Object(a), serde_json::Value::Object(e)) => {
            assert_eq!(
                a.keys().collect::<BTreeSet<_>>(),
                e.keys().collect::<BTreeSet<_>>(),
                "{path} keys"
            );
            for (key, value) in e {
                assert_json_equivalent(&a[key], value, &format!("{path}.{key}"));
            }
        }
        (serde_json::Value::Array(a), serde_json::Value::Array(e)) => {
            assert_eq!(a.len(), e.len(), "{path} length");
            for (index, (av, ev)) in a.iter().zip(e).enumerate() {
                assert_json_equivalent(av, ev, &format!("{path}[{index}]"));
            }
        }
        (a, e) if a.is_number() && e.is_number() => {
            let av = a.as_f64().unwrap();
            let ev = e.as_f64().unwrap();
            assert!((av - ev).abs() <= 1e-9, "{path}: {av} != {ev}");
        }
        (a, e) => assert_eq!(a, e, "{path}"),
    }
}

fn strip_file_paths(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(object) => serde_json::Value::Object(
            object
                .iter()
                .filter(|(key, _)| key.as_str() != "file_path")
                .map(|(key, value)| (key.clone(), strip_file_paths(value)))
                .collect(),
        ),
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.iter().map(strip_file_paths).collect())
        }
        other => other.clone(),
    }
}

fn normalize_resource(value: &serde_json::Value) -> serde_json::Value {
    let mut value = strip_file_paths(value);
    if let Some(contents) = value.get_mut("contents").and_then(|v| v.as_array_mut()) {
        for item in contents {
            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                if let Ok(parsed) = serde_json::from_str(text) {
                    item["text"] = strip_file_paths(&parsed);
                }
            }
        }
    }
    value
}

#[test]
fn python_golden_fixture_covers_every_registered_tool() {
    let (app, root) = app();
    let golden: serde_json::Value = serde_json::from_str(include_str!("mcp_golden.json")).unwrap();
    let mut server = McpServer::default();
    app.database
        .create_session("fixture-session", 247, "Fixture Car", 700, 800, 1.0)
        .unwrap();
    app.database
        .insert_points_batch(
            "fixture-session",
            &[json!({"time":1.0,"LapNumber":1,"SpeedMetersPerSecond":30.0,"DistanceTraveled":100.0,"CurrentEngineRpm":4000.0,"Gear":3,"TireTemp":[190.0,191.0,188.0,189.0],"NormalizedSuspensionTravel":[0.2,0.2,0.3,0.3],"TireSlipAngle":[0.01,0.01,0.01,0.01],"TireSlipRatio":[0.02,0.02,0.02,0.02]})],
        )
        .unwrap();
    app.database
        .finalize_session("fixture-session", json!({"endReason":"fixture"}))
        .unwrap();
    std::fs::create_dir_all(root.path().join("docs/calibration")).unwrap();
    std::fs::create_dir_all(root.path().join("drag_sessions")).unwrap();
    std::fs::create_dir_all(root.path().join("tunings")).unwrap();
    std::fs::write(root.path().join("docs/calibration/fixture-capture.json"), r#"{"schemaVersion":"tuning-capture/v1","captureId":"fixture-capture","createdAt":"2026-09-22T00:00:00Z","metadata":{"carOrdinal":247,"installedParts":[],"surface":"asphalt","purpose":"road"},"samples":[{"timestampMs":0,"speedKmh":50.0},{"timestampMs":500,"speedKmh":100.0}],"confidence":"in_game_capture"}"#).unwrap();
    std::fs::write(
        root.path().join("drag_sessions/fixture-drag.json"),
        r#"{"car_name":"Fixture Car","timestamp":1,"times":{"0-100":3.2}}"#,
    )
    .unwrap();
    std::fs::write(
        root.path().join("tunings/fixture-preset.json"),
        r#"{"car_id":"247","created_at":"2026-09-22","schema_version":"fixture","spring":123}"#,
    )
    .unwrap();
    let live = golden["tools"]["get_live_telemetry_snapshot"]["latest_sample"].clone();
    app.process(live);
    let arguments = golden["arguments"].as_object().unwrap();
    let expected_tools = golden["tools"].as_object().unwrap();
    assert_eq!(arguments.len(), 26);
    assert_eq!(expected_tools.len(), 26);
    for (name, args) in arguments {
        let request = json!({"jsonrpc":"2.0","id":name,"method":"tools/call","params":{"name":name,"arguments":args}});
        let response = server.handle(&app, &request).unwrap().unwrap();
        let actual = if response.get("error").is_some() {
            json!({"error": response["error"]})
        } else {
            serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap()
        };
        let actual = strip_file_paths(&actual);
        assert_json_equivalent(&actual, &expected_tools[name], name);
    }
    let resources = server
        .handle(
            &app,
            &json!({"jsonrpc":"2.0","id":"resources","method":"resources/list"}),
        )
        .unwrap()
        .unwrap();
    assert_json_equivalent(
        &resources["result"]["resources"],
        &golden["resources"],
        "resources",
    );
    for (uri, expected) in golden["resource_reads"].as_object().unwrap() {
        let response = server
            .handle(
                &app,
                &json!({"jsonrpc":"2.0","id":uri,"method":"resources/read","params":{"uri":uri}}),
            )
            .unwrap()
            .unwrap();
        let actual = if response.get("error").is_some() {
            json!({"error": response["error"]})
        } else {
            response["result"].clone()
        };
        let actual = normalize_resource(&actual);
        let expected = normalize_resource(expected);
        assert_json_equivalent(&actual, &expected, uri);
    }
}
