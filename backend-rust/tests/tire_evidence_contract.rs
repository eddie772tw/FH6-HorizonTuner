use fh6_backend::tuning::tire_evidence::observe;
use serde_json::{json, Value};
fn sample(t: i64) -> Value {
    json!({"carOrdinal":1,"performanceIndex":700,"carClass":3,"timestampMS":t,"isRaceOn":1,"speedMps":20,"gear":2,"brakeInput":0,"handBrakeInput":0,"clutchInput":0,"accelInput":255,"steerInput":0,"accelerationX":0,"accelerationZ":4,"pitch":0,"roll":0,"tireSlipRatio":[0,0,0,0],"tireTemp":[80,81,82,83],"normalizedSuspensionTravel":[0.5,0.5,0.5,0.5]})
}
#[test]
fn tire_sample_eligibility_ignores_unreliable_race_flag() {
    let identity = json!({"carOrdinal":1,"performanceIndex":700,"carClass":3});
    let enabled = vec![sample(0), sample(100)];
    let mut disabled = enabled.clone();
    for frame in &mut disabled {
        frame["isRaceOn"] = json!(0);
    }
    let expected = observe(&enabled, &identity);
    assert_eq!(expected["acceptedSampleCount"], 2);
    assert_eq!(observe(&disabled, &identity), expected);
}
#[test]
fn missing_channels_zero_and_discontinuity_keep_unavailable_semantics() {
    let id = json!({"carOrdinal":1,"performanceIndex":700,"carClass":3});
    let s = sample(0);
    let r = observe(&[s.clone()], &id);
    assert_eq!(r["status"], "observed");
    assert_eq!(r["maxObservedNormalizedSlip"], json!(0.0));
    let mut missing = s.clone();
    missing["missingChannels"] = json!(["TireSlipRatio.0"]);
    let r = observe(&[missing], &id);
    assert!(r["maxObservedNormalizedSlip"].is_null());
    assert_eq!(r["status"], "observed");
    let r = observe(&[s, sample(300)], &id);
    assert_eq!(r["status"], "unavailable");
    assert!(r["observedLongitudinalAccelerationMps2"].is_null());
    assert!(r["observedTireTemperature"].is_null());
    let mut bad = sample(0);
    bad["missingChannels"] = Value::Null;
    assert_eq!(observe(&[bad], &id)["acceptedSampleCount"], 0);
}

#[test]
fn missing_channel_prefix_non_string_and_rejection_order_parity() {
    let id = json!({"carOrdinal":1});
    let mut non_matching_prefix = sample(10);
    non_matching_prefix["missingChannels"] = json!(["TireSlipRatioExtra", "AccelInputExtra"]);
    let mut partial_dotted = sample(20);
    partial_dotted["missingChannels"] = json!(["TireTemp.1", "TireSlipRatio."]);
    let mut airborne = sample(30);
    airborne["tireSlipRatio"] = json!([0.0, 0.0, 0.0]);
    airborne["missingChannels"] = json!(["TireTemp"]);
    airborne["normalizedSuspensionTravel"] = json!([0.01, 0.5, 0.5, 0.5]);
    let mut non_string_missing = sample(40);
    non_string_missing["missingChannels"] = json!([123]);

    let out = observe(
        &[
            non_matching_prefix,
            partial_dotted,
            airborne,
            non_string_missing,
        ],
        &id,
    );
    assert_eq!(out["acceptedSampleCount"], 2);
    assert_eq!(out["status"], "observed");
    assert_eq!(out["observedLongitudinalAccelerationMps2"], json!(4.0));
    assert!(out["maxObservedNormalizedSlip"].is_null());
    assert!(out["observedTireTemperature"].is_null());
    assert_eq!(
        out["unavailableReasons"],
        json!([
            "slip-unavailable",
            "temperature-unavailable",
            "airborne-or-suspension-invalid",
            "required-scalar-unavailable",
            "slip-unavailable"
        ])
    );
}

#[test]
#[ignore = "release-only microbenchmark; no timing pass threshold"]
fn bench_tire_evidence_observe_release() {
    assert!(!cfg!(debug_assertions), "Use cargo test --release");
    let plain: Vec<Value> = (0..10_000).map(|i| sample(i * 16)).collect();
    let mut with_missing = plain.clone();
    for s in &mut with_missing {
        s["missingChannels"] = json!(["AngularVelocityX", "AngularVelocityY", "AngularVelocityZ"]);
    }
    let id = json!({"carOrdinal":1,"performanceIndex":700,"carClass":3});
    for name_and_data in [("plain_10k", &plain), ("missing_10k", &with_missing)] {
        std::hint::black_box(observe(name_and_data.1, &id));
        let mut samples_ms = (0..7)
            .map(|_| {
                let start = std::time::Instant::now();
                let res = std::hint::black_box(observe(std::hint::black_box(name_and_data.1), &id));
                assert_eq!(res["acceptedSampleCount"], 10_000);
                start.elapsed().as_secs_f64() * 1000.0
            })
            .collect::<Vec<_>>();
        samples_ms.sort_by(f64::total_cmp);
        println!(
            "{} median_ms={:.3} samples={:?}",
            name_and_data.0, samples_ms[3], samples_ms
        );
    }
}
