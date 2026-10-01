use fh6_backend::tuning::tire_evidence::observe;
use serde_json::{json, Value};
fn sample(t: i64) -> Value {
    json!({"carOrdinal":1,"performanceIndex":700,"carClass":3,"timestampMS":t,"isRaceOn":1,"speedMps":20,"gear":2,"brakeInput":0,"handBrakeInput":0,"clutchInput":0,"accelInput":255,"steerInput":0,"accelerationX":0,"accelerationZ":4,"pitch":0,"roll":0,"tireSlipRatio":[0,0,0,0],"tireTemp":[80,81,82,83],"normalizedSuspensionTravel":[0.5,0.5,0.5,0.5]})
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
