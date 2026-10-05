use fh6_backend::{config, config_service::ConfigService, storage};
use serde_json::{json, Value};

#[test]
fn stack_normalization_is_strict_scoped_and_preserves_future_settings() {
    let defaults = config::normalize_hud(&json!({"hudStyle":"stack_st8100"}));
    assert_eq!(config::normalize_hud(&defaults), defaults);
    let unrelated = json!({"hudStyle":"vfd","glowIntensity":1.4,"future":{"keep":true}});
    assert_eq!(config::normalize_hud(&unrelated), unrelated);
    let inactive = config::normalize_hud(&json!({
        "hudStyle":"simple","stackSt8100ShiftPercent":"75",
        "stackSt8100FuelWarningEnabled":"false","future":[1,2]
    }));
    assert_eq!(inactive["stackSt8100ShiftPercent"], 90);
    assert_eq!(inactive["stackSt8100FuelWarningEnabled"], false);
    assert!(inactive.get("stackSt8100Dial").is_none());
    assert_eq!(inactive["future"], json!([1, 2]));

    for invalid in [Value::Null, json!(true), json!("75"), json!([]), json!({})] {
        let normalized = config::normalize_hud(&json!({
            "hudStyle":"stack_st8100","stackSt8100ShiftPercent":invalid,
            "stackSt8100FuelWarningPercent":invalid,"stackSt8100TireWarningC":invalid,
            "stackSt8100BoostWarningBar":invalid,"stackSt8100Field1":invalid
        }));
        assert_eq!(normalized["stackSt8100ShiftPercent"], 90);
        assert_eq!(normalized["stackSt8100FuelWarningPercent"], 10);
        assert_eq!(normalized["stackSt8100TireWarningC"], 120);
        assert_eq!(normalized["stackSt8100BoostWarningBar"], 1.5);
        assert_eq!(normalized["stackSt8100Field1"], "speed");
    }
    let normalized = config::normalize_hud(&json!({
        "hudStyle":"stack_st8100","stackSt8100ShiftPercent":1,
        "stackSt8100FuelWarningPercent":900,"stackSt8100TireWarningC":500,
        "stackSt8100BoostWarningBar":-5,"stackSt8100ShiftEnabled":"false",
        "stackSt8100FuelWarningEnabled":1,"stackSt8100TireWarningEnabled":{},
        "stackSt8100BoostWarningEnabled":[],"stackSt8100Dial":"invalid",
        "stackSt8100Page":"PEAKS","stackSt8100TemperatureUnit":"F"
    }));
    assert_eq!(normalized["stackSt8100ShiftPercent"], 50.0);
    assert_eq!(normalized["stackSt8100FuelWarningPercent"], 50.0);
    assert_eq!(normalized["stackSt8100TireWarningC"], 200.0);
    assert_eq!(normalized["stackSt8100BoostWarningBar"], 0.1);
    assert_eq!(normalized["stackSt8100ShiftEnabled"], true);
    assert_eq!(normalized["stackSt8100FuelWarningEnabled"], false);
    assert_eq!(normalized["stackSt8100TireWarningEnabled"], false);
    assert_eq!(normalized["stackSt8100BoostWarningEnabled"], false);
    assert_eq!(normalized["stackSt8100Dial"], "auto");
    assert_eq!(normalized["stackSt8100Page"], "live");
    assert_eq!(normalized["stackSt8100TemperatureUnit"], "c");
    assert_eq!(config::normalize_hud(&normalized), normalized);
}

#[test]
fn stack_post_disk_relay_restart_unit_projection_and_reset_round_trip() {
    let directory = tempfile::tempdir().unwrap();
    let service = ConfigService::new(directory.path()).unwrap();
    service
        .handle("POST", "/api/settings", &json!({"units":{"speed":"mph"}}))
        .unwrap()
        .unwrap();
    let mut receiver = service.overlay.subscribe();
    let custom = json!({
        "hudStyle":"stack_st8100","enabled":true,"followAppUnits":true,
        "units":{"speed":"kmh","boostPressure":"bar","torque":"nm","power":"hp"},
        "stackSt8100Field1":"current_lap","stackSt8100Field2":"last_lap",
        "stackSt8100Field3":"peak_rpm","stackSt8100Field4":"peak_speed",
        "stackSt8100Page":"peaks","stackSt8100TemperatureUnit":"f",
        "stackSt8100Dial":"0-6-13","stackSt8100ShiftEnabled":false,
        "stackSt8100ShiftPercent":95,"stackSt8100FuelWarningEnabled":true,
        "stackSt8100FuelWarningPercent":7,"stackSt8100TireWarningEnabled":true,
        "stackSt8100TireWarningC":110,"stackSt8100BoostWarningEnabled":true,
        "stackSt8100BoostWarningBar":1.8,"future":{"keep":3},
        "classicJdmTachStyle":"defi","effectiveUnits":{"boostPressure":"psi"}
    });
    let result = service
        .handle("POST", "/api/overlay/config", &custom)
        .unwrap()
        .unwrap();
    assert_eq!(result["success"], true);
    let disk = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert_eq!(disk["stackSt8100TireWarningC"], 110.0);
    assert_eq!(disk["stackSt8100BoostWarningBar"], 1.8);
    assert_eq!(disk["stackSt8100Dial"], "0-6-13");
    assert!(disk.get("effectiveUnits").is_none());
    assert_eq!(disk["future"], json!({"keep":3}));
    assert_eq!(disk["classicJdmTachStyle"], "defi");
    let relay = receiver.try_recv().unwrap();
    assert_eq!(relay["type"], "hud:config");
    assert_eq!(relay["data"]["effectiveUnits"]["boostPressure"], "psi");
    for (key, value) in disk.as_object().unwrap() {
        assert_eq!(&relay["data"][key], value, "relay changed {key}");
    }
    let restarted = ConfigService::new(directory.path()).unwrap();
    let readback = restarted
        .handle("GET", "/api/overlay/config", &Value::Null)
        .unwrap()
        .unwrap();
    assert_eq!(readback, relay["data"]);

    let mut inactive = disk.clone();
    inactive["hudStyle"] = json!("simple");
    restarted
        .handle("POST", "/api/overlay/config", &inactive)
        .unwrap()
        .unwrap();
    assert_eq!(restarted.hud()["stackSt8100Page"], "peaks");
    inactive["hudStyle"] = json!("stack_st8100");
    restarted
        .handle("POST", "/api/overlay/config", &inactive)
        .unwrap()
        .unwrap();
    assert_eq!(restarted.hud()["stackSt8100Field4"], "peak_speed");

    restarted
        .handle("POST", "/api/overlay/reset", &Value::Null)
        .unwrap()
        .unwrap();
    let reset = storage::read_json(&directory.path().join("hud_config.json")).unwrap();
    assert!(reset.get("stackSt8100Page").is_none());
    let mut selected = reset;
    selected["hudStyle"] = json!("stack_st8100");
    restarted
        .handle("POST", "/api/overlay/config", &selected)
        .unwrap()
        .unwrap();
    let restored = ConfigService::new(directory.path()).unwrap().hud();
    assert_eq!(restored["stackSt8100Page"], "live");
    assert_eq!(restored["stackSt8100Dial"], "auto");
    assert_eq!(restored["stackSt8100Field1"], "speed");
    assert_eq!(restored["stackSt8100FuelWarningEnabled"], false);
    assert_eq!(restored["stackSt8100TireWarningEnabled"], false);
    assert_eq!(restored["stackSt8100BoostWarningEnabled"], false);
}
