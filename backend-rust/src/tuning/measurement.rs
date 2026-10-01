//! Loaded-sweep/v4 observation analysis. Immutable replay and incremental batches
//! share this reducer; no receiver lock or mutable archive is involved.
use serde_json::{json, Value};
const VERSION: &str = "engine-loaded-sweep/v4";
fn n(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64).filter(|v| v.is_finite())
}
fn num(v: &Value, k: &str) -> f64 {
    n(v, k).unwrap_or(f64::NAN)
}
fn set(v: &mut Value, k: &str, x: f64) {
    v[k] = json!(x);
}
fn remove(v: &mut Value, keys: &[&str]) {
    for k in keys {
        v.as_object_mut().unwrap().remove(*k);
    }
}
fn yes(v: &Value, k: &str) -> bool {
    v[k] == true
}
pub fn initial(car_id: &str) -> Value {
    json!({"carId":car_id,"analysisVersion":VERSION,"status":"collecting","guidance":"waiting-frame","acceptedMs":0,"bins":[]})
}
fn adaptive(s: &Value) -> bool {
    (yes(s, "powerDropoffDetected") || yes(s, "cutoffDetected"))
        && num(s, "effectiveRedline") > 0.0
        && num(s, "effectiveRedline") <= num(s, "engineMaxRpm")
}
fn high(s: &Value) -> bool {
    let high = num(s, "highestRpm");
    let max = num(s, "engineMaxRpm");
    high > 0.0
        && max > 0.0
        && high <= max
        && high
            >= if adaptive(s) {
                num(s, "effectiveRedline") * 0.9
            } else {
                max * 0.9
            }
}
pub fn peaks(bins: &Value) -> Value {
    let mut power: Option<&Value> = None;
    let mut torque: Option<&Value> = None;
    if let Some(bins) = bins.as_array() {
        for b in bins {
            if num(b, "sampleCount") < 3.0
                || !bins.iter().any(|other| {
                    (num(other, "index") - num(b, "index")).abs() == 1.0
                        && num(other, "sampleCount") >= 3.0
                })
            {
                continue;
            }
            for (field, slot) in [
                ("averagePowerWatts", &mut power),
                ("averageTorqueNewtons", &mut torque),
            ] {
                if slot.is_none_or(|old| {
                    num(b, field) > num(old, field)
                        || (num(b, field) == num(old, field)
                            && num(b, "averageRpm") < num(old, "averageRpm"))
                }) {
                    *slot = Some(b);
                }
            }
        }
    }
    let mut result = json!({});
    for (key, field, bin) in [
        ("power", "averagePowerWatts", power),
        ("torque", "averageTorqueNewtons", torque),
    ] {
        if let Some(bin) = bin {
            result[key] = json!({"value":num(bin,field),"rpm":num(bin,"averageRpm")});
        }
    }
    result
}
fn guidance(s: &Value, now: f64) -> String {
    let g = s["guidance"].as_str().unwrap_or("collecting");
    if [
        "telemetry-disconnected",
        "waiting-frame",
        "car-mismatch",
        "identity-incomplete",
        "not-in-race",
        "identity-changed",
        "timestamp-regressed",
    ]
    .contains(&g)
    {
        return g.into();
    }
    if n(s, "lastProgressedAtMs").is_none_or(|t| now - t > 2000.0) {
        return "timestamp-stalled".into();
    }
    if num(s, "acceptedMs") < 6000.0 {
        return "duration-insufficient".into();
    }
    if !(num(s, "engineMaxRpm") > 0.0
        && num(s, "lowestRpm") > 0.0
        && num(s, "lowestRpm") <= num(s, "engineMaxRpm") * 0.4)
    {
        return "rpm-coverage-low".into();
    }
    if !high(s) {
        return "rpm-coverage-high".into();
    }
    if s["bins"].as_array().map_or(0, Vec::len) < if adaptive(s) { 6 } else { 8 }
        || peaks(&s["rpmEvidenceBins"])["power"].is_null()
    {
        return "bins-insufficient".into();
    }
    "ready".into()
}
pub fn readiness(s: &Value, now: f64) -> Value {
    let g = guidance(s, now);
    let mut r = json!({"ready":g=="ready","status":if g=="ready"{"ready"}else if ["identity-changed","timestamp-regressed"].contains(&g.as_str()){"blocked"}else{"collecting"},"guidance":g,"acceptedMs":s["acceptedMs"],"binCount":s["bins"].as_array().map_or(0,Vec::len),"lowRpmCoverage":num(s,"engineMaxRpm")>0.0&&num(s,"lowestRpm")<=num(s,"engineMaxRpm")*0.4,"highRpmCoverage":high(s)});
    for key in [
        "effectiveRedline",
        "powerDropoffDetected",
        "cutoffDetected",
        "powerbandStartRpm",
        "powerbandEndRpm",
    ] {
        if let Some(v) = s.get(key) {
            r[key] = v.clone();
        }
    }
    r
}
fn with_guidance(mut s: Value, g: &str) -> Value {
    if [
        "telemetry-disconnected",
        "waiting-frame",
        "car-mismatch",
        "identity-incomplete",
        "not-in-race",
        "gear-changing",
        "gear-not-forward",
        "engine-rpm-invalid",
        "control-input-active",
        "input-not-wide-open",
        "sampling-gap",
        "output-unavailable",
        "vehicle-not-moving",
    ]
    .contains(&g)
    {
        remove(
            &mut s,
            &[
                "loadedSinceMs",
                "plateauCandidateRpm",
                "lastMorphologyTimestampMs",
                "cutoffCycles",
                "lastLoadedPositiveRpm",
            ],
        );
        s["plateauDurationMs"] = json!(0);
        s["plateauHadOutputCut"] = json!(false);
    }
    s["status"] = json!(if g == "ready" {
        "ready"
    } else if ["identity-changed", "timestamp-regressed"].contains(&g) {
        "blocked"
    } else {
        "collecting"
    });
    s["guidance"] = json!(g);
    s
}
fn interrupt(mut s: Value, g: &str) -> Value {
    remove(&mut s, &["lastAcceptedTimestampMs"]);
    with_guidance(s, g)
}
fn add_bin(bins: &Value, rpm: f64, redline: f64, power: f64, torque: f64) -> Value {
    let index = (rpm / redline * 64.0).floor().clamp(0.0, 63.0);
    let mut bins = bins.as_array().cloned().unwrap_or_default();
    let i = bins.iter().position(|b| num(b, "index") == index);
    let mut b = i.map(|i| bins.remove(i)).unwrap_or_else(
        || json!({"index":index,"sampleCount":0,"powerWattsSum":0,"torqueNewtonsSum":0,"rpmSum":0}),
    );
    let count = num(&b, "sampleCount") + 1.0;
    set(&mut b, "sampleCount", count);
    for (sum, avg, x) in [
        ("powerWattsSum", "averagePowerWatts", power),
        ("torqueNewtonsSum", "averageTorqueNewtons", torque),
        ("rpmSum", "averageRpm", rpm),
    ] {
        let total = num(&b, sum) + x;
        set(&mut b, sum, total);
        set(&mut b, avg, total / count);
    }
    bins.push(b);
    bins.sort_by(|a, b| num(a, "index").total_cmp(&num(b, "index")));
    json!(bins)
}
fn observation_bins(s: &Value) -> Value {
    let Some(bins) = s["rpmEvidenceBins"].as_array() else {
        return s["bins"].clone();
    };
    let adapted = adaptive(s) && num(s, "effectiveRedline") > num(s, "lowestRpm");
    let start = if adapted { num(s, "lowestRpm") } else { 0.0 };
    let end = if adapted {
        num(s, "effectiveRedline")
    } else {
        num(s, "engineMaxRpm")
    };
    let mut grouped = std::collections::BTreeMap::<i64, Value>::new();
    for bin in bins {
        let index = ((num(bin, "averageRpm") - start) / (end - start) * 16.0)
            .floor()
            .clamp(0.0, 15.0) as i64;
        let b=grouped.entry(index).or_insert_with(||json!({"index":index,"sampleCount":0,"powerWattsSum":0,"torqueNewtonsSum":0,"rpmSum":0}));
        let count = num(b, "sampleCount") + num(bin, "sampleCount");
        set(b, "sampleCount", count);
        for (sum, avg) in [
            ("powerWattsSum", "averagePowerWatts"),
            ("torqueNewtonsSum", "averageTorqueNewtons"),
            ("rpmSum", "averageRpm"),
        ] {
            let total = num(b, sum) + num(bin, sum);
            set(b, sum, total);
            set(b, avg, total / count);
        }
    }
    json!(grouped.into_values().collect::<Vec<_>>())
}
fn cutoff(
    previous: &Value,
    rpm: f64,
    upper_rpm: f64,
    t: f64,
    cut: bool,
    previous_positive: Option<f64>,
) -> Option<Value> {
    let mut cycle = previous.as_object().map(|_| previous.clone());
    if cycle.as_ref().is_some_and(|c| {
        rpm < num(c, "upperRpm") * 0.96
            || rpm > num(c, "upperRpm") * 1.01
            || t - num(c, "lastCycleMs") > 1000.0
    }) {
        cycle = None;
    }
    let upper = cycle.as_ref().map_or(upper_rpm, |c| num(c, "upperRpm"));
    let approached = previous_positive.is_some_and(|p| p >= upper * 0.99 && p <= upper * 1.01);
    let Some(mut c) = cycle else {
        return (cut&&approached&&rpm>=upper_rpm*0.96&&rpm<=upper_rpm*1.01).then(||json!({"upperRpm":upper_rpm,"startedMs":t,"lastCycleMs":t,"cycles":0,"phase":"cut","cutSamples":1,"recoverySamples":0}));
    };
    if cut {
        if c["phase"] == "recovery" {
            return None;
        }
        if c["phase"] == "armed" {
            if !approached {
                return None;
            }
            c["phase"] = json!("cut");
            set(&mut c, "cutSamples", 0.0);
        }
        let count = num(&c, "cutSamples") + 1.0;
        set(&mut c, "cutSamples", count);
    } else if c["phase"] != "armed" {
        if num(&c, "cutSamples") < 2.0 {
            return None;
        }
        c["phase"] = json!("recovery");
        let count = if rpm >= num(&c, "upperRpm") * 0.99 {
            num(&c, "recoverySamples") + 1.0
        } else {
            0.0
        };
        set(&mut c, "recoverySamples", count);
        if count >= 2.0 {
            let count = num(&c, "cycles") + 1.0;
            set(&mut c, "cycles", count);
            c["phase"] = json!("armed");
            set(&mut c, "recoverySamples", 0.0);
            set(&mut c, "lastCycleMs", t);
        }
    }
    Some(c)
}
pub fn advance(state: &Value, frame: &Value, connected: bool, now: f64) -> Value {
    let mut s = state.clone();
    if !connected {
        return interrupt(s, "telemetry-disconnected");
    }
    if frame.is_null() {
        return interrupt(s, "waiting-frame");
    }
    if ["identity-changed", "timestamp-regressed"].contains(&s["guidance"].as_str().unwrap_or("")) {
        return s;
    }
    let f = frame;
    let ordinal = num(f, "CarOrdinal");
    let class = num(f, "CarClass");
    let pi = num(f, "CarPerformanceIndex");
    if ![ordinal, class, pi]
        .iter()
        .all(|v| v.is_finite() && v.fract() == 0.0 && *v >= 0.0)
        || ordinal == 0.0
    {
        return interrupt(s, "identity-incomplete");
    }
    if ordinal.to_string() != s["carId"].as_str().unwrap_or("") {
        return interrupt(s, "car-mismatch");
    }
    let identity = json!({"ordinal":ordinal,"carClass":class,"performanceIndex":pi});
    if !s["identity"].is_null()
        && ["ordinal", "carClass", "performanceIndex"]
            .iter()
            .any(|k| num(&s["identity"], k) != num(&identity, k))
    {
        return with_guidance(s, "identity-changed");
    }
    s["identity"] = identity;
    if num(f, "IsRaceOn") != 1.0 {
        return interrupt(s, "not-in-race");
    }
    let t = num(f, "TimestampMS");
    if !t.is_finite() || t < 0.0 {
        remove(
            &mut s,
            &[
                "loadedSinceMs",
                "lastMorphologyTimestampMs",
                "plateauCandidateRpm",
                "cutoffCycles",
                "lastLoadedPositiveRpm",
            ],
        );
        set(&mut s, "plateauDurationMs", 0.0);
        s["plateauHadOutputCut"] = json!(false);
        return interrupt(s, "timestamp-stalled");
    }
    if n(&s, "lastTimestampMs").is_some_and(|old| t < old) {
        return with_guidance(state.clone(), "timestamp-regressed");
    }
    if n(&s, "lastTimestampMs") == Some(t) {
        return with_guidance(state.clone(), "timestamp-stalled");
    }
    set(&mut s, "lastTimestampMs", t);
    set(&mut s, "lastProgressedAtMs", now);
    let redline = num(f, "EngineMaxRpm");
    let rpm = num(f, "CurrentEngineRpm");
    let power = num(f, "PowerWatts");
    let torque = num(f, "TorqueNewtons");
    let gear = num(f, "Gear");
    if !redline.is_finite() || redline <= 0.0 || !rpm.is_finite() || rpm <= 0.0 || rpm > redline {
        return interrupt(s, "engine-rpm-invalid");
    }
    if n(&s, "engineMaxRpm").is_some_and(|old| old != redline) {
        return with_guidance(state.clone(), "identity-changed");
    }
    set(&mut s, "engineMaxRpm", redline);
    if !gear.is_finite() || gear.fract() != 0.0 || !(1.0..=10.0).contains(&gear) {
        if gear.is_finite() {
            set(&mut s, "lastObservedGear", gear);
        } else {
            remove(&mut s, &["lastObservedGear"]);
        }
        set(&mut s, "gearSettleUntilMs", t + 500.0);
        return interrupt(s, "gear-not-forward");
    }
    if n(&s, "lastObservedGear").is_some_and(|old| old != gear) {
        set(&mut s, "lastObservedGear", gear);
        set(&mut s, "gearSettleUntilMs", t + 500.0);
        s = interrupt(s, "gear-changing");
    }
    if !num(f, "AccelInput").is_finite() || num(f, "AccelInput") < 250.0 {
        return interrupt(s, "input-not-wide-open");
    }
    if ["BrakeInput", "HandBrakeInput", "ClutchInput"]
        .iter()
        .any(|k| num(f, k) != 0.0)
    {
        return interrupt(s, "control-input-active");
    }
    if !power.is_finite() || !torque.is_finite() {
        return interrupt(s, "output-unavailable");
    }
    set(&mut s, "lastObservedGear", gear);
    if !num(f, "SpeedMetersPerSecond").is_finite() || num(f, "SpeedMetersPerSecond") < 5.0 / 3.6 {
        return interrupt(s, "vehicle-not-moving");
    }
    if n(state, "lastTimestampMs").is_some_and(|old| t - old > 1000.0) {
        return interrupt(s, "sampling-gap");
    }
    let loaded = n(&s, "loadedSinceMs").unwrap_or(t);
    set(&mut s, "loadedSinceMs", loaded);
    if t - loaded < 500.0 {
        return interrupt(s, "load-settling");
    }
    let positive = power > 0.0 && torque > 0.0;
    let delta = n(&s, "lastAcceptedTimestampMs").map_or(0.0, |v| t - v);
    let morphology = n(&s, "lastMorphologyTimestampMs").map_or(0.0, |v| t - v);
    if delta.max(morphology) > 1000.0 {
        if positive {
            set(&mut s, "lastAcceptedTimestampMs", t);
        } else {
            remove(&mut s, &["lastAcceptedTimestampMs"]);
        }
        return with_guidance(s, "sampling-gap");
    }
    for (key, value) in [("observedPeakPower", power), ("observedPeakTorque", torque)] {
        if positive && (s[key].is_null() || value > num(&s[key], "value")) {
            s[key] = json!({"value":value,"rpm":rpm});
        }
    }
    let accepted = num(&s, "acceptedMs") + if positive { delta.max(0.0) } else { 0.0 };
    set(&mut s, "acceptedMs", accepted);
    if positive {
        s["rpmEvidenceBins"] = add_bin(&s["rpmEvidenceBins"], rpm, redline, power, torque);
    }
    let calculated = peaks(&s["rpmEvidenceBins"]);
    let reference = &calculated["power"];
    if n(&s, "effectiveRedline").is_some_and(|v| rpm > v + 50.0) {
        s["cutoffDetected"] = json!(false);
        s["powerDropoffDetected"] = json!(false);
        remove(&mut s, &["effectiveRedline", "cutoffCycles"]);
    }
    remove(&mut s, &["plateauCandidateRpm"]);
    set(&mut s, "plateauDurationMs", 0.0);
    s["plateauHadOutputCut"] = json!(false);
    let eligible = (positive || (power <= 0.0 && torque <= 0.0))
        && !reference.is_null()
        && n(&s, "highestRpm").is_some()
        && num(&s, "lowestRpm") <= redline * 0.4
        && s["rpmEvidenceBins"].as_array().map_or(0, Vec::len) >= 6;
    let cycles = if eligible {
        cutoff(
            &s["cutoffCycles"],
            rpm,
            num(&s, "highestRpm"),
            t,
            power <= 0.0 && torque <= 0.0,
            n(&s, "lastLoadedPositiveRpm"),
        )
    } else {
        None
    };
    if let Some(c) = cycles {
        if num(&c, "cycles") >= 3.0
            && t - num(&c, "startedMs") >= 350.0
            && accepted >= 6000.0
            && !yes(&s, "cutoffDetected")
        {
            s["cutoffDetected"] = json!(true);
            let effective = redline.min(num(&s, "highestRpm").max(num(&c, "upperRpm")).round());
            set(&mut s, "effectiveRedline", effective);
        }
        s["cutoffCycles"] = c;
    } else {
        remove(&mut s, &["cutoffCycles"]);
    }
    if positive
        && !reference.is_null()
        && rpm >= num(reference, "rpm") * 1.05
        && power <= num(reference, "value") * 0.88
    {
        s["powerDropoffDetected"] = json!(true);
        if n(&s, "effectiveRedline").is_none() {
            set(&mut s, "effectiveRedline", redline.min(rpm.round()));
        }
    }
    for key in ["powerDropoffDetected", "cutoffDetected"] {
        if s[key].is_null() {
            s[key] = json!(false);
        }
    }
    s["guidance"] = json!("collecting");
    remove(&mut s, &["gearSettleUntilMs"]);
    set(&mut s, "lastMorphologyTimestampMs", t);
    if positive {
        set(&mut s, "lastLoadedPositiveRpm", rpm);
        set(&mut s, "lastAcceptedTimestampMs", t);
        let low = n(&s, "lowestRpm").unwrap_or(rpm).min(rpm);
        let high = n(&s, "highestRpm").unwrap_or(rpm).max(rpm);
        set(&mut s, "lowestRpm", low);
        set(&mut s, "highestRpm", high);
    } else {
        remove(
            &mut s,
            &["lastLoadedPositiveRpm", "lastAcceptedTimestampMs"],
        );
    }
    if let Some(rpm) = n(&calculated["torque"], "rpm") {
        set(&mut s, "powerbandStartRpm", rpm);
    } else {
        remove(&mut s, &["powerbandStartRpm"]);
    }
    if let Some(rpm) = n(reference, "rpm") {
        let end = rpm.max(n(&s, "effectiveRedline").unwrap_or(0.0));
        set(&mut s, "powerbandEndRpm", end);
    } else {
        remove(&mut s, &["powerbandEndRpm"]);
    }
    if let Some(wheels) = f["TireSlipRatio"].as_array().filter(|a| {
        a.len() >= 4
            && a[..4]
                .iter()
                .all(|v| v.as_f64().is_some_and(f64::is_finite))
    }) {
        let slip = wheels[..4]
            .iter()
            .map(|v| v.as_f64().unwrap().abs())
            .fold(n(&s, "maxObservedNormalizedSlip").unwrap_or(0.0), f64::max);
        set(&mut s, "maxObservedNormalizedSlip", slip);
    }
    s["bins"] = observation_bins(&s);
    let g = guidance(&s, now);
    if !positive && g != "ready" {
        s["status"] = json!("collecting");
        s["guidance"] = json!("output-unavailable");
        s
    } else {
        with_guidance(s, &g)
    }
}

pub fn capture_frame(sample: &Value) -> Value {
    let mut frame = json!({});
    let missing = sample["missingChannels"].as_array();
    for (wire, key) in [
        ("TimestampMS", "timestampMS"),
        ("IsRaceOn", "isRaceOn"),
        ("CarOrdinal", "carOrdinal"),
        ("CarClass", "carClass"),
        ("CarPerformanceIndex", "performanceIndex"),
        ("EngineMaxRpm", "engineMaxRpm"),
        ("CurrentEngineRpm", "rpm"),
        ("SpeedMetersPerSecond", "speedMps"),
        ("Gear", "gear"),
        ("PowerWatts", "powerWatts"),
        ("TorqueNewtons", "torqueNewtons"),
        ("AccelInput", "accelInput"),
        ("BrakeInput", "brakeInput"),
        ("ClutchInput", "clutchInput"),
        ("HandBrakeInput", "handBrakeInput"),
    ] {
        frame[wire] = if missing.is_some_and(|a| a.iter().any(|v| v == wire)) {
            Value::Null
        } else {
            sample[key].clone()
        };
    }
    frame["TireSlipRatio"] = sample["tireSlipRatio"].clone();
    frame
}
pub fn summary(state: Option<&Value>, id: &str) -> Value {
    let Some(s) = state else {
        return json!({"analysisVersion":VERSION,"observationId":id,"status":"unavailable","reason":"capture-unavailable","acceptedMs":0});
    };
    let ready = readiness(s, n(s, "lastProgressedAtMs").unwrap_or(0.0));
    let p = peaks(&s["rpmEvidenceBins"]);
    let mut out = json!({"analysisVersion":VERSION,"observationId":id,"status":if ready["ready"]==true{"ready"}else{"collecting"},"reason":ready["guidance"],"acceptedMs":s["acceptedMs"]});
    for key in ["engineMaxRpm", "effectiveRedline"] {
        if let Some(value) = s.get(key) {
            out[key] = value.clone();
        }
    }
    for (a, b) in [("power", "peakPower"), ("torque", "peakTorque")] {
        if let Some(v) = p.get(a) {
            out[b] = v.clone();
        }
    }
    out
}
pub fn analyze(input: &Value) -> Value {
    let id = input["observationId"].as_str().unwrap_or("");
    let car = input["carId"].as_str().unwrap_or("");
    let Some(samples) = input["capture"]["samples"]
        .as_array()
        .filter(|s| !s.is_empty() && s.len() <= 30000)
    else {
        return summary(None, id);
    };
    let mut state = initial(car);
    let mut ready = None;
    for sample in samples {
        let frame = capture_frame(sample);
        let now = num(&frame, "TimestampMS");
        state = advance(&state, &frame, true, now);
        if state["status"] == "blocked"
            || ["car-mismatch", "identity-incomplete"]
                .contains(&state["guidance"].as_str().unwrap_or(""))
        {
            ready = None;
        } else if readiness(&state, now)["ready"] == true {
            ready = Some(state.clone());
        }
    }
    let result = ready.as_ref().unwrap_or(&state);
    let expected = &input["expected"];
    if expected.is_object()
        && (["ordinal", "carClass", "performanceIndex"]
            .iter()
            .any(|k| n(&result["identity"], k) != n(&expected["identity"], k))
            || n(result, "engineMaxRpm") != n(expected, "engineMaxRpm"))
    {
        let mut out = summary(None, id);
        out["reason"] = json!("identity-changed");
        return out;
    }
    summary(Some(result), id)
}

pub fn batch(input: &Value) -> Result<Value, String> {
    if input["schemaVersion"] != "engine-batch/v1" {
        return Err("Unsupported measurement schema".into());
    }
    let samples = input["samples"]
        .as_array()
        .ok_or("samples must be an array")?;
    if samples.len() > 30000 {
        return Err("Measurement sample limit exceeded".into());
    }
    let car = input["carId"].as_str().ok_or("carId is required")?;
    let mut state = if input["state"].is_null() {
        initial(car)
    } else {
        input["state"].clone()
    };
    if state["carId"] != car
        || state["analysisVersion"] != VERSION
        || !state.is_object()
        || state["bins"].as_array().is_none_or(|b| b.len() > 16)
        || state["rpmEvidenceBins"]
            .as_array()
            .is_some_and(|b| b.len() > 64)
    {
        return Err("Invalid measurement state".into());
    }
    let now = n(input, "nowMs").ok_or("nowMs must be finite")?;
    let mut ready = None;
    for sample in samples {
        let frame = capture_frame(sample);
        state = advance(&state, &frame, true, now);
        if state["status"] == "blocked" {
            ready = None;
        } else if readiness(&state, now)["ready"] == true {
            ready = Some(state.clone());
        }
    }
    if input["connected"] == false {
        state = advance(&state, &Value::Null, false, now);
    }
    let mut result = readiness(&state, now);
    result["minimumAcceptedMs"] = json!(6000);
    result["minimumBins"] = json!(if adaptive(&state) { 6 } else { 8 });
    Ok(json!({"state":state,"readiness":result,"readySnapshot":ready}))
}

/// Historical archive qualification is retained independently from v4 replay.
/// An accepted archive entry still cannot supply calculation peaks without capture analysis.
pub fn parse_archive(input: &Value) -> Value {
    let Some(items) = input.as_array() else {
        return json!([]);
    };
    let mut result = vec![];
    for item in items {
        let d = &item["data"];
        if item["schema"] != "engine-observation/v1"
            || !item["id"].is_string()
            || !item["carId"].is_string()
            || !item["dependencyKey"].is_string()
            || item["source"] != "measured"
            || n(item, "capturedAt").is_none()
            || d["carId"] != item["carId"]
            || d["status"] != "ready"
            || !(num(d, "engineMaxRpm") > 0.0)
            || n(&d["identity"], "ordinal")
                .map(|v| v.to_string())
                .as_deref()
                != item["carId"].as_str()
            || n(&d["identity"], "carClass").is_none()
            || n(&d["identity"], "performanceIndex").is_none()
        {
            continue;
        }
        if ["observedPeakPower", "observedPeakTorque"].iter().any(|k| {
            !(num(&d[k], "value") > 0.0
                && num(&d[k], "rpm") > 0.0
                && num(&d[k], "rpm") <= num(d, "engineMaxRpm"))
        }) {
            continue;
        }
        if !(num(d, "acceptedMs") >= 6000.0
            && num(d, "lowestRpm") > 0.0
            && num(d, "lowestRpm") <= num(d, "engineMaxRpm") * 0.4
            && num(d, "highestRpm") > 0.0
            && num(d, "highestRpm") <= num(d, "engineMaxRpm"))
        {
            continue;
        }
        if d.get("effectiveRedline").is_some()
            && !(num(d, "effectiveRedline") > 0.0
                && num(d, "effectiveRedline") <= num(d, "engineMaxRpm"))
        {
            continue;
        }
        if ["powerDropoffDetected", "cutoffDetected"]
            .iter()
            .any(|k| d.get(k).is_some_and(|v| !v.is_boolean()))
            || !high(d)
        {
            continue;
        }
        let Some(bins) = d["bins"]
            .as_array()
            .filter(|b| b.len() >= if adaptive(d) { 6 } else { 8 } && b.len() <= 16)
        else {
            continue;
        };
        let mut indices = std::collections::BTreeSet::new();
        if bins.iter().any(|b| {
            let index = num(b, "index");
            let count = num(b, "sampleCount");
            !(index.is_finite()
                && index.fract() == 0.0
                && (0.0..16.0).contains(&index)
                && indices.insert(index as i32)
                && count > 0.0
                && count.fract() == 0.0
                && [
                    "averagePowerWatts",
                    "averageTorqueNewtons",
                    "averageRpm",
                    "powerWattsSum",
                    "torqueNewtonsSum",
                    "rpmSum",
                ]
                .iter()
                .all(|k| num(b, k) > 0.0))
        }) {
            continue;
        }
        let mut item = item.clone();
        item.as_object_mut().unwrap().remove("capture");
        result.push(item);
    }
    json!(result)
}
