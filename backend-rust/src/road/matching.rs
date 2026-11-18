use serde_json::{json, Value};

const MATCH_VERSION: &str = "road-spatial/v1";
const CELL_METERS: f64 = 20.0;
const MATCH_METERS: f64 = 8.0;
const MATCH_METERS_SQ: f64 = MATCH_METERS * MATCH_METERS;
const ROUTE_COVERAGE_MIN: f64 = 0.8;
const MAX_MATCH_POINTS: usize = 4000;

fn finite(v: Option<&Value>) -> Option<f64> {
    let x = v?.as_f64()?;
    x.is_finite().then_some(x)
}
#[derive(Clone, Copy, Default)]
struct SpatialMeta {
    ts_ms: Option<f64>,
    time: Option<f64>,
    driving: bool,
    x: Option<f64>,
    y: Option<f64>,
    z: Option<f64>,
    lap: Option<f64>,
}
impl SpatialMeta {
    // [PERF] Single IndexMap scan per point replaces ~16 SipHash lookups and weights Vec alloc.
    fn from_value(point: &Value) -> Self {
        let mut m = Self::default();
        for (k, v) in point.as_object().into_iter().flatten() {
            match k.as_str() {
                "TimestampMS" => m.ts_ms = finite(Some(v)),
                "time" => m.time = finite(Some(v)),
                "SpeedMetersPerSecond" => m.driving = finite(Some(v)).is_some_and(|x| x > 2.0),
                "PositionX" => m.x = finite(Some(v)),
                "PositionY" => m.y = finite(Some(v)),
                "PositionZ" => m.z = finite(Some(v)),
                "LapNumber" => m.lap = finite(Some(v)),
                _ => {}
            }
        }
        m
    }
    fn time(self) -> Option<f64> {
        self.ts_ms.map(|x| x / 1000.0).or(self.time)
    }
}

#[derive(Clone)]
struct Spatial<'a> {
    point: &'a Value,
    x: f64,
    z: f64,
    y: Option<f64>,
    distance: f64,
    dx: f64,
    dz: f64,
    lap: i64,
}
fn spatial_points(points: &[Value], circuit: bool) -> Vec<Spatial<'_>> {
    if points.len() < 2 {
        return Vec::new();
    }
    let stride = ((points.len() + MAX_MATCH_POINTS - 1) / MAX_MATCH_POINTS).max(1);
    let mut result =
        Vec::with_capacity(((points.len() + stride - 1) / stride).min(MAX_MATCH_POINTS));
    let mut distance_along = 0.0;
    let mut cur = SpatialMeta::from_value(&points[0]);
    for i in 0..points.len() - 1 {
        let prev = cur;
        cur = SpatialMeta::from_value(&points[i + 1]);
        let (Some(ax), Some(az), Some(bx), Some(bz)) = (prev.x, prev.z, cur.x, cur.z) else {
            continue;
        };
        let (Some(at), Some(bt)) = (prev.time(), cur.time()) else {
            continue;
        };
        let elapsed = bt - at;
        if !(elapsed > 0.0 && elapsed <= 0.5 && prev.driving && cur.driving) {
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
        let Some(lap) = (if circuit { prev.lap } else { Some(0.0) }) else {
            continue;
        };
        result.push(Spatial {
            point: &points[i],
            x: ax,
            z: az,
            y: prev.y,
            distance,
            dx: dx / length,
            dz: dz / length,
            lap: lap as i64,
        });
    }
    result
}
fn matched_pairs(left: &[Spatial<'_>], right: &[Spatial<'_>]) -> Vec<(usize, usize)> {
    use std::collections::HashMap;
    let mut grid: HashMap<(i64, i64, i64), Vec<usize>> =
        HashMap::with_capacity(right.len() / 4 + 16);
    for (i, p) in right.iter().enumerate() {
        grid.entry((
            (p.x / CELL_METERS).floor() as i64,
            (p.z / CELL_METERS).floor() as i64,
            p.lap,
        ))
        .or_default()
        .push(i);
    }
    // [PERF] Use flat Vec<bool> and closest squared distance to avoid HashSet, 4k Vec allocs, and inner sqrt().
    let mut used = vec![false; right.len()];
    let mut pairs = Vec::with_capacity(left.len().min(right.len()));
    for (ai, a) in left.iter().enumerate() {
        let cx = (a.x / CELL_METERS).floor() as i64;
        let cz = (a.z / CELL_METERS).floor() as i64;
        let mut best: Option<(f64, usize)> = None;
        for x in (cx - 1)..=(cx + 1) {
            for z in (cz - 1)..=(cz + 1) {
                for &bi in grid.get(&(x, z, a.lap)).into_iter().flatten() {
                    let b = &right[bi];
                    if used[bi] || a.dx * b.dx + a.dz * b.dz < 0.9 {
                        continue;
                    }
                    if let (Some(ay), Some(by)) = (a.y, b.y) {
                        if (ay - by).abs() > 3.0 {
                            continue;
                        }
                    }
                    let dist_sq = (a.x - b.x).powi(2) + (a.z - b.z).powi(2);
                    if dist_sq <= MATCH_METERS_SQ && best.is_none_or(|b| (dist_sq, bi) < b) {
                        best = Some((dist_sq, bi));
                    }
                }
            }
        }
        if let Some((_, bi)) = best {
            used[bi] = true;
            pairs.push((ai, bi));
        }
    }
    pairs
}
#[derive(Default)]
struct PairSample<'a> {
    speed: Option<f64>,
    accel: Option<f64>,
    brake: Option<f64>,
    steer: Option<f64>,
    angles: Option<&'a [Value]>,
    temps: Option<&'a [Value]>,
}
impl<'a> PairSample<'a> {
    fn from_value(point: &'a Value) -> Self {
        let mut s = Self::default();
        for (k, v) in point.as_object().into_iter().flatten() {
            match k.as_str() {
                "SpeedMetersPerSecond" => s.speed = finite(Some(v)),
                "AccelInput" => s.accel = finite(Some(v)),
                "BrakeInput" => s.brake = finite(Some(v)),
                "SteerInput" => s.steer = finite(Some(v)),
                "TireSlipAngle" => s.angles = v.as_array().map(Vec::as_slice),
                "TireTemp" => s.temps = v.as_array().map(Vec::as_slice),
                _ => {}
            }
        }
        s
    }
}
fn avg_sum(sum: f64, count: usize) -> Option<f64> {
    (count > 0).then(|| sum / count as f64)
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
    let mut comparable_count = 0;
    let (mut change_sum, mut change_count) = (0.0_f64, 0_usize);
    let mut segments: std::collections::BTreeMap<
        i64,
        (f64, f64, (f64, usize), [(f64, usize); 4], usize),
    > = std::collections::BTreeMap::new();
    let max_distance = a.iter().map(|p| p.distance).fold(0.0, f64::max);
    let segment_length = 100.0_f64.max(max_distance / 10.0);
    for (ai, bi) in &pairs {
        let (p, q) = (
            PairSample::from_value(a[*ai].point),
            PairSample::from_value(b[*bi].point),
        );
        let (Some(ps), Some(qs), Some(pa), Some(qa), Some(pb), Some(qb), Some(pst), Some(qst)) = (
            p.speed, q.speed, p.accel, q.accel, p.brake, q.brake, p.steer, q.steer,
        ) else {
            continue;
        };
        if (ps - qs).abs() > 2.0_f64.max(ps.abs() * 0.08)
            || (pa - qa).abs() > 25.0
            || (pb - qb).abs() > 25.0
            || (pst - qst).abs() > 10.0
        {
            continue;
        }
        let index = (a[*ai].distance / segment_length).floor().min(9.0) as i64;
        let segment = segments.entry(index).or_insert_with(|| {
            (
                index as f64 * segment_length,
                (index + 1) as f64 * segment_length,
                (0.0, 0),
                [(0.0, 0); 4],
                0,
            )
        });
        comparable_count += 1;
        segment.4 += 1;
        let (mut p_angle_sum, mut q_angle_sum, mut angle_count) = (0.0, 0.0, 0);
        for i in 0..4 {
            if let (Some(at), Some(bt)) = (
                p.angles.and_then(|v| finite(v.get(i))),
                q.angles.and_then(|v| finite(v.get(i))),
            ) {
                p_angle_sum += at.abs();
                q_angle_sum += bt.abs();
                angle_count += 1;
            }
            if let (Some(at), Some(bt)) = (
                p.temps.and_then(|v| finite(v.get(i))),
                q.temps.and_then(|v| finite(v.get(i))),
            ) {
                segment.3[i].0 += (bt - at) * 5.0 / 9.0;
                segment.3[i].1 += 1;
            }
        }
        if angle_count == 4 {
            let change = q_angle_sum / 4.0 - p_angle_sum / 4.0;
            segment.2 .0 += change;
            segment.2 .1 += 1;
            change_sum += change;
            change_count += 1;
        }
    }
    let segment_values: Vec<Value> = segments
        .into_iter()
        .map(|(index, (from, to, angles, thermal, matched))| json!({ "index": index + 1, "fromMeters": from, "toMeters": to, "matchedLocations": matched, "angleLocations": angles.1, "meanNormalizedAngleChange": avg_sum(angles.0, angles.1), "meanTemperatureChangeC": thermal.into_iter().map(|(s, c)| avg_sum(s, c)).collect::<Vec<_>>() }))
        .collect();
    json!({ "methodVersion": MATCH_VERSION, "routeStatus": route_status, "baselineCoverage": a_coverage, "candidateCoverage": b_coverage, "matchedLocations": pairs.len(), "matchedDrivingConditions": comparable_count, "meanNormalizedAngleChange": avg_sum(change_sum, change_count), "angleLocations": change_count, "segments": segment_values, "independentRuns": 2, "limitations": ["Position matching does not establish weather, traffic or clean driving.", "Matched locations are not independent repeated races.", "Matching speed and inputs describes local behavior and may omit part of a setting's effect."], "rules": {"maxPositionDifferenceMeters": MATCH_METERS, "minimumRouteCoverage": ROUTE_COVERAGE_MIN, "minimumHeadingCosine": 0.9, "maxVerticalDifferenceMeters": 3, "maxSpeedDifferenceMps": 2, "maxRelativeSpeedDifference": 0.08, "maxPedalDifferenceRaw": 25, "maxSteeringDifferenceRaw": 10, "pointLimitPerRun": MAX_MATCH_POINTS} })
}
