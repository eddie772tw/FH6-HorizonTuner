use fh6_backend::{config, config_service::ConfigService, storage};
use serde_json::{json, Value};

#[test]
fn python_settings_and_hud_outputs_are_preserved() {
    let cases: Value = serde_json::from_str(include_str!("fixtures/config.json")).unwrap();
    for case in cases["settings"].as_array().unwrap() {
        assert_eq!(
            config::merge_settings(&case["initial"], &case["patch"]).unwrap(),
            case["expected"]
        );
    }
    for case in cases["hud"].as_array().unwrap() {
        assert_eq!(config::normalize_hud(&case["input"]), case["normalized"]);
        assert_eq!(
            config::hud_for_frontend(&case["input"], &case["settings"]),
            case["frontend"]
        );
    }
    for case in cases["units"].as_array().unwrap() {
        assert_eq!(config::normalize_units(&case["input"]), case["expected"]);
    }
}
#[test]
fn settings_save_read_restart_and_backup_recovery() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    let saved = service
        .handle(
            "POST",
            "/api/settings",
            &json!({"language":"ja-jp","units":{"speed":"mph"},"theme":{"mode":"light"}}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(saved["units"]["temperature"], "F");
    let restarted = ConfigService::new(directory.path()).unwrap();
    assert_eq!(restarted.settings(), saved);
    service
        .handle("POST", "/api/settings", &json!({"language":"zh-tw"}))
        .unwrap()
        .unwrap();
    std::fs::write(directory.path().join("settings.json"), "broken").unwrap();
    let recovered = ConfigService::new(directory.path()).unwrap();
    assert_eq!(recovered.settings(), saved);
}
#[test]
fn legacy_settings_upgrade_is_durable_and_preserves_original_backup() {
    let directory = tempfile::tempdir().unwrap();
    let legacy = json!({"language":"ja-jp","unknownFutureSetting":42});
    storage::atomic_json(&directory.path().join("settings.json"), &legacy).unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    assert_eq!(service.settings()["settings_schema_version"], 2);
    let saved = storage::read_json(&directory.path().join("settings.json")).unwrap();
    assert_eq!(saved["settings_schema_version"], 2);
    assert_eq!(saved["unknownFutureSetting"], 42);
    assert_eq!(
        storage::read_json(&directory.path().join("settings.json.bak")).unwrap(),
        legacy
    );
}
#[test]
fn persistence_failure_does_not_commit_settings_or_publish_success() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    let initial = service.settings();
    std::fs::create_dir(directory.path().join("settings.json.bak")).unwrap();
    assert!(service
        .handle("POST", "/api/settings", &json!({"language":"bad"}))
        .unwrap()
        .is_err());
    assert_eq!(service.settings(), initial);
}
#[test]
fn tuning_and_hud_json_round_trip_and_relay() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    let mut receiver = service.overlay.subscribe();
    let languages = service
        .handle("GET", "/api/languages", &Value::Null)
        .unwrap()
        .unwrap();
    assert_eq!(languages[0]["code"], "en-us");
    let tuning = json!({"unknownFutureKey":[1,2],"gearRatios":[2.1,1.2]});
    assert_eq!(
        service
            .handle("POST", "/api/tunings/123/name", &tuning)
            .unwrap()
            .unwrap(),
        json!({"message":"Saved successfully"})
    );
    assert_eq!(
        service
            .handle("GET", "/api/tunings/123/name", &Value::Null)
            .unwrap()
            .unwrap(),
        tuning
    );
    service
        .handle(
            "POST",
            "/api/overlay/config",
            &json!({"hudStyle":"s650_foxbody","actualScale":3}),
        )
        .unwrap()
        .unwrap();
    let notification = receiver.try_recv().unwrap();
    assert_eq!(notification["type"], "hud:config");
    assert_eq!(notification["data"]["hudStyle"], "s650_hmi");
    assert!(notification["data"].get("actualScale").is_none());
    let disk = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert!(disk.get("effectiveUnits").is_none());
}
#[test]
fn externally_supplied_paths_remain_inside_the_data_root() {
    let directory = tempfile::tempdir().unwrap();
    for name in [
        "../escape",
        "/absolute",
        "C:/escape",
        "a\\b",
        ".",
        "a/../b",
        "x\0y",
        ".. /escape",
        "child./file",
    ] {
        assert!(
            storage::safe_path(directory.path(), name).is_err(),
            "accepted {name}"
        );
    }
    assert!(storage::safe_path(directory.path(), "child/file.json")
        .unwrap()
        .starts_with(directory.path().canonicalize().unwrap()));
}

#[test]
fn symlinks_and_dangling_junctions_cannot_escape_storage() {
    let fixture = tempfile::tempdir().unwrap();
    let root = fixture.path().join("root");
    let outside = fixture.path().join("outside");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(outside.join("sentinel.json"), b"private").unwrap();
    let link = root.join("escape");
    let link_directory = |destination: &std::path::Path| {
        #[cfg(unix)]
        std::os::unix::fs::symlink(destination, &link).unwrap();
        #[cfg(windows)]
        {
            let result = std::process::Command::new("cmd")
                .args(["/c", "mklink", "/J"])
                .arg(&link)
                .arg(destination)
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "junction: {}",
                String::from_utf8_lossy(&result.stderr)
            );
        }
    };
    let unlink = || {
        #[cfg(unix)]
        std::fs::remove_file(&link).unwrap();
        #[cfg(windows)]
        std::fs::remove_dir(&link).unwrap();
    };
    link_directory(&outside);
    assert!(storage::safe_path(&root, "escape/sentinel.json").is_err());
    assert!(storage::safe_path(&root, "escape/new.json").is_err());
    #[cfg(windows)]
    assert!(storage::safe_path(&root, "ESCAPE/new.json").is_err());
    unlink();
    link_directory(&fixture.path().join("missing-outside"));
    assert!(storage::safe_path(&root, "escape/new.json").is_err());
    unlink();
    assert_eq!(
        std::fs::read(outside.join("sentinel.json")).unwrap(),
        b"private"
    );
    assert!(!fixture.path().join("missing-outside").exists());
}
