//! Versioned recommendation composition shared by local HTTP and offline callers.
use super::{
    alignment::{calculate_static_alignment, Season, StaticAlignment},
    calculate_aego_gearing, calculate_chassis_tuning,
    ev::{calculate_ev_gearing, EvGearingInput, EvGearingResult},
    ChassisTuningResult, GearingResult, RaceGoal, TuningCarParams,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredEngine {
    pub engine_max_rpm: f64,
    pub peak_power_rpm: f64,
    pub peak_torque_rpm: f64,
    pub peak_torque_nm: Option<f64>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowRequest {
    pub schema_version: String,
    pub goal: RaceGoal,
    pub season: Season,
    pub profile: Value,
    pub engine: Option<MeasuredEngine>,
    pub ev: Option<EvGearingInput>,
    pub input_snapshot: Value,
    #[serde(default)]
    pub evidence: Option<super::evidence::EvidenceRequest>,
}
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum WorkflowGearing {
    Ice(GearingResult),
    Ev(EvGearingResult),
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Readiness {
    pub mechanical: bool,
    pub engine_inputs: bool,
    pub measured_engine: bool,
    pub gearing_available: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvt: Option<super::cvt::FoundationResult>,
    pub schema_version: &'static str,
    pub chassis: ChassisTuningResult,
    pub alignment: StaticAlignment,
    pub gearing: Option<WorkflowGearing>,
    pub readiness: Readiness,
    pub recommendation: Option<Value>,
}
fn positive(v: f64) -> bool {
    v.is_finite() && v > 0.0
}
pub fn measured_gearing(
    goal: RaceGoal,
    count: usize,
    profile: &TuningCarParams,
    engine: Option<&MeasuredEngine>,
) -> Option<GearingResult> {
    measured_gearing_version(goal, count, profile, engine, false)
}
fn measured_gearing_version(
    goal: RaceGoal,
    count: usize,
    profile: &TuningCarParams,
    engine: Option<&MeasuredEngine>,
    legacy_road: bool,
) -> Option<GearingResult> {
    let engine = engine?;
    if super::cvt::is_cvt(profile)
        || profile.is_electric == Some(true)
        || !(4..=10).contains(&count)
        || !profile.max_hp.is_some_and(positive)
        || ![
            engine.engine_max_rpm,
            engine.peak_power_rpm,
            engine.peak_torque_rpm,
        ]
        .into_iter()
        .all(positive)
        || engine.peak_power_rpm > engine.engine_max_rpm
        || engine.peak_torque_rpm > engine.engine_max_rpm
        || engine.peak_torque_nm.is_some_and(|v| !positive(v))
    {
        return None;
    }
    let mut profile = profile.clone();
    profile.max_hp_rpm = Some(engine.peak_power_rpm);
    profile.max_torque_rpm = Some(engine.peak_torque_rpm);
    if let Some(torque) = engine.peak_torque_nm {
        profile.max_torque = Some(torque);
    }
    let solver = if legacy_road {
        super::gearing::calculate_aego_gearing_v2
    } else {
        calculate_aego_gearing
    };
    let result = solver(goal, count, &profile, engine.engine_max_rpm, None);
    if goal != RaceGoal::Road && result.unsupported == Some(true) {
        None
    } else {
        Some(result)
    }
}
pub fn calculate_workflow(input: WorkflowRequest) -> Result<WorkflowResult, String> {
    if super::cvt::selected(&input.profile) {
        return calculate_qualified(input, None);
    }
    let proof = input
        .evidence
        .as_ref()
        .map(super::evidence::qualify)
        .transpose()?;
    calculate_qualified(input, proof.as_ref())
}
pub(crate) fn calculate_qualified(
    input: WorkflowRequest,
    proof: Option<&super::evidence::QualifiedEvidence>,
) -> Result<WorkflowResult, String> {
    calculate_qualified_version(input, proof, false)
}
pub(crate) fn calculate_qualified_version(
    input: WorkflowRequest,
    proof: Option<&super::evidence::QualifiedEvidence>,
    legacy_road: bool,
) -> Result<WorkflowResult, String> {
    if let Some(proof) = proof {
        proof.validate(&input)?;
    }
    let qualified_ev = proof.map(|p| p.ev_input(&input)).transpose()?.flatten();
    let qualified_engine = proof.and_then(|p| p.engine());
    if input.schema_version != "tuning-workflow-result/v1" {
        return Err("Unsupported tuning calculation schema".into());
    }
    let profile: TuningCarParams =
        serde_json::from_value(input.profile.clone()).map_err(|e| e.to_string())?;
    if !input.profile.is_object() || !input.input_snapshot.is_object() {
        return Err("Profile and inputSnapshot must be objects".into());
    }
    if input.ev.as_ref().is_some_and(|ev| {
        ev.measurements.len() > 10 || ev.measurements.iter().any(|g| g.curve.len() > 207)
    }) {
        return Err("EV evidence exceeds bounded input limits".into());
    }
    let raw_count = input.profile["adjustability"]["gears"]
        .as_f64()
        .filter(|n| *n != 0.0)
        .unwrap_or(6.0);
    let count = if raw_count.fract() == 0.0 && (1.0..=10.0).contains(&raw_count) {
        raw_count as usize
    } else {
        0
    };
    let electric = profile.is_electric == Some(true);
    let chassis = calculate_chassis_tuning(input.goal, &profile);
    let alignment = calculate_static_alignment(input.goal, input.season, &profile);
    if super::cvt::selected(&input.profile) {
        use super::evidence::EvidenceRequest;
        let raw = match &input.evidence {
            Some(EvidenceRequest::CvtCapture { capture }) => Some(capture),
            _ => None,
        };
        let mut cvt = super::cvt::evaluate(&input.profile, &input.input_snapshot, raw);
        if input.evidence.is_some() && raw.is_none() {
            cvt.diagnostics.push(super::cvt::Diagnostic {
                status: super::cvt::Status::Unsupported,
                code: "evidence-mode-mismatch".into(),
                field: "evidence".into(),
            });
            cvt.capture_status = super::cvt::Status::Unsupported;
        }
        return Ok(WorkflowResult {
            cvt: Some(cvt),
            schema_version: "tuning-workflow-result/v1",
            chassis,
            alignment,
            gearing: None,
            recommendation: None,
            readiness: Readiness {
                mechanical: profile.weight.is_some_and(positive)
                    && profile
                        .weight_distribution
                        .is_some_and(|v| positive(v) && v < 100.0),
                engine_inputs: false,
                measured_engine: false,
                gearing_available: false,
            },
        });
    }
    let gearing = if electric {
        qualified_ev
            .as_ref()
            .and_then(calculate_ev_gearing)
            .map(WorkflowGearing::Ev)
    } else {
        measured_gearing_version(input.goal, count, &profile, qualified_engine, legacy_road)
            .map(WorkflowGearing::Ice)
    };
    let mechanical = profile.weight.is_some_and(positive)
        && profile
            .weight_distribution
            .is_some_and(|v| positive(v) && v < 100.0);
    let engine_inputs = mechanical && (electric || profile.max_hp.is_some_and(positive));
    let measured_engine = engine_inputs && proof.is_some();
    let gearing_available = measured_engine
        && match &gearing {
            Some(WorkflowGearing::Ice(g)) => g.unsupported != Some(true) && g.gears.len() == count,
            Some(WorkflowGearing::Ev(_)) => true,
            None => false,
        };
    let mut snapshot = input.input_snapshot;
    if let Some(proof) = proof {
        proof.snapshot(&mut snapshot);
    }
    snapshot["profile"] = input.profile.clone();
    snapshot["goal"] = serde_json::to_value(input.goal).map_err(|e| e.to_string())?;
    snapshot["season"] = serde_json::to_value(input.season).map_err(|e| e.to_string())?;
    if electric {
        snapshot["evResult"] = serde_json::to_value(&gearing).map_err(|e| e.to_string())?;
    }
    let new_road = input.goal == RaceGoal::Road && !electric && !legacy_road;
    if input.goal == RaceGoal::Road && !electric && legacy_road {
        // Historical v1 may predate the optional v2 label, but it cannot claim
        // new-model diagnostics. Validate reserved metadata instead of copying
        // caller claims into the supposedly authoritative expected snapshot.
        if snapshot.get("roadLaunch").is_some()
            || snapshot
                .get("gearingModelVersion")
                .is_some_and(|v| v != "aego-road-joint/v2")
        {
            return Err(
                "Historical Road v1 requires absent/v2 model metadata and no v3 diagnostics".into(),
            );
        }
    } else if !new_road {
        // Road-owned diagnostics have no meaning on other disciplines or EV.
        let object = snapshot.as_object_mut().unwrap();
        object.remove("gearingModelVersion");
        object.remove("roadLaunch");
    }
    if new_road {
        snapshot["gearingModelVersion"] = json!("aego-road-launch-envelope/v3");
        if let (Some(engine), Some(WorkflowGearing::Ice(g))) = (qualified_engine, &gearing) {
            // proof.snapshot replaced this summary with backend-qualified evidence.
            // The telemetry nominal maximum can exceed the observed effective limit.
            let limit_rpm = snapshot["engineCalculation"]["effectiveRedline"]
                .as_f64()
                .filter(|rpm| positive(*rpm) && *rpm <= engine.engine_max_rpm)
                .unwrap_or(engine.engine_max_rpm);
            snapshot["roadLaunch"] = super::gearing::road_launch_diagnostics(
                &profile,
                limit_rpm,
                engine.peak_power_rpm,
                engine.peak_torque_rpm,
                engine.peak_torque_nm.or(profile.max_torque).unwrap_or(0.0),
                g,
            );
        }
    }
    let recommendation = if gearing_available {
        Some(recommendation(
            &input.profile,
            &chassis,
            &alignment,
            gearing.as_ref().unwrap(),
            snapshot,
            new_road,
        ))
    } else {
        None
    };
    Ok(WorkflowResult {
        cvt: None,
        schema_version: "tuning-workflow-result/v1",
        chassis,
        alignment,
        gearing,
        readiness: Readiness {
            mechanical,
            engine_inputs,
            measured_engine,
            gearing_available,
        },
        recommendation,
    })
}
fn recommendation(
    profile: &Value,
    c: &ChassisTuningResult,
    a: &StaticAlignment,
    gearing: &WorkflowGearing,
    mut snapshot: Value,
    new_road: bool,
) -> Value {
    let mut fields = Map::new();
    let mut add = |key: &str, value: f64, unit: &str| {
        fields.insert(key.into(), json!({"value":value,"unit":unit}));
    };
    add("pressure.front", a.pc_f, "psi");
    add("pressure.rear", a.pc_r, "psi");
    for (axle, spring, arb, camber, toe, height, rebound, bump) in [
        (
            "front",
            c.springs.front,
            c.arb.front,
            a.camber.front,
            &a.toe.front,
            c.springs.height_f,
            c.damping.rebound_f,
            c.damping.bump_f,
        ),
        (
            "rear",
            c.springs.rear,
            c.arb.rear,
            a.camber.rear,
            &a.toe.rear,
            c.springs.height_r,
            c.damping.rebound_r,
            c.damping.bump_r,
        ),
    ] {
        for (family, value, unit) in [
            ("spring", spring, "kgf/mm"),
            ("arb", arb, "slider"),
            ("camber", camber, "deg"),
            (
                "toe",
                toe.trim_end_matches('°').parse::<f64>().unwrap(),
                "deg",
            ),
            ("height", height, "cm"),
            ("rebound", rebound, "slider"),
            ("bump", bump, "slider"),
        ] {
            add(&format!("{family}.{axle}"), value, unit);
        }
    }
    add("caster.front", a.caster, "deg");
    if profile["drivetrain"] != "RWD" {
        add("diff.front.acceleration", c.diff.accel_f, "%");
        add("diff.front.deceleration", c.diff.decel_f, "%");
    }
    if profile["drivetrain"] != "FWD" {
        add("diff.rear.acceleration", c.diff.accel_r, "%");
        add("diff.rear.deceleration", c.diff.decel_r, "%");
    }
    if profile["drivetrain"] == "AWD" {
        add("diff.center", c.diff.center_rear, "%");
    }
    let electric = matches!(gearing, WorkflowGearing::Ev(_));
    match gearing {
        WorkflowGearing::Ice(g) => {
            add("gearing.finalDrive", g.final_drive, "ratio");
            for (i, ratio) in g.gears.iter().enumerate() {
                add(&format!("gearing.gear{}", i + 1), *ratio, "ratio");
            }
        }
        WorkflowGearing::Ev(g) => {
            if g.adjustability.final_drive {
                if let Some(ratio) = g.final_drive {
                    add("gearing.finalDrive", ratio, "ratio");
                }
            }
            for (i, ratio) in g.gears.iter().enumerate() {
                if g.adjustability.gears.get(i) == Some(&true) {
                    if let Some(ratio) = ratio {
                        add(&format!("gearing.gear{}", i + 1), *ratio, "ratio");
                    }
                }
            }
        }
    }
    let capability = &profile["adjustability"];
    fields.retain(|key, _| {
        let family = key.split('.').next().unwrap();
        !((matches!(
            family,
            "spring" | "height" | "rebound" | "bump" | "camber" | "toe" | "caster"
        ) && capability["suspension"] != "Race")
            || (family == "arb" && capability["arb"] == "Fixed")
            || (family == "diff" && capability["diff"] == "Fixed")
            || (family == "gearing"
                && !electric
                && (capability["gearbox"] == "Fixed"
                    || (key != "gearing.finalDrive" && capability["gearbox"] != "Full"))))
    });
    if let Some(observation) = snapshot
        .get_mut("engineObservation")
        .and_then(Value::as_object_mut)
    {
        observation.remove("capture");
    }
    json!({"formulaVersion":if electric {"rust/ev-measured-workflow-v1"} else if new_road {"rust/ice-measured-workflow-v2"} else {"rust/ice-measured-workflow-v1"},"inputSnapshot":snapshot,"fields":fields})
}
