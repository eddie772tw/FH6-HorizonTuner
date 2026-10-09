use fh6_backend::tuning::{
    ev::{ready, EvGearMeasurement},
    ev_measurement::{advance, batch, initial},
};
use serde_json::{json, Value};
#[test]
fn real_ev_replay_qualification_ignores_unreliable_race_flag() {
    let replay: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_taycan_replay.json")).unwrap();
    let mut enabled = initial("3445");
    let mut disabled = enabled.clone();
    for row in replay["runs"][0]["rows"].as_array().unwrap() {
        let mut frame = Value::Object(
            replay["columns"]
                .as_array()
                .unwrap()
                .iter()
                .zip(row.as_array().unwrap())
                .map(|(k, v)| (k.as_str().unwrap().to_owned(), v.clone()))
                .collect(),
        );
        frame["IsRaceOn"] = json!(1);
        enabled = advance(&enabled, &frame);
        frame["IsRaceOn"] = json!(0);
        disabled = advance(&disabled, &frame);
    }
    assert_eq!(enabled["gears"].as_array().unwrap().len(), 2);
    assert_eq!(disabled, enabled);
}
#[test]
fn taycan_replay_preserves_gear_evidence_and_qualifies_two_gears() {
    let replay: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_taycan_replay.json")).unwrap();
    let expected: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    let mut state = initial("3445");
    let mut frames = vec![];
    for row in replay["runs"][0]["rows"].as_array().unwrap() {
        let f = Value::Object(
            replay["columns"]
                .as_array()
                .unwrap()
                .iter()
                .zip(row.as_array().unwrap())
                .map(|(k, v)| (k.as_str().unwrap().to_owned(), v.clone()))
                .collect(),
        );
        state = advance(&state, &f);
        frames.push(f);
    }
    let gears: Vec<EvGearMeasurement> = serde_json::from_value(state["gears"].clone()).unwrap();
    assert_eq!(gears.len(), 2);
    assert!(gears.iter().all(ready));
    for (i, g) in gears.iter().enumerate() {
        let old = &expected[0]["input"]["measurements"][i];
        assert_eq!(g.accepted_ms, old["acceptedMs"].as_f64().unwrap());
        assert_eq!(
            g.positive_samples,
            old["positiveSamples"].as_u64().unwrap() as usize
        );
        assert_eq!(
            g.zero_output_samples,
            old["zeroOutputSamples"].as_u64().unwrap() as usize
        );
        assert!((g.rpm_per_kmh.mean - old["rpmPerKmh"]["mean"].as_f64().unwrap()).abs() < 1e-12);
    }
    let result =
        batch(&json!({"schemaVersion":"ev-batch/v1","state":initial("3445"),"frames":frames}))
            .unwrap();
    assert_eq!(result["state"], state);
    assert_eq!(result["readyGears"], json!([1, 2]));
    assert!(batch(&json!({"schemaVersion":"future","state":state,"frames":[]})).is_err());
}
