//! Engineering baseline v1. Legacy chassis remains frozen in chassis.rs.
//! Slider interpolation is a starting point, not a solved suspension geometry.
use super::{
    chassis::calculate_chassis_tuning, ChassisTuningResult, RaceGoal, RallyProfile, TuningCarParams,
};
use serde::Serialize;
use serde_json::{json, Value};

pub const MODEL: &str = "rust/chassis-load-baseline/v1";
pub const LEGACY_MODEL: &str = "rust/chassis-legacy/9bfd6c90";
pub const AERO_INPUT: &str = "optional/v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AeroLoad {
    pub source: &'static str,
    pub front: Option<f64>,
    pub rear: Option<f64>,
    pub reason: Option<&'static str>,
}
fn aero_unavailable(reason: &'static str) -> AeroLoad {
    AeroLoad {
        source: "unavailable",
        front: None,
        rear: None,
        reason: Some(reason),
    }
}
pub fn resolve_aero(p: &TuningCarParams) -> AeroLoad {
    let explicit = p.aero_input_version.as_deref() == Some(AERO_INPUT);
    if p.aero_input_version.is_some() && !explicit {
        return aero_unavailable("unsupported-aero-input-version");
    }
    let supplied = |x: Option<f64>| x.filter(|v| explicit || *v != 0.0);
    let (front, rear) = (
        supplied(p.aero_downforce_front),
        supplied(p.aero_downforce_rear),
    );
    if [front, rear]
        .into_iter()
        .flatten()
        .any(|v| !v.is_finite() || v < 0.0)
    {
        return aero_unavailable("invalid-downforce");
    }
    let (source, f, r) = match (front, rear) {
        (None, None) => ("omitted", 0.0, 0.0),
        (Some(f), Some(r)) => ("provided", f, r),
        _ => {
            // A historical/default balance has no explicit provenance.
            let Some(b) = p.aero_balance.filter(|_| explicit) else {
                return aero_unavailable("aero-balance-required");
            };
            if !b.is_finite() || !(0.0..=1.0).contains(&b) {
                return aero_unavailable("invalid-aero-balance");
            }
            match (front, rear) {
                (Some(f), None) if b > 0.0 => (
                    "derived-rear",
                    f,
                    if f == 0.0 { 0.0 } else { f * ((1.0 - b) / b) },
                ),
                (None, Some(r)) if b < 1.0 => ("derived-front", r * (b / (1.0 - b)), r),
                _ => return aero_unavailable("aero-balance-not-solvable"),
            }
        }
    };
    if !f.is_finite() || !r.is_finite() {
        return aero_unavailable("aero-overflow");
    }
    AeroLoad {
        source,
        front: Some(f),
        rear: Some(r),
        reason: None,
    }
}

/// A decimal grid may not intersect a narrow/locked game interval.
pub fn quantize(value: f64, min: f64, max: f64) -> f64 {
    let low = (min * 10.0).ceil() / 10.0;
    let high = (max * 10.0).floor() / 10.0;
    let bounded = value.clamp(min, max);
    if low.is_finite() && high.is_finite() && low <= high && (bounded * 10.0).is_finite() {
        ((bounded * 10.0).round() / 10.0).clamp(low, high)
    } else {
        bounded
    }
}

pub struct Calculation {
    /// Internal scaffold for unchanged fields and the independently qualified preview.
    pub values: ChassisTuningResult,
    pub diagnostics: Value,
    pub available: bool,
}
impl Calculation {
    pub fn public_chassis(&self) -> Option<ChassisTuningResult> {
        self.available.then(|| self.values.clone())
    }
}

pub fn calculate(goal: RaceGoal, p: &TuningCarParams) -> Calculation {
    let mut values = calculate_chassis_tuning(goal, p);
    if !matches!(goal, RaceGoal::Road | RaceGoal::Rally) {
        return Calculation {
            values,
            available: true,
            diagnostics: json!({"modelVersion":LEGACY_MODEL,"available":true,"reasons":[],"aero":null,"axles":[]}),
        };
    }
    let aero = resolve_aero(p);
    let mut reasons = Vec::new();
    if !p.weight.is_some_and(|v| v.is_finite() && v > 0.0) {
        reasons.push("missing-weight");
    }
    if !p
        .weight_distribution
        .is_some_and(|v| v.is_finite() && v > 0.0 && v < 100.0)
    {
        reasons.push("missing-distribution");
    }
    let ranges = [
        (p.spring_front_min, p.spring_front_max),
        (p.spring_rear_min, p.spring_rear_max),
    ];
    for (i, (min, max)) in ranges.iter().enumerate() {
        if !min
            .zip(*max)
            .is_some_and(|(a, b)| a.is_finite() && b.is_finite() && a > 0.0 && a <= b)
        {
            reasons.push(if i == 0 {
                "invalid-front-spring-range"
            } else {
                "invalid-rear-spring-range"
            });
        }
    }
    let mut axles = Vec::new();
    if reasons.is_empty() {
        let mass = p.weight.unwrap();
        let w = p.weight_distribution.unwrap() / 100.0;
        let lo = [ranges[0].0.unwrap(), ranges[1].0.unwrap()];
        let hi = [ranges[0].1.unwrap(), ranges[1].1.unwrap()];
        let road = goal == RaceGoal::Road;
        let cross = p.rally_profile == Some(RallyProfile::CrossCountry);
        let s = if cross { 0.48 } else { 0.35 };
        let total = lo[0] + lo[1] + ((hi[0] - lo[0]) + (hi[1] - lo[1])) * s;
        let mut springs = [0.0; 2];
        let mut rebounds = [0.0; 2];
        let mut bumps = [0.0; 2];
        for (i, share) in [w, 1.0 - w].into_iter().enumerate() {
            let fraction = if p
                .drivetrain
                .as_deref()
                .is_some_and(|s| s.eq_ignore_ascii_case("FWD"))
            {
                if i == 0 {
                    (share - 0.10).max(0.10)
                } else {
                    (share + 0.10).min(0.90)
                }
            } else {
                share
            };
            let base_raw = if road {
                lo[i] + (hi[i] - lo[i]) * fraction
            } else {
                total * share
            };
            let reference_raw = lo[i]
                + (hi[i] - lo[i])
                    * share
                    * if road {
                        1.0
                    } else if cross {
                        0.85
                    } else {
                        0.65
                    };
            let base = quantize(base_raw, lo[i], hi[i]);
            let reference = quantize(reference_raw, lo[i], hi[i]);
            let force = if i == 0 { aero.front } else { aero.rear };
            // Nominal kgf / static axle kgf, not added inertial mass.
            let gain = 1.0 + force.unwrap_or(0.0) / (mass * share);
            let target = base * gain;
            let spring = quantize(target, lo[i], hi[i]);
            let ref_rebound = if road {
                1.0 + 19.0 * share
            } else {
                (1.0 + 14.0 * share) * if cross { 1.10 } else { 1.0 }
            };
            let rebound_raw = ref_rebound * (spring / reference).sqrt();
            let rebound = quantize(rebound_raw, 1.0, 20.0);
            let bump_raw = rebound
                * if road {
                    0.60
                } else if cross {
                    0.50
                } else {
                    0.40
                };
            let bump = quantize(bump_raw, 1.0, 20.0);
            if ![base_raw, reference_raw, gain, target, rebound_raw, bump_raw]
                .into_iter()
                .all(f64::is_finite)
            {
                reasons.push("chassis-calculation-overflow");
                break;
            }
            springs[i] = spring;
            rebounds[i] = rebound;
            bumps[i] = bump;
            axles.push(json!({"axle":if i==0{"front"}else{"rear"},"baseTarget":base_raw,"baseline":base,"reference":reference,"target":if aero.reason.is_none(){Some(target)}else{None},"baseLimited":base_raw<lo[i]||base_raw>hi[i],"aeroLimited":target>hi[i],"reboundTarget":rebound_raw,"reboundLimited":!(1.0..=20.0).contains(&rebound_raw),"bumpLimited":!(1.0..=20.0).contains(&bump_raw)}));
        }
        if reasons.is_empty() {
            values.springs.front = springs[0];
            values.springs.rear = springs[1];
            values.damping.rebound_f = rebounds[0];
            values.damping.rebound_r = rebounds[1];
            values.damping.bump_f = bumps[0];
            values.damping.bump_r = bumps[1];
        }
    }
    if let Some(reason) = aero.reason {
        reasons.push(reason);
    }
    let available = reasons.is_empty();
    Calculation {
        values,
        available,
        diagnostics: json!({"modelVersion":MODEL,"available":available,"reasons":reasons,"aero":aero,"axles":axles}),
    }
}

/// Independent preview fields remain usable, never the incomplete corrected springs.
pub fn qualify_preview(preview: &mut Value, calculation: &Calculation) {
    preview["modelVersion"] = json!("rust/chassis-alignment-neutral/v2");
    if !calculation.available {
        for field in preview["fields"].as_array_mut().unwrap() {
            let key = field["key"].as_str().unwrap();
            if ["spring.", "rebound.", "bump."]
                .iter()
                .any(|prefix| key.starts_with(prefix))
            {
                if field["reason"].is_null() {
                    field["reason"] = calculation.diagnostics["reasons"][0].clone();
                    field["status"] = json!("unavailable");
                }
                field["recommended"] = Value::Null;
                field["delta"] = Value::Null;
            }
        }
        let affected: Vec<Value> = preview["fields"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|f| f["status"] == "available" && f["delta"].as_f64() != Some(0.0))
            .map(|f| f["key"].clone())
            .collect();
        preview["canApply"] =
            json!(preview["missingInputs"].as_array().unwrap().is_empty() && !affected.is_empty());
        preview["affectedFields"] = json!(affected);
    }
}
