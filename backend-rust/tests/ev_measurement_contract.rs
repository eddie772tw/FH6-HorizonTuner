use fh6_backend::tuning::{
    ev::{ready, EvGearMeasurement},
    ev_measurement::{advance, batch, initial},
};
use serde_json::{json, Value};
fn frame(t: u64) -> Value {
    json!({"TimestampMS":t,"CarOrdinal":3445,"CarPerformanceIndex":795,"CarClass":2,"EngineMaxRpm":17000,"EngineIdleRpm":0,"CurrentEngineRpm":10000,"Gear":1,"AccelInput":255,"BrakeInput":0,"ClutchInput":0,"HandBrakeInput":0,"SteerInput":0,"PowerWatts":560000,"TorqueNewtons":535,"SpeedMetersPerSecond":22,"WheelRotationSpeed":[65,65,65,65],"TireSlipRatio":[0,0,0,0]})
}
#[test]
fn rust_ev_rejects_regen_controls_missing_channels_identity_and_clock_changes() {
    let base = advance(&initial("3445"), &frame(0));
    assert_eq!(
        advance(&base, &frame(350))["gears"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    for (key, value) in [
        ("PowerWatts", Value::Null),
        ("PowerWatts", json!(-1000)),
        ("TorqueNewtons", json!(-10)),
        ("BrakeInput", json!(1)),
        ("ClutchInput", json!(1)),
        ("HandBrakeInput", json!(1)),
        ("AccelInput", json!(0)),
        ("CurrentEngineRpm", json!(0)),
    ] {
        let mut f = frame(350);
        f[key] = value;
        assert!(
            advance(&base, &f)["gears"].as_array().unwrap().is_empty(),
            "{key}"
        );
    }
    let observed = advance(&base, &frame(350));
    assert_eq!(advance(&observed, &frame(350)), observed);
    assert_eq!(
        advance(&observed, &frame(349))["guidance"],
        "session-restarted"
    );
    for (key, value) in [
        ("CarOrdinal", 4257),
        ("CarPerformanceIndex", 800),
        ("CarClass", 3),
    ] {
        let mut f = frame(400);
        f[key] = json!(value);
        let blocked = advance(&observed, &f);
        assert_eq!(blocked["status"], "blocked");
        assert_eq!(advance(&blocked, &frame(450)), blocked);
    }
}
#[test]
fn rust_ev_plateau_is_not_cutoff_and_mapping_channels_cannot_be_manufactured() {
    let mut state = advance(&initial("3445"), &frame(0));
    for t in (350..=10000).step_by(50) {
        state = advance(&state, &frame(t));
    }
    let gear: EvGearMeasurement = serde_json::from_value(state["gears"][0].clone()).unwrap();
    assert_eq!(gear.cutoff.count, 0);
    assert!(!ready(&gear));
    for key in [
        "WheelRotationSpeed",
        "TireSlipRatio",
        "SteerInput",
        "SpeedMetersPerSecond",
    ] {
        let base = advance(&initial("3445"), &frame(0));
        let mut f = frame(350);
        f.as_object_mut().unwrap().remove(key);
        let first = advance(&base, &f);
        f["TimestampMS"] = json!(10000);
        let next = advance(&first, &f);
        assert_eq!(next["gears"][0]["rpmPerKmh"]["count"], 0, "{key}");
        assert_eq!(next["gears"][0]["acceptedMs"], 0.0);
    }
    let mut f = frame(350);
    f["TireSlipRatio"] = json!([2, 2, 0, 0]);
    let next = advance(&advance(&initial("3445"), &frame(0)), &f);
    assert_eq!(next["gears"][0]["rpmPerKmh"]["count"], 0);
}
#[test]
fn rust_ev_unstable_mapping_is_unavailable_with_owner_diagnostics() {
    let golden: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/ev_golden_fixtures.json")).unwrap();
    let mut g: EvGearMeasurement =
        serde_json::from_value(golden[0]["input"]["measurements"][0].clone()).unwrap();
    assert!(ready(&g));
    g.rpm_per_kmh.m2 = 1e12;
    assert!(!ready(&g));
    assert!(fh6_backend::tuning::ev::qualification_reasons(&g)
        .contains(&"EV needs stable low-slip speed data and steering channels"));
}
#[test]
fn rust_ev_batch_explains_missing_output_even_without_a_gear_aggregate() {
    let mut f = frame(350);
    f.as_object_mut().unwrap().remove("PowerWatts");
    let result = batch(
        &json!({"schemaVersion":"ev-batch/v1","state":initial("3445"),"frames":[frame(0),f]}),
    )
    .unwrap();
    assert!(result["readyGears"].as_array().unwrap().is_empty());
    assert!(result["warnings"]
        .as_array()
        .unwrap()
        .contains(&json!("EV raw frames are missing required channels")));
    assert!(result["warnings"].as_array().unwrap().contains(&json!(
        "EV needs forward full-throttle positive output without brake, clutch or regeneration"
    )));
}
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
    let mut chunked = initial("3445");
    for chunk in frames.chunks(1200) {
        chunked = batch(&json!({"schemaVersion":"ev-batch/v1","state":chunked,"frames":chunk}))
            .unwrap()["state"]
            .clone();
    }
    assert_eq!(chunked, state);
}
#[test]
fn ev_batch_preserves_ordering_and_mid_batch_blocking_parity_with_advance() {
    let make = |t: u64, gear: u64, rpm: f64| {
        let mut f = frame(t);
        f["Gear"] = json!(gear);
        f["CurrentEngineRpm"] = json!(rpm);
        f
    };
    // Reverse gear order (2 -> 1), descending RPM bins, then mid-batch clock regression + trailing frame.
    let seq = vec![
        make(0, 2, 12000.0),
        make(350, 2, 12000.0),
        make(400, 2, 8000.0),
        make(450, 2, 12200.0),
        make(500, 1, 9000.0),
        make(850, 1, 9000.0),
        make(900, 1, 4000.0),
        make(880, 1, 5000.0),
        make(1000, 1, 6000.0),
    ];
    let mut step_state = initial("3445");
    for f in &seq {
        step_state = advance(&step_state, f);
    }
    let batched =
        batch(&json!({"schemaVersion":"ev-batch/v1","state":initial("3445"),"frames":seq}))
            .unwrap();
    assert_eq!(batched["state"], step_state);
    assert_eq!(batched["state"]["status"], "blocked");
    assert_eq!(batched["state"]["guidance"], "session-restarted");
    let gears: Vec<EvGearMeasurement> =
        serde_json::from_value(batched["state"]["gears"].clone()).unwrap();
    assert_eq!(gears.iter().map(|g| g.gear).collect::<Vec<_>>(), vec![1, 2]);
    assert!(gears
        .iter()
        .all(|g| g.curve.windows(2).all(|w| w[0].rpm < w[1].rpm)));
    let already_blocked = batch(
        &json!({"schemaVersion":"ev-batch/v1","state":batched["state"],"frames":[make(1500, 1, 7000.0)]}),
    )
    .unwrap();
    assert_eq!(already_blocked["state"], batched["state"]);
}
