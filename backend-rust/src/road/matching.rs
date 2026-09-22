use serde_json::{json, Value};

const MATCH_VERSION: &str = "road-spatial/v1";
const CELL_METERS: f64 = 20.0;
const MATCH_METERS: f64 = 8.0;
const ROUTE_COVERAGE_MIN: f64 = 0.8;
const MAX_MATCH_POINTS: usize = 4000;

fn finite(v: Option<&Value>) -> Option<f64> {
    let x = v?.as_f64()?;
    x.is_finite().then_some(x)
}
fn wheel(point: &Value, field: &str, index: usize) -> Option<f64> {
    let values = point.get(field).and_then(Value::as_array).or_else(|| {
        (field == "NormalizedSuspensionTravel")
            .then(|| point.get("SuspTravel"))
            .flatten()
            .and_then(Value::as_array)
    })?;
    finite(values.get(index))
}
fn point_time(point: &Value) -> Option<f64> {
    finite(point.get("TimestampMS"))
        .map(|x| x / 1000.0)
        .or_else(|| finite(point.get("time")))
}
fn driving(point: &Value) -> bool {
    point.get("IsRaceOn").and_then(Value::as_i64) != Some(0)
        && finite(point.get("SpeedMetersPerSecond")).is_some_and(|x| x > 2.0)
}
fn observation_weights(points: &[Value]) -> Vec<f64> {
    let mut weights = vec![0.0; points.len()];
    for i in 0..points.len().saturating_sub(1) {
        let (Some(a), Some(b)) = (point_time(&points[i]), point_time(&points[i + 1])) else {
            continue;
        };
        let elapsed = b - a;
        if elapsed > 0.0 && elapsed <= 0.5 && driving(&points[i]) && driving(&points[i + 1]) {
            weights[i] = elapsed;
        }
    }
    weights
}

#[derive(Clone)]
struct Spatial {
    point: Value,
    x: f64,
    z: f64,
    y: Option<f64>,
    distance: f64,
    dx: f64,
    dz: f64,
    lap: i64,
}
fn spatial_points(points: &[Value], circuit: bool) -> Vec<Spatial> {
    let weights = observation_weights(points);
    let stride = ((points.len() + MAX_MATCH_POINTS - 1) / MAX_MATCH_POINTS).max(1);
    let mut result = Vec::new();
    let mut distance_along = 0.0;
    for i in 0..points.len().saturating_sub(1) {
        let a = &points[i];
        let b = &points[i + 1];
        let (Some(ax), Some(az), Some(bx), Some(bz)) = (
            finite(a.get("PositionX")),
            finite(a.get("PositionZ")),
            finite(b.get("PositionX")),
            finite(b.get("PositionZ")),
        ) else {
            continue;
        };
        if weights[i] <= 0.0 {
            continue;
        }
        let dx = bx - ax;
        let dz = bz - az;
        let length = (dx * dx + dz * dz).sqrt();
        if length <= 0.01 {
            continue;
        };
        let distance = distance_along;
        distance_along += length;
        if i % stride != 0 {
            continue;
        }
        let Some(lap) = (if circuit {
            finite(a.get("LapNumber"))
        } else {
            Some(0.0)
        }) else {
            continue;
        };
        result.push(Spatial {
            point: a.clone(),
            x: ax,
            z: az,
            y: finite(a.get("PositionY")),
            distance,
            dx: dx / length,
            dz: dz / length,
            lap: lap as i64,
        });
    }
    result
}
fn matched_pairs(left: &[Spatial], right: &[Spatial]) -> Vec<(usize, usize)> {
    use std::collections::HashMap;
    let mut grid: HashMap<(i64, i64, i64), Vec<usize>> = HashMap::new();
    for (i, p) in right.iter().enumerate() {
        grid.entry((
            (p.x / CELL_METERS).floor() as i64,
            (p.z / CELL_METERS).floor() as i64,
            p.lap,
        ))
        .or_default()
        .push(i);
    }
    let mut used = std::collections::HashSet::new();
    let mut pairs = Vec::new();
    for (ai, a) in left.iter().enumerate() {
        let cx = (a.x / CELL_METERS).floor() as i64;
        let cz = (a.z / CELL_METERS).floor() as i64;
        let mut candidates = Vec::new();
        for x in (cx - 1)..=(cx + 1) {
            for z in (cz - 1)..=(cz + 1) {
                for bi in grid.get(&(x, z, a.lap)).into_iter().flatten() {
                    let b = &right[*bi];
                    if used.contains(bi) || a.dx * b.dx + a.dz * b.dz < 0.9 {
                        continue;
                    }
                    if let (Some(ay), Some(by)) = (a.y, b.y) {
                        if (ay - by).abs() > 3.0 {
                            continue;
                        }
                    }
                    let distance = ((a.x - b.x).powi(2) + (a.z - b.z).powi(2)).sqrt();
                    if distance <= MATCH_METERS {
                        candidates.push((distance, *bi));
                    }
                }
            }
        }
        if let Some((_, bi)) = candidates
            .into_iter()
            .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        {
            used.insert(bi);
            pairs.push((ai, bi));
        }
    }
    pairs
}
fn avg(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

pub fn local_comparison(a_points: &[Value], b_points: &[Value], circuit: bool) -> Value {
    let a = spatial_points(a_points, circuit);
    let b = spatial_points(b_points, circuit);
    let pairs = matched_pairs(&a, &b);
    let a_coverage = if a.is_empty() {
        0.0
    } else {
        pairs.len() as f64 / a.len() as f64
    };
    let b_coverage = if b.is_empty() {
        0.0
    } else {
        pairs.len() as f64 / b.len() as f64
    };
    let route_status = if a_coverage.min(b_coverage) >= ROUTE_COVERAGE_MIN && pairs.len() >= 20 {
        "compatible"
    } else if a.is_empty() || b.is_empty() {
        "insufficient"
    } else {
        "different-or-incomplete"
    };
    let mut comparable = Vec::new();
    let mut segments: std::collections::BTreeMap<i64, (f64, f64, Vec<f64>, [Vec<f64>; 4])> =
        std::collections::BTreeMap::new();
    let max_distance = a.iter().map(|p| p.distance).fold(0.0, f64::max);
    let segment_length = 100.0_f64.max(max_distance / 10.0);
    for (ai, bi) in &pairs {
        let p = &a[*ai].point;
        let q = &b[*bi].point;
        let keys = [
            "SpeedMetersPerSecond",
            "AccelInput",
            "BrakeInput",
            "SteerInput",
        ];
        if !keys
            .iter()
            .all(|k| finite(p.get(*k)).is_some() && finite(q.get(*k)).is_some())
        {
            continue;
        }
        let (Some(ps), Some(qs)) = (finite(p.get(keys[0])), finite(q.get(keys[0]))) else {
            continue;
        };
        if (ps - qs).abs() > 2.0_f64.max(ps.abs() * 0.08) {
            continue;
        }
        if [
            ("AccelInput", 25.0),
            ("BrakeInput", 25.0),
            ("SteerInput", 10.0),
        ]
        .iter()
        .any(|(k, limit)| (finite(p.get(*k)).unwrap() - finite(q.get(*k)).unwrap()).abs() > *limit)
        {
            continue;
        }
        comparable.push((*ai, *bi));
        let index = (a[*ai].distance / segment_length).floor().min(9.0) as i64;
        let segment = segments.entry(index).or_insert_with(|| {
            (
                index as f64 * segment_length,
                (index + 1) as f64 * segment_length,
                Vec::new(),
                [Vec::new(), Vec::new(), Vec::new(), Vec::new()],
            )
        });
        let av: Vec<_> = (0..4).map(|i| wheel(p, "TireSlipAngle", i)).collect();
        let bv: Vec<_> = (0..4).map(|i| wheel(q, "TireSlipAngle", i)).collect();
        if av.iter().all(Option::is_some) && bv.iter().all(Option::is_some) {
            segment.2.push(
                bv.iter().map(|x| x.unwrap().abs()).sum::<f64>() / 4.0
                    - av.iter().map(|x| x.unwrap().abs()).sum::<f64>() / 4.0,
            );
        }
        for i in 0..4 {
            if let (Some(at), Some(bt)) = (wheel(p, "TireTemp", i), wheel(q, "TireTemp", i)) {
                segment.3[i].push((bt - at) * 5.0 / 9.0);
            }
        }
    }
    let mut changes = Vec::new();
    for (ai, bi) in &comparable {
        let av: Vec<_> = (0..4)
            .map(|i| wheel(&a[*ai].point, "TireSlipAngle", i))
            .collect();
        let bv: Vec<_> = (0..4)
            .map(|i| wheel(&b[*bi].point, "TireSlipAngle", i))
            .collect();
        if av.iter().all(Option::is_some) && bv.iter().all(Option::is_some) {
            changes.push(
                bv.iter().map(|x| x.unwrap().abs()).sum::<f64>() / 4.0
                    - av.iter().map(|x| x.unwrap().abs()).sum::<f64>() / 4.0,
            );
        }
    }
    let segment_values: Vec<Value> = segments.into_iter().map(|(index, (from, to, angles, thermal))| json!({ "index": index + 1, "fromMeters": from, "toMeters": to, "matchedLocations": comparable.iter().filter(|(ai, _)| ((a[*ai].distance / segment_length).floor().min(9.0) as i64) == index).count(), "angleLocations": angles.len(), "meanNormalizedAngleChange": avg(&angles), "meanTemperatureChangeC": thermal.into_iter().map(|x| avg(&x)).collect::<Vec<_>>() })).collect();
    json!({ "methodVersion": MATCH_VERSION, "routeStatus": route_status, "baselineCoverage": a_coverage, "candidateCoverage": b_coverage, "matchedLocations": pairs.len(), "matchedDrivingConditions": comparable.len(), "meanNormalizedAngleChange": avg(&changes), "angleLocations": changes.len(), "segments": segment_values, "independentRuns": 2, "limitations": ["Position matching does not establish weather, traffic or clean driving.", "Matched locations are not independent repeated races.", "Matching speed and inputs describes local behavior and may omit part of a setting's effect."], "rules": {"maxPositionDifferenceMeters": MATCH_METERS, "minimumRouteCoverage": ROUTE_COVERAGE_MIN, "minimumHeadingCosine": 0.9, "maxVerticalDifferenceMeters": 3, "maxSpeedDifferenceMps": 2, "maxRelativeSpeedDifference": 0.08, "maxPedalDifferenceRaw": 25, "maxSteeringDifferenceRaw": 10, "pointLimitPerRun": MAX_MATCH_POINTS} })
}
