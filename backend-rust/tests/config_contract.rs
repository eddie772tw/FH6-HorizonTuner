use fh6_backend::{config, config_service::ConfigService, storage};
use serde_json::{json, Value};

#[test]
fn shared_gauge_sources_and_independent_selection_survive_save_restart_and_main_style_changes() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service.handle("POST", "/api/overlay/config", &json!({
        "hudStyle":"auxiliary_gauges", "auxGaugeMode":"blitz", "elements":{"showGauge":true}, "pluginField":42
    })).unwrap().unwrap();
    let mut hud = service.hud();
    assert_eq!(hud["hudStyle"], "vfd");
    assert_eq!(hud["auxGaugeFaces"], json!(["blitz"]));
    assert_eq!(hud["elements"]["showAuxiliaryGauges"], true);
    assert_eq!(hud["auxGaugeEdge"], "right");
    assert!(hud.get("auxGaugeMode").is_none());
    for edge in ["left", "right", "top", "bottom"] {
        hud["hudStyle"] = json!("gt7");
        hud["elements"]["showGauge"] = json!(false);
        hud["auxGaugeFaces"] = json!(["aem", "defi", "speedhut"]);
        hud["auxGaugeMaxPerRow"] = json!(2);
        hud["auxGaugeOrientation"] = json!("vertical");
        hud["auxGaugeEdge"] = json!(edge);
        hud["auxGaugeOffset"] = json!(24);
        hud["auxGaugeCenterOffset"] = json!(-32);
        hud["gaugeValueSources"]["boost"] =
            json!({"field":"power_kw","unit":"native","label":"Power"});
        let mut receiver = service.overlay.subscribe();
        service
            .handle("POST", "/api/overlay/config", &hud)
            .unwrap()
            .unwrap();
        let relayed = receiver.try_recv().unwrap();
        assert_eq!(
            relayed["data"]["gaugeValueSources"]["boost"]["field"],
            "power_kw"
        );
        let restarted = ConfigService::new(directory.path()).unwrap().hud();
        assert_eq!(restarted["hudStyle"], "gt7");
        assert_eq!(restarted["elements"]["showAuxiliaryGauges"], true);
        assert_eq!(restarted["elements"]["showGauge"], false);
        assert_eq!(
            restarted["auxGaugeFaces"],
            json!(["aem", "defi", "speedhut"])
        );
        assert_eq!(restarted["auxGaugeMaxPerRow"], 2);
        assert_eq!(restarted["auxGaugeOrientation"], "vertical");
        assert_eq!(restarted["auxGaugeEdge"], edge);
        assert_eq!(restarted["auxGaugeCenterOffset"], -32.0);
        assert_eq!(
            restarted["gaugeValueSources"]["boost"],
            hud["gaugeValueSources"]["boost"]
        );
        assert_eq!(restarted["pluginField"], 42);
    }
}

#[test]
fn shared_gauge_contract_bounds_invalid_input_without_inventing_missing_telemetry() {
    let unrelated = json!({"hudStyle":"vfd","pluginField":42});
    assert_eq!(config::normalize_hud(&unrelated), unrelated);
    let hud = config::normalize_hud(&json!({
        "auxGaugeFaces":["aem","bad","aem","defi"], "auxGaugeMaxPerRow":99,
        "auxGaugeOrientation":"bad", "auxGaugeEdge":"bad", "auxGaugeOffset":-1, "auxGaugeCenterOffset":-9999,
        "gaugeValueSources":{"boost":{"field":"../bad","unit":"C","label":" "}},
        "elements":{"showAuxiliaryGauges":"true"}
    }));
    assert_eq!(hud["auxGaugeFaces"], json!(["aem", "defi"]));
    assert_eq!(hud["auxGaugeMaxPerRow"], 5);
    assert_eq!(hud["auxGaugeOrientation"], "horizontal");
    assert_eq!(hud["auxGaugeEdge"], "right");
    assert_eq!(hud["auxGaugeOffset"], 0.0);
    assert_eq!(hud["auxGaugeCenterOffset"], -4000.0);
    assert_eq!(hud["elements"]["showAuxiliaryGauges"], false);
    assert_eq!(
        hud["gaugeValueSources"]["boost"],
        json!({"field":"boost_psi","unit":"psi","label":"Boost"})
    );
    assert_eq!(
        hud["gaugeValueSources"]["oilPressure"]["field"],
        "estimated_oil_pressure_psi"
    );
    assert_eq!(
        hud["gaugeValueSources"]["oilTemperature"]["field"],
        "tire_temp_avg"
    );
    assert_eq!(hud["gaugeValueSources"]["oilTemperature"]["unit"], "F");
    assert_eq!(
        config::normalize_hud(&json!({"auxGaugeFaces":[]}))["auxGaugeFaces"],
        json!([])
    );
}

#[test]
fn shared_gauge_old_defaults_migrate_without_replacing_deliberate_custom_sources() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service
        .handle(
            "POST",
            "/api/overlay/config",
            &json!({
                "auxGaugeFaces":["greddy", "blitz", "defi"],
                "gaugeValueSources": {
                    "oilPressure":{"field":"","unit":"psi","label":"Oil pressure (unassigned)"},
                    "oilTemperature":{"field":"","unit":"C","label":"Oil temperature (unassigned)"}
                }
            }),
        )
        .unwrap()
        .unwrap();
    let restarted = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(
        restarted["gaugeValueSources"]["oilPressure"]["field"],
        "estimated_oil_pressure_psi"
    );
    assert_eq!(
        restarted["gaugeValueSources"]["oilTemperature"],
        restarted["gaugeValueSources"]["waterTemperature"]
    );
    let custom = config::normalize_hud(&json!({"gaugeValueSources":{
        "oilPressure":{"field":"","unit":"psi","label":"Disabled intentionally"},
        "oilTemperature":{"field":"power_kw","unit":"native","label":"Power"}
    }}));
    assert_eq!(custom["gaugeValueSources"]["oilPressure"]["field"], "");
    assert_eq!(
        custom["gaugeValueSources"]["oilTemperature"]["field"],
        "power_kw"
    );
}

#[test]
fn independent_elements_migrate_and_survive_config_save_restart_and_gauge_changes() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service.handle("POST", "/api/overlay/config", &json!({
        "hudStyle":"audio_head", "audioHeadDeck":6, "elements":{"showGauge":true}, "pluginField":42
    })).unwrap().unwrap();
    let mut hud = service.hud();
    assert_eq!(hud["hudStyle"], "vfd");
    assert_eq!(hud["elements"]["showAudioHead"], true);
    assert_eq!(hud["audioHeadDeck"], 6);
    for edge in ["left", "right", "top", "bottom"] {
        hud["hudStyle"] = json!("gt7");
        hud["elements"]["showGauge"] = json!(false);
        hud["audioHeadEdge"] = json!(edge);
        hud["audioHeadOffset"] = json!(24.0);
        hud["audioHeadCenterOffset"] = json!(-32.0);
        service
            .handle("POST", "/api/overlay/config", &hud)
            .unwrap()
            .unwrap();
        let restored = ConfigService::new(directory.path()).unwrap().hud();
        assert_eq!(restored["hudStyle"], "gt7");
        assert_eq!(restored["elements"]["showGauge"], false);
        assert_eq!(restored["elements"]["showAudioHead"], true);
        assert_eq!(restored["audioHeadEdge"], edge);
        assert_eq!(restored["audioHeadOffset"], 24.0);
        assert_eq!(restored["audioHeadCenterOffset"], -32.0);
        assert_eq!(restored["pluginField"], 42);
    }
    let bounded = config::normalize_hud(
        &json!({"audioHeadDeck":99,"audioHeadEdge":"invalid","audioHeadOffset":-20,"audioHeadCenterOffset":9000}),
    );
    assert_eq!(bounded["audioHeadDeck"], 8);
    assert_eq!(bounded["audioHeadEdge"], "left");
    assert_eq!(bounded["audioHeadOffset"], 0.0);
    assert_eq!(bounded["audioHeadCenterOffset"], 4000.0);
    let hidden =
        config::normalize_hud(&json!({"hudStyle":"audio_head","elements":{"showGauge":false}}));
    assert_eq!(hidden["elements"]["showAudioHead"], false);
}

#[test]
fn deferred_subsystems_stay_hidden_and_retain_settings_after_restart() {
    for style in [
        "minimap_overlay",
        "touge_pacenotes",
        "telemetry_cards",
        "speed_effects",
    ] {
        let directory = tempfile::tempdir().unwrap();
        let service = ConfigService::new(directory.path()).unwrap();
        service.handle("POST", "/api/overlay/config", &json!({
            "hudStyle":style, "minimapMode":"north_up", "gamepadLayout":"bad", "pluginKey":"keep"
        })).unwrap().unwrap();
        let hud = ConfigService::new(directory.path()).unwrap().hud();
        assert_eq!(hud["hudStyle"], "vfd");
        assert_eq!(hud["gamepadLayout"], "xbox");
        assert_eq!(hud["minimapMode"], "north_up");
        assert_eq!(hud["pluginKey"], "keep");
    }
}

#[test]
fn controller_telemetry_card_migrates_and_stays_independent_after_restart() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service.handle("POST", "/api/overlay/config", &json!({
        "hudStyle":"gamepad_overlay", "gamepadLayout":"dualsense", "elements":{"showGauge":true}
    })).unwrap().unwrap();
    let mut hud = service.hud();
    assert_eq!(hud["hudStyle"], "vfd");
    assert_eq!(hud["elements"]["showTeleGamepad"], true);
    hud["hudStyle"] = json!("gt7");
    hud["elements"]["showGauge"] = json!(false);
    service
        .handle("POST", "/api/overlay/config", &hud)
        .unwrap()
        .unwrap();
    let restarted = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(restarted["hudStyle"], "gt7");
    assert_eq!(restarted["elements"]["showGauge"], false);
    assert_eq!(restarted["elements"]["showTeleGamepad"], true);
    assert_eq!(restarted["gamepadLayout"], "dualsense");
}

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
        // Keep the frozen Python-era fields unchanged; temperature is an
        // additive display-unit contract, covered separately below.
        let mut frontend = case["frontend"].clone();
        frontend["units"]["temperature"] = json!("C");
        frontend["effectiveUnits"]["temperature"] = json!("C");
        assert_eq!(
            config::hud_for_frontend(&case["input"], &case["settings"]),
            frontend
        );
    }
    for case in cases["units"].as_array().unwrap() {
        assert_eq!(config::normalize_units(&case["input"]), case["expected"]);
    }
}

#[test]
fn hud_temperature_projection_accepts_only_celsius_or_fahrenheit() {
    for (temperature, expected) in [
        (Value::Null, "C"),
        (json!(""), "C"),
        (json!("c"), "C"),
        (json!("f"), "C"),
        (json!("°F"), "C"),
        (json!("K"), "C"),
        (json!(true), "C"),
        (json!(32), "C"),
        (json!({}), "C"),
        (json!([]), "C"),
        (json!("C"), "C"),
        (json!("F"), "F"),
    ] {
        let hud = json!({
            "followAppUnits": false,
            "units": {"speed":"mph","boostPressure":"psi","torque":"lbft","power":"kw","temperature":temperature}
        });
        let projected = config::hud_for_frontend(&hud, &json!({"units":{"temperature":"F"}}));
        let expected_units = json!({"speed":"mph","boostPressure":"psi","torque":"lbft","power":"kw","temperature":expected});
        assert_eq!(projected["units"], expected_units);
        assert_eq!(projected["effectiveUnits"], expected_units);
        assert_eq!(projected["effectiveUnit"], "mph");

        let inherited = config::hud_for_frontend(
            &json!({"followAppUnits":true,"units":{"temperature":"F"}}),
            &json!({"units":{"temperature":temperature}}),
        );
        assert_eq!(inherited["units"]["temperature"], "F");
        assert_eq!(inherited["effectiveUnits"]["temperature"], expected);
    }
    let legacy = config::hud_for_frontend(&json!({}), &json!({}));
    assert_eq!(legacy["units"]["temperature"], "C");
    assert_eq!(legacy["effectiveUnits"]["temperature"], "C");
    let missing_app_temperature = config::hud_for_frontend(
        &json!({"followAppUnits":true,"units":{"temperature":"F"}}),
        &json!({}),
    );
    assert_eq!(
        missing_app_temperature["effectiveUnits"]["temperature"],
        "C"
    );
}

#[test]
fn hud_temperature_survives_restart_and_tracks_app_changes_only_when_inherited() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    assert_eq!(service.hud()["units"]["temperature"], "C");
    assert_eq!(service.hud()["effectiveUnits"]["temperature"], "C");
    let mut receiver = service.overlay.subscribe();
    let independent = json!({
        "hudStyle":"r34_mfd", "followAppUnits":false,
        "units":{"speed":"mph","boostPressure":"psi","torque":"lbft","power":"kw","temperature":"F"},
        "effectiveUnit":"kmh", "effectiveUnits":{"temperature":"C"}, "futureKey":42
    });
    service
        .handle("POST", "/api/overlay/config", &independent)
        .unwrap()
        .unwrap();
    let relayed = receiver.try_recv().unwrap();
    assert_eq!(relayed["data"]["effectiveUnits"], independent["units"]);
    let persisted = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert_eq!(persisted["units"], independent["units"]);
    assert_eq!(persisted["futureKey"], 42);
    assert!(persisted.get("effectiveUnit").is_none());
    assert!(persisted.get("effectiveUnits").is_none());

    let restarted = ConfigService::new(directory.path()).unwrap();
    let mut receiver = restarted.overlay.subscribe();
    let mut readback = restarted.hud();
    assert_eq!(readback["effectiveUnits"], independent["units"]);
    readback["followAppUnits"] = json!(true);
    restarted
        .handle("POST", "/api/overlay/config", &readback)
        .unwrap()
        .unwrap();
    let inherited = receiver.try_recv().unwrap();
    assert_eq!(inherited["data"]["units"]["temperature"], "F");
    assert_eq!(inherited["data"]["effectiveUnits"]["temperature"], "C");

    for (speed, temperature) in [("mph", "F"), ("kmh", "C")] {
        restarted
            .handle("POST", "/api/settings", &json!({"units":{"speed":speed}}))
            .unwrap()
            .unwrap();
        let updated = receiver.try_recv().unwrap();
        assert_eq!(
            updated["data"]["effectiveUnits"]["temperature"],
            temperature
        );
        assert_eq!(updated["data"]["units"]["temperature"], "F");
    }
    readback["followAppUnits"] = json!(false);
    restarted
        .handle("POST", "/api/overlay/config", &readback)
        .unwrap()
        .unwrap();
    let independent_again = receiver.try_recv().unwrap();
    assert_eq!(
        independent_again["data"]["effectiveUnits"],
        independent["units"]
    );
    let persisted = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert_eq!(persisted["units"]["temperature"], "F");
    assert!(persisted.get("effectiveUnits").is_none());
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
fn lfa_expansion_settings_round_trip_restart_reset_and_relay() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    let mut receiver = service.overlay.subscribe();
    for manual in [false, true] {
        for automatic in [false, true] {
            let config = json!({"hudStyle":"lfa_center_ring", "lfaManualExpand":manual,
                "lfaAutoExpand":automatic, "futureField":{"keep":3}});
            service
                .handle("POST", "/api/overlay/config", &config)
                .unwrap()
                .unwrap();
            let disk = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
            assert_eq!(disk, config);
            let notification = receiver.try_recv().unwrap();
            assert_eq!(notification["type"], "hud:config");
            assert_eq!(notification["data"]["lfaManualExpand"], manual);
            assert_eq!(notification["data"]["lfaAutoExpand"], automatic);
            let restarted = ConfigService::new(directory.path()).unwrap();
            let read = restarted
                .handle("GET", "/api/overlay/config", &Value::Null)
                .unwrap()
                .unwrap();
            assert_eq!(read["lfaManualExpand"], manual);
            assert_eq!(read["lfaAutoExpand"], automatic);
            assert_eq!(read["futureField"], config["futureField"]);
        }
    }
    service
        .handle("POST", "/api/overlay/reset", &Value::Null)
        .unwrap()
        .unwrap();
    let reset = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(reset["lfaManualExpand"], false);
    assert_eq!(reset["lfaAutoExpand"], false);
    let notification = receiver.try_recv().unwrap();
    assert_eq!(notification["data"]["lfaManualExpand"], false);
    assert_eq!(notification["data"]["lfaAutoExpand"], false);
}

#[test]
fn lfa_switches_require_booleans_and_leave_other_styles_untouched() {
    let missing = config::normalize_hud(&json!({"hudStyle":"lfa_center_ring"}));
    assert_eq!(missing["lfaManualExpand"], false);
    assert_eq!(missing["lfaAutoExpand"], false);
    for invalid in [
        Value::Null,
        json!(0),
        json!(1),
        json!("true"),
        json!("false"),
        json!([]),
        json!({}),
    ] {
        let normalized = config::normalize_hud(&json!({"hudStyle":"lfa_center_ring",
            "lfaManualExpand":invalid, "lfaAutoExpand":invalid}));
        assert_eq!(normalized["lfaManualExpand"], false);
        assert_eq!(normalized["lfaAutoExpand"], false);
    }
    for style in ["simple", "vfd", "classic_jdm", "custom_style"] {
        let other = json!({"hudStyle":style, "lfaManualExpand":"leave alone",
            "lfaAutoExpand":true, "futureField":3});
        assert_eq!(config::normalize_hud(&other), other);
    }
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

#[test]
fn r34_settings_normalize_persist_restart_and_relay_without_touching_other_styles() {
    let invalid = json!({"hudStyle":"r34_mfd","r34MfdMode":"bad","r34ShowCluster":"false","r34Lighting":12,"futureKey":42});
    let normalized = config::normalize_hud(&invalid);
    assert_eq!(normalized["r34MfdMode"], "single");
    assert_eq!(normalized["r34ShowCluster"], true);
    assert_eq!(normalized["r34Lighting"], "night");
    assert_eq!(normalized["futureKey"], 42);
    let other = json!({"hudStyle":"vfd","r34MfdMode":"future"});
    assert_eq!(config::normalize_hud(&other), other);
    for mode in ["single", "twin", "multi", "g", "lap"] {
        let directory = tempfile::tempdir().unwrap();
        let service = ConfigService::new(directory.path()).unwrap();
        let mut receiver = service.overlay.subscribe();
        let requested = json!({"hudStyle":"r34_mfd","r34MfdMode":mode,"r34ShowCluster":false,"r34Lighting":"day","futureKey":42});
        service
            .handle("POST", "/api/overlay/config", &requested)
            .unwrap()
            .unwrap();
        let relayed = receiver.try_recv().unwrap();
        assert_eq!(relayed["type"], "hud:config");
        assert_eq!(relayed["data"]["r34MfdMode"], mode);
        assert_eq!(relayed["data"]["r34ShowCluster"], false);
        assert_eq!(relayed["data"]["r34Lighting"], "day");
        let persisted = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
        assert_eq!(persisted["r34MfdMode"], mode);
        assert_eq!(persisted["futureKey"], 42);
        let restarted = ConfigService::new(directory.path()).unwrap();
        let readback = restarted
            .handle("GET", "/api/overlay/config", &Value::Null)
            .unwrap()
            .unwrap();
        assert_eq!(readback["r34MfdMode"], mode);
        assert_eq!(readback["r34Lighting"], "day");
        assert_eq!(readback["r34ShowCluster"], false);
    }
}
