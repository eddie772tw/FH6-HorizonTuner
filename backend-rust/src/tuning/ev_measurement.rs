//! EV decoded-frame observation reducer, independent of ICE analysis.
use super::ev::{EvCurveBin, EvGearMeasurement, EvMoments};
use serde_json::{json, Value};
fn n(v: &Value, k: &str) -> f64 {
    v[k].as_f64().filter(|v| v.is_finite()).unwrap_or(f64::NAN)
}
fn positive(v: f64) -> bool {
    v.is_finite() && v > 0.0
}
fn add(s: &mut EvMoments, x: f64) {
    s.count += 1;
    let delta = x - s.mean;
    s.mean += delta / s.count as f64;
    s.m2 += delta * (x - s.mean);
}
fn empty() -> EvMoments {
    EvMoments {
        count: 0,
        mean: 0.0,
        m2: 0.0,
    }
}
pub fn initial(car: &str) -> Value {
    json!({"schema":"ev-measurement/v1","carId":car,"status":"collecting","guidance":"waiting","frameCount":0,"gears":[]})
}
pub fn advance(state: &Value, f: &Value) -> Value {
    if state["status"] == "blocked" {
        return state.clone();
    }
    let mut next = state.clone();
    let ordinal = n(f, "CarOrdinal");
    let pi = n(f, "CarPerformanceIndex");
    let class = n(f, "CarClass");
    if ![ordinal, pi, class]
        .iter()
        .all(|v| v.is_finite() && v.fract() == 0.0)
        || ordinal <= 0.0
        || pi <= 0.0
        || class < 0.0
    {
        next.as_object_mut()
            .unwrap()
            .remove("lastAcceptedTimestamp");
        return next;
    }
    let identity = json!({"ordinal":ordinal,"performanceIndex":pi,"carClass":class});
    if state["carId"] != ordinal.to_string()
        || (!state["identity"].is_null()
            && ["ordinal", "performanceIndex", "carClass"]
                .iter()
                .any(|k| n(&state["identity"], k) != n(&identity, k)))
    {
        next["status"] = json!("blocked");
        next["guidance"] = json!("identity-changed");
        return next;
    }
    let t = n(f, "TimestampMS");
    if !t.is_finite() || t < 0.0 || n(state, "lastTimestamp") == t {
        return next;
    }
    if t < n(state, "lastTimestamp") {
        next["status"] = json!("blocked");
        next["guidance"] = json!("session-restarted");
        return next;
    }
    if n(state, "frameCount") >= 30000.0 {
        next["status"] = json!("blocked");
        next["guidance"] = json!("sample-limit");
        return next;
    }
    let gear = n(f, "Gear");
    next["identity"] = identity;
    next["frameCount"] = json!(n(state, "frameCount") + 1.0);
    next["lastTimestamp"] = json!(t);
    next["lastGear"] = json!(gear);
    if gear != n(state, "lastGear") {
        next["gearSince"] = json!(t);
    }
    next.as_object_mut()
        .unwrap()
        .remove("lastAcceptedTimestamp");
    let rpm = n(f, "CurrentEngineRpm");
    let power = n(f, "PowerWatts");
    let torque = n(f, "TorqueNewtons");
    let max = n(f, "EngineMaxRpm");
    if !gear.is_finite()
        || gear.fract() != 0.0
        || !(1.0..=10.0).contains(&gear)
        || !positive(max)
        || max > 100000.0
        || !positive(rpm)
        || rpm > max * 1.03
        || !n(f, "AccelInput").is_finite()
        || n(f, "AccelInput") < 250.0
        || ["BrakeInput", "ClutchInput", "HandBrakeInput"]
            .iter()
            .any(|k| n(f, k) != 0.0)
        || t - n(&next, "gearSince") < 300.0
        || !power.is_finite()
        || !torque.is_finite()
        || power < 0.0
        || torque < 0.0
    {
        return next;
    }
    let mut gears: Vec<EvGearMeasurement> =
        serde_json::from_value(state["gears"].clone()).unwrap_or_default();
    let existing = gears.iter().position(|g| g.gear == gear as usize);
    if existing.is_some_and(|i| (max / gears[i].reported_max_rpm - 1.0).abs() > 0.02) {
        next["status"] = json!("blocked");
        next["guidance"] = json!("identity-changed");
        return next;
    }
    if existing.is_none() && !(power > 0.0 && torque > 0.0) {
        return next;
    }
    let mut g = existing
        .map(|i| gears.remove(i))
        .unwrap_or_else(|| EvGearMeasurement {
            gear: gear as usize,
            reported_max_rpm: max,
            accepted_ms: 0.0,
            positive_samples: 0,
            zero_output_samples: 0,
            lowest_rpm: f64::INFINITY,
            highest_rpm: 0.0,
            cutoff: empty(),
            rpm_per_kmh: empty(),
            front_ratio: empty(),
            rear_ratio: empty(),
            curve: vec![],
        });
    next["guidance"] = json!("collecting");
    if power > 0.0 && torque > 0.0 {
        let delta = t - n(state, "lastAcceptedTimestamp");
        if delta > 0.0 && delta <= 100.0 {
            g.accepted_ms += delta;
        }
        next["lastAcceptedTimestamp"] = json!(t);
        g.positive_samples += 1;
        g.lowest_rpm = g.lowest_rpm.min(rpm);
        g.highest_rpm = g.highest_rpm.max(rpm);
        let index = (rpm / 500.0).floor();
        let i = g
            .curve
            .iter()
            .position(|b| (b.rpm / 500.0).floor() == index);
        let bin = i.map(|i| g.curve.remove(i));
        let count = bin.as_ref().map_or(1, |b| b.count + 1);
        let old = (count - 1) as f64;
        g.curve.push(EvCurveBin {
            count,
            rpm: (bin.as_ref().map_or(0.0, |b| b.rpm) * old + rpm) / count as f64,
            power_watts: (bin.as_ref().map_or(0.0, |b| b.power_watts) * old + power) / count as f64,
            torque_newtons: (bin.as_ref().map_or(0.0, |b| b.torque_newtons) * old + torque)
                / count as f64,
        });
        g.curve.sort_by(|a, b| a.rpm.total_cmp(&b.rpm));
    } else if power == 0.0 {
        g.zero_output_samples += 1;
        if g.positive_samples >= 90
            && rpm >= g.highest_rpm * 0.98
            && rpm >= g.reported_max_rpm * 0.85
        {
            add(&mut g.cutoff, rpm);
        }
    }
    let speed = n(f, "SpeedMetersPerSecond");
    let wheels = f["WheelRotationSpeed"].as_array();
    let slip = f["TireSlipRatio"].as_array();
    if positive(speed)
        && speed >= 40.0 / 3.6
        && n(f, "SteerInput").abs() <= 5.0
        && wheels
            .is_some_and(|w| w.len() == 4 && w.iter().all(|v| v.as_f64().is_some_and(positive)))
        && slip.is_some_and(|s| {
            s.len() == 4
                && s.iter()
                    .all(|v| v.as_f64().is_some_and(|v| v.is_finite() && v.abs() < 0.1))
        })
    {
        let w = wheels.unwrap();
        add(&mut g.rpm_per_kmh, rpm / (speed * 3.6));
        add(
            &mut g.front_ratio,
            rpm * std::f64::consts::PI / (15.0 * (w[0].as_f64().unwrap() + w[1].as_f64().unwrap())),
        );
        add(
            &mut g.rear_ratio,
            rpm * std::f64::consts::PI / (15.0 * (w[2].as_f64().unwrap() + w[3].as_f64().unwrap())),
        );
    }
    gears.push(g);
    gears.sort_by_key(|g| g.gear);
    next["gears"] = serde_json::to_value(gears).unwrap();
    next
}
pub fn batch(input: &Value) -> Result<Value, String> {
    if input["schemaVersion"] != "ev-batch/v1" {
        return Err("Unsupported EV measurement schema".into());
    }
    let frames = input["frames"]
        .as_array()
        .filter(|f| f.len() <= 30000)
        .ok_or("Bounded frames required")?;
    let mut state = input["state"].clone();
    if state["schema"] != "ev-measurement/v1"
        || state["gears"].as_array().is_none_or(|a| a.len() > 10)
    {
        return Err("Invalid EV state".into());
    }
    for frame in frames {
        state = advance(&state, frame);
    }
    let gears: Vec<EvGearMeasurement> =
        serde_json::from_value(state["gears"].clone()).map_err(|e| e.to_string())?;
    let ready: Vec<usize> = gears
        .iter()
        .filter(|g| super::ev::ready(g))
        .map(|g| g.gear)
        .collect();
    Ok(json!({"state":state,"readyGears":ready}))
}
