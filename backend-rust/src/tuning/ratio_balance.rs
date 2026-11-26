//! User-requested equivalent gearing, owned by Rust and reconstructed from solver output.
//! Bounds are explicitly observed by the user, never inferred from model slider priors.
use super::GearingResult;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Range {
    min: f64,
    max: f64,
    step: f64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bounds {
    source: String,
    final_drive: Range,
    gears: Vec<Range>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: String,
    candidate_final_drive: Option<f64>,
    bounds: Bounds,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<GearingResult>,
    pub legal_final_drives: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_final_drive: Option<f64>,
    pub total_ratio_errors: Vec<f64>,
    pub total_ratio_tolerance: Vec<f64>,
}
impl Diagnostic {
    pub fn unavailable(reason: &'static str) -> Self {
        Self {
            status: "unavailable",
            reason: Some(reason),
            base: None,
            legal_final_drives: vec![],
            selected_final_drive: None,
            total_ratio_errors: vec![],
            total_ratio_tolerance: vec![],
        }
    }
}
// Technical input/complexity limit, not a claimed game range. At most 10,001 FD candidates.
pub(crate) fn ratio_tick(value: f64) -> Option<i64> {
    let scaled = value * 100.0;
    let rounded = scaled.round();
    (value.is_finite()
        && value > 0.0
        && rounded >= 1.0
        && rounded <= i32::MAX as f64
        && (scaled - rounded).abs() < 1e-7)
        .then_some(rounded as i64)
}
pub(crate) fn range_ticks(min: f64, max: f64, step: f64) -> Option<(i64, i64)> {
    (step == 0.01)
        .then(|| ratio_tick(min).zip(ratio_tick(max)))
        .flatten()
        .filter(|&(lo, hi)| lo <= hi && hi - lo <= 10_000)
}
fn in_range(value: f64, range: &Range) -> bool {
    range_ticks(range.min, range.max, range.step)
        .zip(ratio_tick(value))
        .is_some_and(|((lo, hi), tick)| (lo..=hi).contains(&tick))
}
fn allocate(base: &GearingResult, fd: f64, bounds: &Bounds) -> Option<Vec<f64>> {
    if !in_range(fd, &bounds.final_drive) {
        return None;
    }
    let gears: Vec<f64> = base
        .gears
        .iter()
        .map(|g| (base.final_drive * g / fd * 100.0).round() / 100.0)
        .collect();
    if !gears
        .iter()
        .zip(&bounds.gears)
        .all(|(&g, bound)| in_range(g, bound))
        || !gears.windows(2).all(|g| g[0] > g[1])
        || !gears
            .iter()
            .zip(&base.gears)
            .all(|(g, original)| (fd * g - base.final_drive * original).abs() <= fd * 0.005 + 1e-9)
    {
        return None;
    }
    Some(gears)
}
/// An invalid requested adjustment must not silently become an applicable baseline.
/// Always pass the newly computed original solver result, never a prior adjustment.
pub fn calculate(
    profile: &Value,
    base: Option<&GearingResult>,
    raw: &Value,
) -> (Option<GearingResult>, Diagnostic) {
    calculate_checked(profile, base, raw, |_| true)
}

/// The caller supplies freshly reconstructed model constraints, never a client policy.
pub fn calculate_checked<F: Fn(&GearingResult) -> bool>(
    profile: &Value,
    base: Option<&GearingResult>,
    raw: &Value,
    accept: F,
) -> (Option<GearingResult>, Diagnostic) {
    let fail = |reason| (None, Diagnostic::unavailable(reason));
    if profile["isElectric"] == true
        || super::cvt::selected(profile)
        || profile["adjustability"]["gearbox"] != "Full"
    {
        return fail("Requires a fully adjustable discrete ICE gearbox");
    }
    let Some(base) = base.filter(|b| {
        b.unsupported != Some(true)
            && (4..=10).contains(&b.gears.len())
            && ratio_tick(b.final_drive).is_some()
            && b.gears
                .iter()
                .map(|&g| ratio_tick(g))
                .collect::<Option<Vec<_>>>()
                .is_some_and(|ticks| ticks.windows(2).all(|t| t[0] > t[1]))
    }) else {
        return fail("Requires a current qualified gearing recommendation");
    };
    let Ok(request) = serde_json::from_value::<Request>(raw.clone()) else {
        return fail("Invalid ratio balance request");
    };
    let Some((fd_lo, fd_hi)) = (request.schema_version == "ratio-balance/v1"
        && request.bounds.source == "user-observed"
        && request.bounds.gears.len() == base.gears.len()
        && request
            .bounds
            .gears
            .iter()
            .all(|r| range_ticks(r.min, r.max, r.step).is_some()))
    .then(|| {
        range_ticks(
            request.bounds.final_drive.min,
            request.bounds.final_drive.max,
            request.bounds.final_drive.step,
        )
    })
    .flatten() else {
        return fail("Enter observed bounds on a 0.01 grid for the final drive and every gear");
    };
    let bounds = &request.bounds;
    let legal_final_drives: Vec<f64> = (fd_lo..=fd_hi)
        .map(|n| n as f64 / 100.0)
        .filter(|fd| {
            allocate(base, *fd, bounds).is_some_and(|gears| {
                accept(&GearingResult {
                    final_drive: *fd,
                    gears,
                    unsupported: None,
                    unsupported_reason: None,
                })
            })
        })
        .collect();
    let mut diagnostic = Diagnostic {
        status: "unavailable",
        reason: None,
        base: Some(base.clone()),
        legal_final_drives,
        selected_final_drive: None,
        total_ratio_errors: vec![],
        total_ratio_tolerance: vec![],
    };
    let fd_opt = match request.candidate_final_drive {
        Some(raw_fd) => ratio_tick(raw_fd).map(|t| t as f64 / 100.0),
        None => Some(base.final_drive),
    };
    let Some((fd, gears)) = fd_opt.and_then(|fd| allocate(base, fd, bounds).map(|g| (fd, g)))
    else {
        diagnostic.reason =
            Some("Selected final drive cannot preserve ordered ratios within the observed bounds");
        return (None, diagnostic);
    };
    // Reset restores the exact immutable original, not a re-quantized intermediate.
    let selected = if request.candidate_final_drive.is_none() {
        base.clone()
    } else {
        GearingResult {
            final_drive: fd,
            gears,
            unsupported: None,
            unsupported_reason: None,
        }
    };
    if !accept(&selected) {
        diagnostic.reason = Some("Selected final drive violates the model targets or the observed profile bounds. Correct the profile observations before widening their range.");
        return (None, diagnostic);
    }
    diagnostic.status = "available";
    diagnostic.selected_final_drive = Some(selected.final_drive);
    diagnostic.total_ratio_errors = selected
        .gears
        .iter()
        .zip(&base.gears)
        .map(|(g, original)| selected.final_drive * g - base.final_drive * original)
        .collect();
    diagnostic.total_ratio_tolerance = vec![selected.final_drive * 0.005; base.gears.len()];
    (Some(selected), diagnostic)
}
