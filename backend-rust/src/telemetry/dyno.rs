use serde_json::{Map, Value};

const CADENCE_MULTIPLIER: f64 = 5.0;
const POSITION_FLOOR: f64 = 0.5;
const POSITION_TOLERANCE: f64 = 2.0;
const CONFIDENT_SAMPLES: usize = 8;
fn f(m: Option<&Value>) -> Option<f64> {
    m.and_then(Value::as_f64).filter(|x| x.is_finite())
}
fn fingerprint(frame: &Map<String, Value>) -> Option<(i64, i64, i64)> {
    Some((
        f(frame.get("CarOrdinal"))? as i64,
        f(frame.get("CarClass"))? as i64,
        f(frame.get("CarPerformanceIndex"))? as i64,
    ))
}
// [PERF] Stack-sort small sample windows (<= N) to eliminate per-frame Vec allocation.
fn sort_f64<'a, const N: usize>(v: &[f64], b: &'a mut [f64; N], h: &'a mut Vec<f64>) -> &'a [f64] {
    let s = if v.len() <= N {
        &mut b[..v.len()]
    } else {
        h.resize(v.len(), 0.0);
        h
    };
    s.copy_from_slice(v);
    s.sort_by(f64::total_cmp);
    s
}
fn median(v: &[f64]) -> f64 {
    let (mut b, mut h) = ([0.0_f64; 8], Vec::new());
    let x = sort_f64(v, &mut b, &mut h);
    if x.len() % 2 == 0 {
        (x[x.len() / 2 - 1] + x[x.len() / 2]) / 2.0
    } else {
        x[x.len() / 2]
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DynoQualityAssessment {
    pub status: String,
    pub confidence: f64,
    pub reasons: Vec<String>,
    pub can_collect: bool,
    pub segment_reset: bool,
    pub segment_id: u64,
    pub previous_fingerprint: Option<(i64, i64, i64)>,
}
impl DynoQualityAssessment {
    pub fn as_value(&self) -> Value {
        let mut m = Map::new();
        m.insert("status".into(), Value::from(self.status.clone()));
        m.insert("confidence".into(), Value::from(self.confidence));
        m.insert(
            "reasons".into(),
            Value::Array(self.reasons.iter().cloned().map(Value::from).collect()),
        );
        m.insert("canCollect".into(), Value::from(self.can_collect));
        m.insert("segmentId".into(), Value::from(self.segment_id));
        m.insert("segmentReset".into(), Value::from(self.segment_reset));
        Value::Object(m)
    }
    fn matches_value(&self, v: &Value) -> bool {
        self.reasons.is_empty()
            && v.as_object().is_some_and(|m| m.len() == 6)
            && v["status"].as_str() == Some(&self.status)
            && v["confidence"].as_f64() == Some(self.confidence)
            && v["canCollect"].as_bool() == Some(self.can_collect)
            && v["segmentId"].as_u64() == Some(self.segment_id)
            && v["segmentReset"].as_bool() == Some(self.segment_reset)
            && v["reasons"].as_array().is_some_and(Vec::is_empty)
    }
}

#[derive(Default, Clone, Debug)]
pub struct DynoQualityGate {
    fingerprint: Option<(i64, i64, i64)>,
    prev_timestamp: Option<f64>,
    prev_position: Option<[f64; 3]>,
    prev_speed: Option<f64>,
    deltas: Vec<f64>,
    stable: usize,
    segment_id: u64,
    last_gear: Option<i64>,
    last_gear_change: Option<f64>,
}
impl DynoQualityGate {
    pub fn observe(&mut self, frame: &Value) -> DynoQualityAssessment {
        let Some(frame) = frame.as_object() else {
            return self.unavailable(vec!["timestamp-unavailable".into()], false, None);
        };
        let fp = fingerprint(frame);
        if let (Some(new), Some(old)) = (fp, self.fingerprint) {
            if new != old {
                self.start_segment(new);
                return self.unavailable(vec!["vehicle-profile-changed".into()], true, Some(old));
            }
        }
        if fp.is_some() && self.fingerprint.is_none() {
            self.fingerprint = fp;
        }
        let Some(ts) = f(frame.get("TimestampMS")) else {
            return self.unavailable(vec!["timestamp-unavailable".into()], false, None);
        };
        let mut reasons = Vec::new();
        if let Some(prev) = self.prev_timestamp {
            let d = ts - prev;
            if d <= 0.0 {
                reasons.push("timestamp-non-monotonic".into())
            } else if !self.deltas.is_empty() && d > median(&self.deltas) * CADENCE_MULTIPLIER {
                reasons.push("timestamp-discontinuity".into())
            } else {
                self.deltas.push(d);
                if self.deltas.len() > 8 {
                    self.deltas.remove(0);
                }
            }
        }
        let pos = self.position(frame);
        let speed = self.speed(frame);
        if reasons.is_empty() {
            if let (Some(old), Some(new)) = (self.prev_position, pos) {
                let elapsed = (ts - self.prev_timestamp.unwrap_or(ts)) / 1000.0;
                if elapsed > 0.0 && self.position_jump(old, new, speed, elapsed) {
                    reasons.push("position-discontinuity".into())
                }
            }
        }
        self.prev_timestamp = Some(ts);
        self.prev_position = pos;
        self.prev_speed = speed;
        self.observe_gear(frame, ts);
        if !reasons.is_empty() {
            self.stable = 0;
            return self.assess("suspect", 0.0, reasons, false, false, None);
        }
        self.stable += 1;
        let c = ((self.stable as f64) / (CONFIDENT_SAMPLES as f64)).min(1.0);
        self.assess(
            if self.stable >= CONFIDENT_SAMPLES {
                "confident"
            } else {
                "observing"
            },
            round_python(c, 2),
            vec![],
            true,
            false,
            None,
        )
    }
    pub fn milliseconds_since_gear_change(&self, timestamp: Option<f64>) -> Option<f64> {
        timestamp.and_then(|x| self.last_gear_change.map(|y| x - y))
    }
    fn assess(
        &self,
        status: &str,
        confidence: f64,
        reasons: Vec<String>,
        can: bool,
        reset: bool,
        previous: Option<(i64, i64, i64)>,
    ) -> DynoQualityAssessment {
        DynoQualityAssessment {
            status: status.into(),
            confidence,
            reasons,
            can_collect: can,
            segment_reset: reset,
            segment_id: self.segment_id,
            previous_fingerprint: previous,
        }
    }
    fn unavailable(
        &self,
        reasons: Vec<String>,
        reset: bool,
        previous: Option<(i64, i64, i64)>,
    ) -> DynoQualityAssessment {
        self.assess("unavailable", 0.0, reasons, false, reset, previous)
    }
    fn start_segment(&mut self, fp: (i64, i64, i64)) {
        self.fingerprint = Some(fp);
        self.prev_timestamp = None;
        self.prev_position = None;
        self.prev_speed = None;
        self.deltas.clear();
        self.stable = 0;
        self.last_gear = None;
        self.last_gear_change = None;
        self.segment_id += 1;
    }
    fn observe_gear(&mut self, m: &Map<String, Value>, ts: f64) {
        if let Some(g) = f(m.get("Gear")) {
            let g = g as i64;
            if self.last_gear.is_some() && self.last_gear != Some(g) {
                self.last_gear_change = Some(ts)
            }
            self.last_gear = Some(g)
        }
    }
    fn position(&self, m: &Map<String, Value>) -> Option<[f64; 3]> {
        Some([
            f(m.get("PositionX"))?,
            f(m.get("PositionY"))?,
            f(m.get("PositionZ"))?,
        ])
    }
    fn speed(&self, m: &Map<String, Value>) -> Option<f64> {
        if let Some(v) = f(m.get("SpeedMetersPerSecond")) {
            if v >= 0.0 {
                return Some(v);
            }
        };
        Some(
            (f(m.get("VelocityX"))?.powi(2)
                + f(m.get("VelocityY"))?.powi(2)
                + f(m.get("VelocityZ"))?.powi(2))
            .sqrt(),
        )
    }
    fn position_jump(
        &self,
        old: [f64; 3],
        new: [f64; 3],
        speed: Option<f64>,
        elapsed: f64,
    ) -> bool {
        // [PERF] Compute max of Option<f64> speeds on stack to eliminate per-frame Vec allocation.
        let max_speed = match (self.prev_speed, speed) {
            (Some(a), Some(b)) => a.max(b),
            (Some(a), None) | (None, Some(a)) => a,
            (None, None) => return false,
        };
        let permitted = POSITION_FLOOR.max(max_speed * elapsed * POSITION_TOLERANCE);
        ((new[0] - old[0]).powi(2) + (new[1] - old[1]).powi(2) + (new[2] - old[2]).powi(2)).sqrt()
            > permitted
    }
}

// Python's round uses ties-to-even; f64::round uses ties-away-from-zero.
// The distinction matters for the first quality sample (1/8 == 0.125).
fn round_python(value: f64, digits: i32) -> f64 {
    let scale = 10_f64.powi(digits);
    let scaled = value * scale;
    let floor = scaled.floor();
    let rounded = if (scaled - floor - 0.5).abs() < 1e-10 {
        if (floor as i64) % 2 == 0 {
            floor
        } else {
            floor + 1.0
        }
    } else {
        scaled.round()
    };
    rounded / scale
}

#[derive(Default, Clone, Debug)]
pub struct DynoQualityGateRegistry {
    gates: std::collections::HashMap<String, DynoQualityGate>,
}
impl DynoQualityGateRegistry {
    pub fn observe(&mut self, id: &str, frame: &Value) -> DynoQualityAssessment {
        // [PERF] In the 60Hz telemetry processing path, avoid unconditional String allocation
        // when the car gate entry already exists in the registry.
        if let Some(gate) = self.gates.get_mut(id) {
            gate.observe(frame)
        } else {
            self.gates.entry(id.to_string()).or_default().observe(frame)
        }
    }
    pub fn milliseconds_since_gear_change(&self, id: &str, timestamp: Option<f64>) -> Option<f64> {
        self.gates
            .get(id)
            .and_then(|x| x.milliseconds_since_gear_change(timestamp))
    }
    pub fn discard(&mut self, id: &str) {
        self.gates.remove(id);
    }
}

pub fn reconcile_dyno_profile_segment(
    profile: &mut Value,
    quality: &DynoQualityAssessment,
) -> bool {
    let Some(m) = profile.as_object_mut() else {
        return false;
    };
    // [PERF] Skip allocating and re-inserting dyno_quality when steady-state assessment is unchanged.
    if m.get("dyno_quality")
        .is_none_or(|e| !quality.matches_value(e))
    {
        m.insert("dyno_quality".into(), quality.as_value());
    }
    if !quality.segment_reset {
        return false;
    };
    let previous = m
        .remove("dyno_curve")
        .unwrap_or_else(|| Value::Object(Map::new()));
    if !previous.as_object().map(|x| x.is_empty()).unwrap_or(true) {
        let segs = m
            .entry("dyno_curve_segments")
            .or_insert_with(|| Value::Array(vec![]));
        if let Some(a) = segs.as_array_mut() {
            let mut s = Map::new();
            s.insert(
                "fingerprint".into(),
                Value::Array(
                    quality
                        .previous_fingerprint
                        .map(|x| vec![Value::from(x.0), Value::from(x.1), Value::from(x.2)])
                        .unwrap_or_default(),
                ),
            );
            s.insert("curve".into(), previous);
            s.insert(
                "ended_reason".into(),
                Value::from("vehicle-profile-changed"),
            );
            a.push(Value::Object(s));
            if a.len() > 5 {
                let n = a.len() - 5;
                a.drain(0..n);
            }
        }
    }
    m.insert("dyno_curve".into(), Value::Object(Map::new()));
    true
}

pub const DYNO_BUCKET_SIZE: i64 = 50;
pub const DYNO_MAX_HISTORY: usize = 50;
// Bound unauthenticated UDP dyno buckets to physical engine RPMs to prevent
// i64 bucket overflow and unbounded dyno_curve memory/disk exhaustion.
pub const DYNO_MAX_RPM: f64 = 30_000.0;
pub const DYNO_MAX_BUCKETS: usize = (DYNO_MAX_RPM as usize / DYNO_BUCKET_SIZE as usize) + 1;
pub const DYNO_ANOMALY_THRESHOLD: f64 = 0.30;
pub const DYNO_NEIGHBOR_OFFSETS: [i64; 8] = [-200, -150, -100, -50, 50, 100, 150, 200];

pub fn create_default_car_params() -> Value {
    serde_json::json!({"weight":1500,"weight_distribution":50,"drivetrain":"RWD","frontTireWidth":245,"frontTireAspect":40,"frontTireRim":18,"rearTireWidth":245,"rearTireAspect":40,"rearTireRim":18,"adjustability":{"gearbox":"Full","gears":6,"suspension":"Race","arb":"Adjustable"},"dyno_curve":{}})
}
pub fn compute_dyno_value(history: &[f64]) -> f64 {
    if history.is_empty() {
        return 0.0;
    }
    if history.len() < 4 {
        return history.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    }
    let (mut b, mut h) = ([0.0_f64; DYNO_MAX_HISTORY], Vec::new());
    let s = sort_f64(history, &mut b, &mut h);
    let q1 = s[history.len() / 4];
    let q3 = s[(3 * history.len()) / 4];
    let lo = q1 - 1.5 * (q3 - q1);
    let hi = q3 + 1.5 * (q3 - q1);
    let mut total = 0.0;
    let mut weight = 0.0;
    for (i, v) in history.iter().enumerate() {
        if *v >= lo && *v <= hi {
            let w = 1.0 + i as f64;
            total += v * w;
            weight += w
        }
    }
    if weight == 0.0 {
        history.iter().copied().fold(f64::NEG_INFINITY, f64::max)
    } else {
        total / weight
    }
}
pub fn dyno_is_reasonable(new_value: f64, neighbors: &[f64], threshold: f64) -> bool {
    if neighbors.is_empty() {
        return true;
    }
    let max = neighbors.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    max <= 0.0 || new_value <= max * (1.0 + threshold)
}
/// Apply one Python-compatible dyno collection step to an in-memory profile.
/// Returns true when either HP or torque history changed; callers decide when
/// to enqueue the profile for persistence.
pub fn collect_dyno_sample(
    profile: &mut Value,
    frame: &Value,
    quality: &DynoQualityAssessment,
    settings: &Value,
    gate: &DynoQualityGateRegistry,
    car_id: &str,
) -> bool {
    if !quality.can_collect {
        return false;
    }
    let Some(p) = profile.as_object_mut() else {
        return false;
    };
    let Some(d) = frame.as_object() else {
        return false;
    };
    let setting =
        |k: &str, default: bool| settings.get(k).and_then(Value::as_bool).unwrap_or(default);
    let rpm_f = i(d, "CurrentEngineRpm", 0.0);
    if !setting("dyno_recording", true)
        || !rpm_f.is_finite()
        || rpm_f <= 0.0
        || rpm_f > DYNO_MAX_RPM
        || i(d, "AccelInput", 0.0) != 255.0
        || i(d, "Gear", 0.0) <= 0.0
        || i(d, "ClutchInput", 0.0) != 0.0
    {
        return false;
    }
    let target = settings
        .get("dyno_test_gear")
        .and_then(Value::as_i64)
        .unwrap_or(4);
    if target != 0 && i(d, "Gear", 0.0) as i64 != target {
        return false;
    }
    if i(d, "BrakeInput", 0.0) != 0.0 || i(d, "HandBrakeInput", 0.0) != 0.0 {
        return false;
    }
    if setting("dyno_filter_transients", true)
        && gate
            .milliseconds_since_gear_change(car_id, f(d.get("TimestampMS")))
            .map(|x| x < 500.0)
            .unwrap_or(false)
    {
        return false;
    }
    if setting("dyno_filter_slip", true) {
        let drive = p.get("drivetrain").and_then(Value::as_str).unwrap_or("RWD");
        let a = d.get("TireSlipRatio").and_then(Value::as_array);
        let slip = |n| {
            a.and_then(|x| x.get(n))
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .abs()
        };
        let bad = if drive == "RWD" {
            slip(2) > 0.1 || slip(3) > 0.1
        } else if drive == "FWD" {
            slip(0) > 0.1 || slip(1) > 0.1
        } else {
            (0..4).any(|n| slip(n) > 0.1)
        };
        if bad {
            return false;
        }
    }
    let rpm = rpm_f as i64;
    let bucket = (rpm / DYNO_BUCKET_SIZE) * DYNO_BUCKET_SIZE;
    // Guard against malformed API/disk profile shapes so bad JSON cannot panic
    // the single telemetry processing worker thread.
    if !p.get("dyno_curve").is_some_and(Value::is_object) {
        p.insert("dyno_curve".into(), Value::Object(Map::new()));
    }
    let Some(c) = p.get_mut("dyno_curve").and_then(Value::as_object_mut) else {
        return false;
    };
    // [PERF] Format bucket/neighbor keys on stack and accumulate bounded samples without heap allocations.
    let (mut key_buf, mut hp_n, mut hp_len, mut tq_n, mut tq_len) =
        ([0u8; 24], [0.0_f64; 8], 0, [0.0_f64; 8], 0);
    for offset in DYNO_NEIGHBOR_OFFSETS {
        if let Some(n) = c.get(i64_key(bucket + offset, &mut key_buf)) {
            push_f64(n, "hp", &mut hp_n, &mut hp_len);
            push_f64(n, "torque", &mut tq_n, &mut tq_len);
        }
    }
    let key_str = i64_key(bucket, &mut key_buf);
    if !c.contains_key(key_str) && c.len() >= DYNO_MAX_BUCKETS {
        return false;
    }
    if !c.get(key_str).is_some_and(Value::is_object) {
        c.insert(key_str.to_owned(), bucket_val());
    }
    let Some(em) = c.get_mut(key_str).and_then(Value::as_object_mut) else {
        return false;
    };
    let hp = i(d, "PowerWatts", 0.0) / 745.7;
    let torque = i(d, "TorqueNewtons", 0.0) * 0.73756;
    let mut changed = false;
    let mut vals = [0.0_f64; DYNO_MAX_HISTORY];
    for (field, value, neigh, hist_key) in [
        ("hp", hp, &hp_n[..hp_len], "hp_hist"),
        ("torque", torque, &tq_n[..tq_len], "torque_hist"),
    ] {
        if value.is_finite() && dyno_is_reasonable(value, neigh, DYNO_ANOMALY_THRESHOLD) {
            if !em.get(hist_key).is_some_and(Value::is_array) {
                em.insert(hist_key.to_owned(), Value::Array(vec![]));
            }
            let Some(a) = em.get_mut(hist_key).and_then(Value::as_array_mut) else {
                continue;
            };
            a.push(Value::from(value));
            if a.len() > DYNO_MAX_HISTORY {
                a.drain(0..a.len() - DYNO_MAX_HISTORY);
            }
            let mut count = 0;
            for v in a.iter().filter_map(Value::as_f64) {
                vals[count] = v;
                count += 1;
            }
            *ensure(em, field, Value::default) = Value::from(compute_dyno_value(&vals[..count]));
            changed = true;
        }
    }
    changed
}
fn push_f64(n: &Value, k: &str, a: &mut [f64; 8], l: &mut usize) {
    if let Some(v) = n.get(k).and_then(Value::as_f64) {
        a[*l] = v;
        *l += 1;
    }
}
fn ensure<'a>(m: &'a mut Map<String, Value>, k: &str, f: fn() -> Value) -> &'a mut Value {
    if !m.contains_key(k) {
        m.insert(k.to_owned(), f());
    }
    m.get_mut(k).unwrap()
}
fn bucket_val() -> Value {
    serde_json::json!({"hp":0,"torque":0,"hp_hist":[],"torque_hist":[]})
}
fn i64_key(n: i64, buf: &mut [u8; 24]) -> &str {
    let mut w = &mut buf[..];
    let _ = std::io::Write::write_fmt(&mut w, format_args!("{n}"));
    let len = 24 - w.len();
    std::str::from_utf8(&buf[..len]).unwrap_or("0")
}
fn i(m: &Map<String, Value>, k: &str, d: f64) -> f64 {
    m.get(k).and_then(Value::as_f64).unwrap_or(d)
}
