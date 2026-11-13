//! Freeze defects as history, not as correctness requirements for new models.
use fh6_backend::tuning::{
    calculate_aego_gearing, calculate_chassis_tuning,
    workflow::{measured_gearing, MeasuredEngine},
    GearingSecondaryCorrection, RaceGoal, TuningCarParams,
};
use serde_json::{json, Value};

#[test]
fn source_recorded_rust_replays_preserve_all_formal_gearing_and_chassis_outputs() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_rust_characterization_v1.json"
    ))
    .unwrap();
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 11);
    for case in cases {
        let input = &case["inputs"];
        let goal: RaceGoal = serde_json::from_value(case["goal"].clone()).unwrap();
        let profile: TuningCarParams = serde_json::from_value(input["carParams"].clone()).unwrap();
        let correction: Option<GearingSecondaryCorrection> =
            serde_json::from_value(input["secondaryCorrection"].clone()).unwrap();
        let count = input["numGears"].as_u64().unwrap() as usize;
        let rpm = input["maxRpm"].as_f64().unwrap();
        let result = calculate_aego_gearing(goal, count, &profile, rpm, correction.as_ref());
        let measured = measured_gearing(
            goal,
            count,
            &profile,
            Some(
                &serde_json::from_value::<MeasuredEngine>(input["measuredEngine"].clone()).unwrap(),
            ),
        );
        let actual = json!({"gearing":result,"measuredGearing":measured,"chassis":calculate_chassis_tuning(goal,&profile)});
        assert_eq!(actual, case["expected"], "{}", case["id"]);
    }
}
