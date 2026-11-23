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
type Peaks = (Option<(f64, f64)>, Option<(f64, f64)>);
fn peak_pairs(bins: &Value) -> Peaks {
    let mut power: Option<&Value> = None;
    let mut torque: Option<&Value> = None;
    if let Some(bins) = bins.as_array() {
        // [PERF] Bitmask valid bins (0..64) once to replace O(B^2) neighbor scans with O(1) bit checks.
        let (mut valid, mut all_idx) = (0u64, true);
        for b in bins {
            let i = num(b, "index");
            if i.fract() == 0.0 && (0.0..64.0).contains(&i) {
                valid |= ((num(b, "sampleCount") >= 3.0) as u64) << (i as u32);
            } else {
                all_idx = false;
            }
        }
        for b in bins {
            let i = num(b, "index");
            let adj = if all_idx {
                (valid & (((1u64 << (i as u32)) >> 1) | ((1u64 << (i as u32)) << 1))) != 0
            } else {
                bins.iter()
                    .any(|o| (num(o, "index") - i).abs() == 1.0 && num(o, "sampleCount") >= 3.0)
            };
            if num(b, "sampleCount") < 3.0 || !adj {
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
    let p = power.map(|b| (num(b, "averagePowerWatts"), num(b, "averageRpm")));
    let t = torque.map(|b| (num(b, "averageTorqueNewtons"), num(b, "averageRpm")));
    (p, t)
}
fn put_peaks(mut out: Value, (p, t): Peaks, pk: &str, tk: &str) -> Value {
    for (k, pair) in [(pk, p), (tk, t)] {
        if let Some((v, r)) = pair {
            out[k] = json!({"value":v,"rpm":r});
        }
    }
    out
}
pub fn peaks(bins: &Value) -> Value {
    put_peaks(json!({}), peak_pairs(bins), "power", "torque")
}
fn guidance(s: &Value, now: f64, lazy: Option<&Lazy>) -> String {
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
    let (dirty, p) = lazy.map_or_else(|| (false, peak_pairs(&s["rpmEvidenceBins"])), |l| *l);
    let bins = dirty.then(|| obs_bin_count(s));
    let bins = bins.unwrap_or_else(|| s["bins"].as_array().map_or(0, Vec::len));
    if bins < if adaptive(s) { 6 } else { 8 } || p.0.is_none() {
        return "bins-insufficient".into();
    }
    "ready".into()
}
pub fn readiness(s: &Value, now: f64) -> Value {
    let g = guidance(s, now, None);
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
fn add_bin_in_place(bins: &mut Value, rpm: f64, redline: f64, power: f64, torque: f64) {
    let index = (rpm / redline * 64.0).floor().clamp(0.0, 63.0);
    if !bins.is_array() {
        *bins = json!([]);
    }
    let arr = bins.as_array_mut().unwrap();
    // [PERF] Mutate matching RPM bin in-place to eliminate cloning/re-sorting 64 bin objects per sample.
    let Some(i) = arr.iter().position(|b| num(b, "index") == index) else {
        arr.push(json!({"index":index,"sampleCount":1.0,"powerWattsSum":power,"averagePowerWatts":power,"torqueNewtonsSum":torque,"averageTorqueNewtons":torque,"rpmSum":rpm,"averageRpm":rpm}));
        arr.sort_by(|a, b| num(a, "index").total_cmp(&num(b, "index")));
        return;
    };
    let b = &mut arr[i];
    let count = num(b, "sampleCount") + 1.0;
    set(b, "sampleCount", count);
    for (sum, avg, x) in [
        ("powerWattsSum", "averagePowerWatts", power),
        ("torqueNewtonsSum", "averageTorqueNewtons", torque),
        ("rpmSum", "averageRpm", rpm),
    ] {
        let total = num(b, sum) + x;
        set(b, sum, total);
        set(b, avg, total / count);
    }
}
type Lazy = (bool, Peaks);
// [PERF] Defer 16-bin JSON materialization & stack-cache peaks in replay loops.
fn obs_bin_count(s: &Value) -> usize {
    let ad = adaptive(s) && num(s, "effectiveRedline") > num(s, "lowestRpm");
    let lo = if ad { num(s, "lowestRpm") } else { 0.0 };
    let span = num(s, ["engineMaxRpm", "effectiveRedline"][ad as usize]) - lo;
    let mut mask = 0u16;
    for b in s["rpmEvidenceBins"].as_array().into_iter().flatten() {
        let p = ((num(b, "averageRpm") - lo) / span * 16.0).floor();
        mask |= 1u16 << ((p.clamp(0.0, 15.0) as i64).clamp(0, 15) as u32);
    }
    mask.count_ones() as usize
}
fn flush_bins(mut s: Value, dirty: bool) -> Value {
    if dirty {
        s["bins"] = observation_bins(&s);
    }
    s
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
    // [PERF] Accumulate 16 fixed-range RPM buckets on the stack without BTreeMap or per-bin JSON clones.
    let (span, mut buckets) = (end - start, [None::<[f64; 4]>; 16]);
    for bin in bins {
        let pos = ((num(bin, "averageRpm") - start) / span * 16.0).floor();
        let idx = (pos.clamp(0.0, 15.0) as i64).clamp(0, 15) as usize;
        let slot = buckets[idx].get_or_insert([0.0; 4]);
        slot[0] += num(bin, "sampleCount");
        slot[1] += num(bin, "powerWattsSum");
        slot[2] += num(bin, "torqueNewtonsSum");
        slot[3] += num(bin, "rpmSum");
    }
    Value::Array(buckets.iter().enumerate().filter_map(|(i, b)| b.map(|[c, p, t, r]| json!({"index":i,"sampleCount":c,"powerWattsSum":p,"averagePowerWatts":p/c,"torqueNewtonsSum":t,"averageTorqueNewtons":t/c,"rpmSum":r,"averageRpm":r/c}))).collect())
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
    if !connected {
        return interrupt(state.clone(), "telemetry-disconnected");
    }
    advance_owned(state.clone(), frame, now, None)
}
fn advance_owned(mut s: Value, frame: &Value, now: f64, lazy: Option<&mut Lazy>) -> Value {
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
    let id = &s["identity"];
    if !id.is_null()
        && (num(id, "ordinal") != ordinal
            || num(id, "carClass") != class
            || num(id, "performanceIndex") != pi)
    {
        return with_guidance(s, "identity-changed");
    }
    let (prev_ts, t) = (n(&s, "lastTimestampMs"), num(f, "TimestampMS"));
    if !t.is_finite() || t < 0.0 {
        if s["identity"].is_null() {
            s["identity"] = json!({"ordinal":ordinal,"carClass":class,"performanceIndex":pi});
        }
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
    let (redline, rpm) = (num(f, "EngineMaxRpm"), num(f, "CurrentEngineRpm"));
    let rpm_ok =
        redline.is_finite() && redline > 0.0 && rpm.is_finite() && rpm > 0.0 && rpm <= redline;
    if prev_ts.is_some_and(|old| t < old) {
        return with_guidance(s, "timestamp-regressed");
    }
    if prev_ts == Some(t) {
        return with_guidance(s, "timestamp-stalled");
    }
    if rpm_ok && n(&s, "engineMaxRpm").is_some_and(|old| old != redline) {
        return with_guidance(s, "identity-changed");
    }
    if s["identity"].is_null() {
        s["identity"] = json!({"ordinal":ordinal,"carClass":class,"performanceIndex":pi});
    }
    set(&mut s, "lastTimestampMs", t);
    set(&mut s, "lastProgressedAtMs", now);
    let power = num(f, "PowerWatts");
    let torque = num(f, "TorqueNewtons");
    let gear = num(f, "Gear");
    if !rpm_ok {
        return interrupt(s, "engine-rpm-invalid");
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
    if prev_ts.is_some_and(|old| t - old > 1000.0) {
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
        add_bin_in_place(&mut s["rpmEvidenceBins"], rpm, redline, power, torque);
    }
    let (pwr, trq) = peak_pairs(&s["rpmEvidenceBins"]);
    if n(&s, "effectiveRedline").is_some_and(|v| rpm > v + 50.0) {
        s["cutoffDetected"] = json!(false);
        s["powerDropoffDetected"] = json!(false);
        remove(&mut s, &["effectiveRedline", "cutoffCycles"]);
    }
    remove(&mut s, &["plateauCandidateRpm"]);
    set(&mut s, "plateauDurationMs", 0.0);
    s["plateauHadOutputCut"] = json!(false);
    let eligible = (positive || (power <= 0.0 && torque <= 0.0))
        && pwr.is_some()
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
    if positive && pwr.is_some_and(|(pv, pr)| rpm >= pr * 1.05 && power <= pv * 0.88) {
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
    if let Some((_, rpm)) = trq.filter(|(_, r)| r.is_finite()) {
        set(&mut s, "powerbandStartRpm", rpm);
    } else {
        remove(&mut s, &["powerbandStartRpm"]);
    }
    if let Some((_, rpm)) = pwr.filter(|(_, r)| r.is_finite()) {
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
    let g = if let Some(l) = lazy {
        l.1 = (pwr, trq);
        if s["rpmEvidenceBins"].is_array() {
            (l.0, s["bins"]) = (true, Value::Array(Vec::new()));
        }
        guidance(&s, now, Some(l))
    } else {
        s["bins"] = observation_bins(&s);
        guidance(&s, now, Some(&(false, (pwr, trq))))
    };
    if !positive && g != "ready" {
        s["status"] = json!("collecting");
        s["guidance"] = json!("output-unavailable");
        s
    } else {
        with_guidance(s, &g)
    }
}

pub fn capture_frame(sample: &Value) -> Value {
    let mut frame = Value::Object(serde_json::Map::with_capacity(16));
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
    let mut lazy: Lazy = (false, (None, None));
    let mut ready = None;
    for sample in samples {
        let frame = capture_frame(sample);
        let now = num(&frame, "TimestampMS");
        state = advance_owned(state, &frame, now, Some(&mut lazy));
        if state["status"] == "blocked"
            || ["car-mismatch", "identity-incomplete"]
                .contains(&state["guidance"].as_str().unwrap_or(""))
        {
            ready = None;
        } else if state["guidance"] == "ready" || guidance(&state, now, Some(&lazy)) == "ready" {
            // [PERF] Snapshot Copy scalars instead of deep-cloning 64-bin JSON state per frame.
            let snap = (num(&state, "acceptedMs"), n(&state, "effectiveRedline"));
            ready = Some((snap, lazy.1));
        }
    }
    let result = &state;
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
    if let Some(((ms, eff), p)) = ready {
        let mut out = json!({"analysisVersion":VERSION,"observationId":id,"status":"ready","reason":"ready","acceptedMs":ms,"engineMaxRpm":state["engineMaxRpm"]});
        if let Some(v) = eff {
            out["effectiveRedline"] = json!(v);
        }
        return put_peaks(out, p, "peakPower", "peakTorque");
    }
    summary(Some(&flush_bins(state, lazy.0)), id)
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
    let mut lazy: Lazy = (false, peak_pairs(&state["rpmEvidenceBins"]));
    let mut ready = None;
    for sample in samples {
        let frame = capture_frame(sample);
        state = advance_owned(state, &frame, now, Some(&mut lazy));
        if state["status"] == "blocked" {
            ready = None;
        } else if state["guidance"] == "ready" || guidance(&state, now, Some(&lazy)) == "ready" {
            ready = Some((state.clone(), lazy.0));
        }
    }
    state = flush_bins(state, lazy.0);
    let ready = ready.map(|(s, d)| flush_bins(s, d));
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
