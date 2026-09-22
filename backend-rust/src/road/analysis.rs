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
fn wheel(p: &Value, field: &str, i: usize) -> Option<f64> {
    let a = p.get(field).and_then(Value::as_array).or_else(|| {
        (field == "NormalizedSuspensionTravel")
            .then(|| p.get("SuspTravel"))
            .flatten()
            .and_then(Value::as_array)
    });
    a.and_then(|a| a.get(i)).and_then(|v| num(Some(v)))
}
fn driving(p: &Value) -> bool {
    p.get("IsRaceOn").and_then(Value::as_i64) != Some(0)
        && num(p.get("SpeedMetersPerSecond")).is_some_and(|x| x > 2.0)
}
fn weights(points: &[Value]) -> (Vec<f64>, Value) {
    let mut w = vec![0.0; points.len()];
    let (mut gaps, mut dup, mut reg, mut miss) = (0.0, 0, 0, 0);
    for i in 0..points.len().saturating_sub(1) {
        let (a, b) = (point_time(&points[i]), point_time(&points[i + 1]));
        let (Some(a), Some(b)) = (a, b) else {
            miss += 1;
            continue;
        };
        let d = b - a;
        if d == 0.0 {
            dup += 1
        } else if d < 0.0 {
            reg += 1
        } else if d > 0.5 {
            gaps += d
        } else if driving(&points[i]) && driving(&points[i + 1]) {
            w[i] = d;
        }
    }
    let observed = w.iter().sum::<f64>();
    (
        w,
        json!({"observedSeconds":observed,"gapSeconds":gaps,"duplicateTimestamps":dup,"timestampRegressions":reg,"missingTimeIntervals":miss}),
    )
}
fn dist(vals: &[Option<f64>], w: &[f64]) -> Value {
    let mut x: Vec<(f64, f64)> = vals
        .iter()
        .zip(w)
        .filter_map(|(v, w)| v.filter(|_| *w > 0.0).map(|v| (v, *w)))
        .collect();
    x.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(Ordering::Equal));
    let total: f64 = x.iter().map(|x| x.1).sum();
    if total == 0.0 {
        return json!({"observedSeconds":0.0,"mean":null,"p05":null,"p50":null,"p95":null});
    }
    let mean = x.iter().map(|(v, w)| v * w).sum::<f64>() / total;
    let q = |f: f64| {
        let mut s = 0.0;
        x.iter().find_map(|(v, w)| {
            s += w;
            (s >= f * total).then_some(*v)
        })
    };
    json!({"observedSeconds":total,"mean":mean,"p05":q(0.05),"p50":q(0.5),"p95":q(0.95)})
}
fn events(
    vals: &[Option<f64>],
    w: &[f64],
    above: Option<f64>,
    below: Option<f64>,
    strict: bool,
) -> Value {
    let (mut count, mut total, mut longest, mut current, mut valid): (i64, f64, f64, f64, f64) =
        (0, 0.0, 0.0, 0.0, 0.0);
    for (v, wt) in vals.iter().zip(w) {
        if *wt <= 0.0 || v.is_none() {
            current = 0.0;
            continue;
        }
        let x = v.unwrap();
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
    let (w, q) = weights(points);
    let initial = w.iter().position(|x| *x > 0.0);
    let mut ws = serde_json::Map::new();
    for (i, name) in ["FL", "FR", "RL", "RR"].iter().enumerate() {
        let temps: Vec<_> = points
            .iter()
            .map(|p| wheel(p, "TireTemp", i).and_then(|v| Some(v)))
            .collect();
        let tc: Vec<_> = temps
            .iter()
            .map(|v| v.map(|x| (x - 32.0) * 5.0 / 9.0))
            .collect();
        let travel: Vec<_> = points
            .iter()
            .map(|p| wheel(p, "NormalizedSuspensionTravel", i))
            .collect();
        let slip: Vec<_> = points
            .iter()
            .map(|p| wheel(p, "TireSlipRatio", i))
            .collect();
        let angle: Vec<_> = points
            .iter()
            .map(|p| wheel(p, "TireSlipAngle", i))
            .collect();
        let total: f64 = w.iter().sum();
        let edge = 10.0_f64.min(total / 3.0);
        let mut c = 0.0;
        let ew: Vec<_> = w
            .iter()
            .map(|x| {
                let z = 0.0_f64.max((c + x - (total - edge)).min(*x));
                c += x;
                z
            })
            .collect();
        let start = initial.and_then(|j| tc[j]);
        let end = dist(&tc, &ew).get("mean").and_then(Value::as_f64);
        let change = start.zip(end).map(|(a, b)| b - a);
        ws.insert(name.to_string(),json!({"temperatureC":dist(&tc,&w),"startTemperatureC":start,"endTemperatureC":end,"temperatureChangeC":change,"normalizedTravel":dist(&travel,&w),"nearCompression":events(&travel,&w,Some(0.95),None,false),"nearExtension":events(&travel,&w,None,Some(0.05),false),"normalizedRatio":dist(&slip,&w),"normalizedAngle":dist(&angle,&w),"ratioAboveOne":events(&slip.iter().map(|x|x.map(f64::abs)).collect::<Vec<_>>(),&w,Some(1.0),None,true),"angleAboveOne":events(&angle.iter().map(|x|x.map(f64::abs)).collect::<Vec<_>>(),&w,Some(1.0),None,true)}));
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
        channels.insert(
            f.into(),
            dist(
                &points.iter().map(|p| num(p.get(f))).collect::<Vec<_>>(),
                &w,
            ),
        );
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
    groups.into_iter().map(|(index,group)|{let ts=group.iter().filter_map(|p|point_time(p)).collect::<Vec<_>>();let speeds=group.iter().filter_map(|p|num(p.get("SpeedMetersPerSecond")).map(|x|x*3.6)).collect::<Vec<_>>();let cloned=group.iter().map(|p|(*p).clone()).collect::<Vec<_>>();let(w,quality)=weights(&cloned);let mean=dist(&group.iter().map(|p|num(p.get("SpeedMetersPerSecond"))).collect::<Vec<_>>(),&w).get("mean").and_then(Value::as_f64).map(|x|x*3.6);json!({"lapIndex":index,"lapNumber":index+1,"lapTimeSeconds":times.get(&index),"lapTimeSource":if times.contains_key(&index){"game-lastlap"}else{"unavailable"},"startObserved":starts.contains(&index),"endObserved":times.contains_key(&index),"complete":starts.contains(&index)&&times.contains_key(&index),"observedSpanSeconds":if ts.is_empty(){None}else{Some(ts.iter().fold(f64::NEG_INFINITY,|a,b|a.max(*b))-ts.iter().fold(f64::INFINITY,|a,b|a.min(*b)))},"maxSpeedKmh":speeds.into_iter().reduce(f64::max),"meanSpeedKmh":mean,"observedSeconds":quality["observedSeconds"],"gapSeconds":quality["gapSeconds"],"duplicateTimestamps":quality["duplicateTimestamps"],"timestampRegressions":quality["timestampRegressions"],"missingTimeIntervals":quality["missingTimeIntervals"]})}).collect()
}
