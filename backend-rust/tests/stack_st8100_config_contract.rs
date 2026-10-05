use fh6_backend::{config, config_service::ConfigService, storage};
use serde_json::{json, Value};

const LEGACY: [&str; 6] = [
    "stackSt8100FuelWarningEnabled",
    "stackSt8100FuelWarningPercent",
    "stackSt8100TireWarningEnabled",
    "stackSt8100TireWarningC",
    "stackSt8100BoostWarningEnabled",
    "stackSt8100BoostWarningBar",
];

#[test]
fn stack_revised_defaults_strict_alarms_and_inactive_isolation() {
    let defaults = config::normalize_hud(&json!({"hudStyle":"stack_st8100"}));
    assert_eq!(config::normalize_hud(&defaults), defaults);
    assert_eq!(defaults["stackSt8100Field3"], "race_time");
    assert_eq!(defaults["stackSt8100Face"], "black");
    let alarms = defaults["stackSt8100Alarms"].as_array().unwrap();
    assert_eq!(alarms.len(), 3);
    assert!(alarms.iter().all(|alarm| alarm["enabled"] == false));
    let unrelated = json!({"hudStyle":"vfd","future":{"keep":true}});
    assert_eq!(config::normalize_hud(&unrelated), unrelated);
    assert_eq!(
        config::normalize_hud(&json!({"hudStyle":"vfd","stackSt8100FuelWarningEnabled":true})),
        json!({"hudStyle":"vfd"})
    );
    for invalid in [Value::Null, json!(true), json!("120"), json!([]), json!({})] {
        let value = config::normalize_hud(&json!({"hudStyle":"stack_st8100", "stackSt8100Alarms":[
            {"enabled":"true","metric":["speed"],"direction":["low"],"threshold":invalid}, null, [], {"enabled":true}
        ], "stackSt8100ShiftPercent":invalid, "stackSt8100Face":["white"]}));
        assert_eq!(value["stackSt8100Alarms"], defaults["stackSt8100Alarms"]);
        assert_eq!(value["stackSt8100ShiftPercent"], 90);
        assert_eq!(value["stackSt8100Face"], "black");
    }
    for (metric, minimum, maximum) in [
        ("rpm", 0.0, 30000.0),
        ("speed", 0.0, 1440.0),
        ("tire_avg", -100.0, 800.0),
        ("tire_max", -100.0, 800.0),
        ("boost", -1.0, 10.0),
        ("power", -2000.0, 20000.0),
        ("torque", -100000.0, 100000.0),
        ("throttle", 0.0, 100.0),
        ("brake", 0.0, 100.0),
    ] {
        let value = config::normalize_hud(&json!({"hudStyle":"stack_st8100","stackSt8100Alarms":[
            {"metric":metric,"enabled":true,"direction":"low","threshold":-1e9},
            {"metric":metric,"threshold":1e9}
        ]}));
        assert_eq!(value["stackSt8100Alarms"][0]["threshold"], minimum);
        assert_eq!(value["stackSt8100Alarms"][1]["threshold"], maximum);
        assert_eq!(value["stackSt8100Alarms"][0]["enabled"], true);
        assert_eq!(value["stackSt8100Alarms"][0]["direction"], "low");
        assert_eq!(config::normalize_hud(&value), value);
    }
}

#[test]
fn stack_legacy_migration_retains_meaning_and_new_array_takes_precedence() {
    let legacy = json!({"hudStyle":"simple","stackSt8100Field1":"fuel","stackSt8100Field2":"fuel", "stackSt8100Field3":"fuel","stackSt8100Field4":"fuel",
        "stackSt8100FuelWarningEnabled":true,"stackSt8100FuelWarningPercent":10,"stackSt8100TireWarningEnabled":true,
        "stackSt8100TireWarningC":135,"stackSt8100BoostWarningEnabled":true,"stackSt8100BoostWarningBar":2.2,"future":5});
    let migrated = config::normalize_hud(&legacy);
    for field in [
        "stackSt8100Field1",
        "stackSt8100Field2",
        "stackSt8100Field3",
        "stackSt8100Field4",
    ] {
        assert_eq!(migrated[field], "race_time");
    }
    for key in LEGACY {
        assert!(migrated.get(key).is_none());
    }
    assert!(migrated.get("stackSt8100Face").is_none());
    assert_eq!(migrated["future"], 5);
    assert_eq!(
        migrated["stackSt8100Alarms"][0],
        json!({"metric":"tire_max","enabled":true,"direction":"high","threshold":135})
    );
    assert_eq!(
        migrated["stackSt8100Alarms"][1],
        json!({"metric":"boost","enabled":true,"direction":"high","threshold":2.2})
    );
    let mut current = legacy.clone();
    current["stackSt8100Alarms"] =
        json!([{"metric":"brake","enabled":true,"direction":"low","threshold":20}]);
    assert_eq!(
        config::normalize_hud(&current)["stackSt8100Alarms"][0],
        current["stackSt8100Alarms"][0]
    );
    current["stackSt8100Alarms"] = Value::Null;
    assert_eq!(
        config::normalize_hud(&current)["stackSt8100Alarms"][0]["enabled"],
        false
    );
}

#[test]
fn stack_post_disk_relay_restart_units_and_reset_round_trip() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service
        .handle("POST", "/api/settings", &json!({"units":{"speed":"mph"}}))
        .unwrap()
        .unwrap();
    let mut receiver = service.overlay.subscribe();
    let custom = json!({"hudStyle":"stack_st8100","enabled":true,"followAppUnits":true,
        "units":{"speed":"kmh","boostPressure":"bar","power":"kw","torque":"nm"},
        "stackSt8100Face":"white","stackSt8100Dial":"0-3-10.5","stackSt8100Page":"peaks","stackSt8100TemperatureUnit":"f",
        "stackSt8100Field1":"power","stackSt8100Field2":"torque","stackSt8100Field3":"race_time","stackSt8100Field4":"throttle",
        "stackSt8100Alarms":[{"metric":"speed","enabled":true,"direction":"high","threshold":180},
            {"metric":"power","enabled":true,"direction":"low","threshold":-20},{"metric":"boost","enabled":true,"direction":"low","threshold":-0.3}],
        "future":{"keep":3},"effectiveUnits":{"boostPressure":"psi"}});
    assert_eq!(
        service
            .handle("POST", "/api/overlay/config", &custom)
            .unwrap()
            .unwrap()["success"],
        true
    );
    let disk = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert_eq!(disk["stackSt8100Alarms"], custom["stackSt8100Alarms"]);
    assert!(disk.get("effectiveUnits").is_none());
    let relay = receiver.try_recv().unwrap();
    assert_eq!(relay["type"], "hud:config");
    assert_eq!(relay["data"]["effectiveUnits"]["boostPressure"], "psi");
    for (key, value) in disk.as_object().unwrap() {
        assert_eq!(&relay["data"][key], value, "relay changed {key}");
    }
    let restarted = ConfigService::new(directory.path()).unwrap();
    assert_eq!(
        restarted
            .handle("GET", "/api/overlay/config", &Value::Null)
            .unwrap()
            .unwrap(),
        relay["data"]
    );
    let mut inactive = disk;
    inactive["hudStyle"] = json!("simple");
    restarted
        .handle("POST", "/api/overlay/config", &inactive)
        .unwrap()
        .unwrap();
    assert_eq!(
        restarted.hud()["stackSt8100Alarms"],
        custom["stackSt8100Alarms"]
    );
    inactive["hudStyle"] = json!("stack_st8100");
    restarted
        .handle("POST", "/api/overlay/config", &inactive)
        .unwrap()
        .unwrap();
    assert_eq!(restarted.hud()["stackSt8100Face"], "white");
    restarted
        .handle("POST", "/api/overlay/reset", &Value::Null)
        .unwrap()
        .unwrap();
    let mut selected = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert!(selected.get("stackSt8100Alarms").is_none());
    selected["hudStyle"] = json!("stack_st8100");
    restarted
        .handle("POST", "/api/overlay/config", &selected)
        .unwrap()
        .unwrap();
    let restored = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(restored["stackSt8100Face"], "black");
    assert_eq!(restored["stackSt8100Dial"], "auto");
    assert_eq!(restored["stackSt8100Field3"], "race_time");
    assert!(restored["stackSt8100Alarms"]
        .as_array()
        .unwrap()
        .iter()
        .all(|alarm| alarm["enabled"] == false));
}

#[test]
fn stack_legacy_post_is_durable_and_does_not_resurrect_retired_keys() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service.handle("POST", "/api/overlay/config", &json!({
        "hudStyle":"simple","stackSt8100Field3":"fuel","stackSt8100TireWarningEnabled":true,
        "stackSt8100TireWarningC":135,"stackSt8100BoostWarningEnabled":false,"stackSt8100BoostWarningBar":2.2,
        "stackSt8100FuelWarningEnabled":true,"stackSt8100FuelWarningPercent":10,"future":{"keep":5}
    })).unwrap().unwrap();
    let disk = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    for key in LEGACY {
        assert!(disk.get(key).is_none());
    }
    assert_eq!(disk["stackSt8100Field3"], "race_time");
    assert!(disk.get("stackSt8100Face").is_none());
    assert_eq!(disk["stackSt8100Alarms"][0]["threshold"], 135);
    assert_eq!(disk["stackSt8100Alarms"][1]["threshold"], 2.2);
    let restarted = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(restarted["stackSt8100Alarms"], disk["stackSt8100Alarms"]);
    assert_eq!(restarted["future"], json!({"keep":5}));
}
