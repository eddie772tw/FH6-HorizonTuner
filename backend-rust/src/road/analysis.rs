use serde_json::{json, Value};
use std::cmp::Ordering;
pub const ROAD_ANALYSIS_VERSION: &str = "road-observations/v1";
fn num(v: Option<&Value>) -> Option<f64> {
    let n = v?.as_f64()?;
    n.is_finite().then_some(n)
}
fn point_time(p: &Value) -> Option<f64> {
    num(p.get("TimestampMS"))
        .map(|x| x / 1000.0)
        .or_else(|| num(p.get("time")))
}
fn wheel_values<'a>(p: &'a Value, field: &str) -> Option<&'a [Value]> {
    let a = p.get(field).and_then(Value::as_array).or_else(|| {
        (field == "NormalizedSuspensionTravel")
            .then(|| p.get("SuspTravel"))
            .flatten()
            .and_then(Value::as_array)
    });
    a.map(Vec::as_slice)
}
fn wheel_value(values: Option<&[Value]>, i: usize) -> Option<f64> {
    num(values.and_then(|values| values.get(i)))
}
fn driving(p: &Value) -> bool {
    p.get("IsRaceOn").and_then(Value::as_i64) != Some(0)
        && num(p.get("SpeedMetersPerSecond")).is_some_and(|x| x > 2.0)
}
fn weights<'a>(points: impl Iterator<Item = &'a Value>) -> (Vec<f64>, Value) {
    let mut w = Vec::new();
    let (mut gaps, mut dup, mut reg, mut miss) = (0.0, 0, 0, 0);
    let mut previous: Option<&Value> = None;
    let mut count = 0;
    for point in points {
        count += 1;
        let Some(previous_point) = previous else {
            previous = Some(point);
            continue;
        };
        let (a, b) = (point_time(previous_point), point_time(point));
        let (Some(a), Some(b)) = (a, b) else {
            miss += 1;
            w.push(0.0);
            previous = Some(point);
            continue;
        };
        let d = b - a;
        if d == 0.0 {
            dup += 1;
            w.push(0.0);
        } else if d < 0.0 {
            reg += 1;
            w.push(0.0);
        } else if d > 0.5 {
            gaps += d;
            w.push(0.0);
        } else if driving(previous_point) && driving(point) {
            w.push(d);
        } else {
            w.push(0.0);
        }
        previous = Some(point);
    }
    if count > 0 {
        w.push(0.0);
    }
    let observed = w.iter().sum::<f64>();
    (
        w,
        json!({"observedSeconds":observed,"gapSeconds":gaps,"duplicateTimestamps":dup,"timestampRegressions":reg,"missingTimeIntervals":miss}),
    )
}
fn dist(vals: impl IntoIterator<Item = Option<f64>>, w: &[f64]) -> Value {
    let mut exposure = 0.0;
    let mut weighted_sum = 0.0;
    let mut x = Vec::new();
    for (value, weight) in vals.into_iter().zip(w) {
        if let Some(value) = value.filter(|_| *weight > 0.0) {
            exposure += *weight;
            weighted_sum += value * *weight;
            x.push((value, *weight));
        }
    }
    x.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(Ordering::Equal));
    if exposure == 0.0 {
        return json!({"observedSeconds":0.0,"mean":null,"p05":null,"p50":null,"p95":null});
    }
    let thresholds = [0.05 * exposure, 0.5 * exposure, 0.95 * exposure];
    let mut percentiles = [None; 3];
    let mut accumulated = 0.0;
    for (value, weight) in x {
        accumulated += weight;
        for (index, threshold) in thresholds.iter().enumerate() {
            if percentiles[index].is_none() && accumulated >= *threshold {
                percentiles[index] = Some(value);
            }
        }
    }
    json!({"observedSeconds":exposure,"mean":weighted_sum/exposure,"p05":percentiles[0],"p50":percentiles[1],"p95":percentiles[2]})
}
fn events(
    vals: impl IntoIterator<Item = Option<f64>>,
    w: &[f64],
    above: Option<f64>,
    below: Option<f64>,
    strict: bool,
    absolute: bool,
) -> Value {
    let (mut count, mut total, mut longest, mut current, mut valid): (i64, f64, f64, f64, f64) =
        (0, 0.0, 0.0, 0.0, 0.0);
    for (v, wt) in vals.into_iter().zip(w) {
        if *wt <= 0.0 || v.is_none() {
            current = 0.0;
            continue;
        }
        let x = if absolute {
            v.unwrap().abs()
        } else {
            v.unwrap()
        };
        valid += wt;
        let on = above.is_some_and(|t| if strict { x > t } else { x >= t })
            || below.is_some_and(|t| x <= t);
        if !on {
            current = 0.0;
            continue;
        }
        if current == 0.0 {
            count += 1
        };
        current += wt;
        total += wt;
        longest = longest.max(current);
    }
    json!({"count":if valid>0.0{json!(count)}else{Value::Null},"seconds":if valid>0.0{json!(total)}else{Value::Null},"longestSeconds":if valid>0.0{json!(longest)}else{Value::Null},"observedSeconds":valid})
}
pub fn summarize_road_observations(points: &[Value]) -> Value {
    let (w, q) = weights(points.iter());
    let initial = w.iter().position(|x| *x > 0.0);
    let total = w.iter().sum::<f64>();
    let edge = 10.0_f64.min(total / 3.0);
    let mut cumulative = 0.0;
    let end_weights: Vec<_> = w
        .iter()
        .map(|weight| {
            let end_weight = 0.0_f64.max((cumulative + *weight - (total - edge)).min(*weight));
            cumulative += *weight;
            end_weight
        })
        .collect();
    let mut tc: [Vec<Option<f64>>; 4] = std::array::from_fn(|_| Vec::with_capacity(points.len()));
    let mut travel: [Vec<Option<f64>>; 4] =
        std::array::from_fn(|_| Vec::with_capacity(points.len()));
    let mut slip: [Vec<Option<f64>>; 4] = std::array::from_fn(|_| Vec::with_capacity(points.len()));
    let mut angle: [Vec<Option<f64>>; 4] =
        std::array::from_fn(|_| Vec::with_capacity(points.len()));
    for point in points {
        let temperatures = wheel_values(point, "TireTemp");
        let travels = wheel_values(point, "NormalizedSuspensionTravel");
        let slips = wheel_values(point, "TireSlipRatio");
        let angles = wheel_values(point, "TireSlipAngle");
        for i in 0..4 {
            tc[i].push(wheel_value(temperatures, i).map(|x| (x - 32.0) * 5.0 / 9.0));
            travel[i].push(wheel_value(travels, i));
            slip[i].push(wheel_value(slips, i));
            angle[i].push(wheel_value(angles, i));
        }
    }

    let mut ws = serde_json::Map::new();
    for (i, name) in ["FL", "FR", "RL", "RR"].iter().enumerate() {
        let start = initial.and_then(|j| tc[i][j]);
        let end = dist(tc[i].iter().copied(), &end_weights)
            .get("mean")
            .and_then(Value::as_f64);
        let change = start.zip(end).map(|(a, b)| b - a);
        ws.insert(name.to_string(),json!({"temperatureC":dist(tc[i].iter().copied(),&w),"startTemperatureC":start,"endTemperatureC":end,"temperatureChangeC":change,"normalizedTravel":dist(travel[i].iter().copied(),&w),"nearCompression":events(travel[i].iter().copied(),&w,Some(0.95),None,false,false),"nearExtension":events(travel[i].iter().copied(),&w,None,Some(0.05),false,false),"normalizedRatio":dist(slip[i].iter().copied(),&w),"normalizedAngle":dist(angle[i].iter().copied(),&w),"ratioAboveOne":events(slip[i].iter().copied(),&w,Some(1.0),None,true,true),"angleAboveOne":events(angle[i].iter().copied(),&w,Some(1.0),None,true,true)}));
    }
    let fields = [
        "SpeedMetersPerSecond",
        "CurrentEngineRpm",
        "PowerWatts",
        "TorqueNewtons",
        "AccelerationX",
        "AccelerationY",
        "AccelerationZ",
        "AngularVelocityY",
        "AccelInput",
        "BrakeInput",
        "SteerInput",
        "ClutchInput",
        "HandBrakeInput",
    ];
    let mut channels = serde_json::Map::new();
    for f in fields {
        channels.insert(f.into(), dist(points.iter().map(|p| num(p.get(f))), &w));
    }
    json!({"methodVersion":ROAD_ANALYSIS_VERSION,"sampleCount":points.len(),"quality":q,"wheels":ws,"laps":summarize_laps(points),"channels":channels})
}

pub fn summarize_laps(points: &[Value]) -> Vec<Value> {
    let mut groups = std::collections::BTreeMap::<i64, Vec<&Value>>::new();
    let mut starts = std::collections::HashSet::new();
    let mut times = std::collections::HashMap::new();
    let (mut previous, mut previous_last, mut pending) = (None, None, None);
    for p in points {
        let Some(index) = num(p.get("LapNumber"))
            .filter(|x| *x >= 0.0 && x.fract() == 0.0)
            .map(|x| x as i64)
        else {
            continue;
        };
        if previous.is_some_and(|x| index < x) {
            break;
        }
        if previous.is_some_and(|x| index > x) {
            pending = (index == previous.unwrap() + 1).then_some(previous.unwrap());
        }
        if let Some(i) = pending {
            if let Some(last) = num(p.get("LastLap")) {
                if last > 0.0 && Some(last) != previous_last {
                    times.insert(i, last);
                    pending = None;
                }
            }
        }
        if let Some(last) = num(p.get("LastLap")) {
            previous_last = Some(last);
        }
        previous = Some(index);
        if p.get("IsRaceOn").and_then(Value::as_i64) == Some(0) {
            continue;
        }
        groups.entry(index).or_default().push(p);
        if num(p.get("CurrentLap")).is_some_and(|x| x >= 0.0 && x <= 0.5) {
            starts.insert(index);
        }
    }
    groups
        .into_iter()
        .map(|(index, group)| {
            let (mut min_time, mut max_time, mut max_speed) = (None, None, None);
            for point in &group {
                if let Some(time) = point_time(point) {
                    min_time = Some(min_time.map_or(time, |value: f64| value.min(time)));
                    max_time = Some(max_time.map_or(time, |value: f64| value.max(time)));
                }
                if let Some(speed) = num(point.get("SpeedMetersPerSecond")) {
                    max_speed = Some(max_speed.map_or(speed * 3.6, |value: f64| value.max(speed * 3.6)));
                }
            }
            let (w, quality) = weights(group.iter().copied());
            let mean = dist(
                group
                    .iter()
                    .map(|p| num(p.get("SpeedMetersPerSecond"))),
                &w,
            )
            .get("mean")
            .and_then(Value::as_f64)
            .map(|x| x * 3.6);
            json!({
                "lapIndex": index,
                "lapNumber": index + 1,
                "lapTimeSeconds": times.get(&index),
                "lapTimeSource": if times.contains_key(&index) { "game-lastlap" } else { "unavailable" },
                "startObserved": starts.contains(&index),
                "endObserved": times.contains_key(&index),
                "complete": starts.contains(&index) && times.contains_key(&index),
                "observedSpanSeconds": min_time.zip(max_time).map(|(min, max)| max - min),
                "maxSpeedKmh": max_speed,
                "meanSpeedKmh": mean,
                "observedSeconds": quality["observedSeconds"],
                "gapSeconds": quality["gapSeconds"],
                "duplicateTimestamps": quality["duplicateTimestamps"],
                "timestampRegressions": quality["timestampRegressions"],
                "missingTimeIntervals": quality["missingTimeIntervals"]
            })
        })
        .collect()
}
