use fh6_backend::tuning::profile::{ev_profile, ev_ready, exploration, normalize};
use serde_json::{json, Value};
#[test]
fn desktop_defaults_preserve_null_zero_and_valid_subunit_ranges() {
    let defaults: Value =
        serde_json::from_str(include_str!("../src/tuning/profile_defaults.json")).unwrap();
    let normalized = normalize(
        &json!({"weight":null,"spring_front_min":0.25,"spring_rear_min":0,"adjustability":{"gears":null}}),
    );
    assert_eq!(normalized["weight"], defaults["weight"]);
    assert_eq!(normalized["spring_front_min"], 0.25);
    assert_eq!(normalized["spring_rear_min"], 0);
    assert_eq!(
        normalized["adjustability"]["gears"],
        defaults["adjustability"]["gears"]
    );
}
#[test]
fn unknown_ev_ratios_remain_unknown_and_invalid_setup_is_unavailable() {
    let mut raw = json!({"isElectric":true,"evGearbox":{"finalDrive":null,"gearRatios":[4,null,1],"gearAdjustable":[true,false,true],"allForwardGearsConfirmed":true}});
    assert!(ev_ready(&raw));
    assert!(ev_profile(&raw)["evGearbox"]["finalDrive"].is_null());
    assert!(ev_profile(&raw)["evGearbox"]["gearRatios"][1].is_null());
    raw["evGearbox"]["gearRatios"] = json!([1, 2]);
    assert!(!ev_ready(&raw));
    raw["evGearbox"]["gearRatios"] = json!([0]);
    assert!(!ev_ready(&raw));
    raw["evGearbox"]["gearRatios"] = json!([]);
    assert!(!ev_ready(&raw));
}
#[test]
fn exploration_requires_confirmed_range_grid_and_available_click() {
    let mut input =
        json!({"direction":1,"setting":{"value":3.5,"minimum":2,"maximum":6.1,"step":0.01}});
    assert_eq!(exploration(&input), Some(3.51));
    input["setting"]["value"] = json!(6.1);
    assert_eq!(exploration(&input), None);
    input["setting"]["value"] = json!(3.501);
    assert_eq!(exploration(&input), None);
    input["setting"]["step"] = Value::Null;
    assert_eq!(exploration(&input), None);
}

#[test]
fn dyno_guidance_peaks_and_gear_recommendations_have_backend_owners() {
    use fh6_backend::tuning::dyno_guidance::{guidance, import_peaks, recommended_gear};
    let frame = json!({"Gear":4,"CurrentEngineRpm":2100,"EngineMaxRpm":8000,"AccelInput":255,"TireSlipRatio":[0,0,0.11,0]});
    let g = guidance(&frame, &json!({}), &json!({"drivetrain":"RWD"}));
    assert_eq!(g["start"], true);
    assert_eq!(g["slipped"], true);
    assert_eq!(g["completed"], false);
    let peaks =
        import_peaks(&json!({"900":{"hp":100.5,"torque":200},"1000":{"hp":100.5,"torque":201}}));
    assert_eq!(
        peaks,
        json!({"maxHp":101.0,"maxTorque":201.0,"maxHpRpm":900,"maxTorqueRpm":1000})
    );
    assert_eq!(
        recommended_gear(&json!({"gearing":{"gears":[4,2,1.2,0.9]},"gears":4}))["gear"],
        4
    );
    assert!(recommended_gear(&json!({"gearing":{"gears":[]}})).is_null());
}
