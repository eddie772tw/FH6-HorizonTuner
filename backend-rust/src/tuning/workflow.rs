//! Versioned recommendation composition shared by local HTTP and offline callers.
use super::{
    aego_model::AegoModel,
    alignment::{calculate_static_alignment, Season, StaticAlignment},
    calculate_chassis_tuning,
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
    pub gearing_diagnostics: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gearing_view: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio_balance: Option<super::ratio_balance::Diagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvt: Option<super::cvt::FoundationResult>,
    pub schema_version: &'static str,
    pub chassis: Option<ChassisTuningResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chassis_diagnostics: Option<Value>,
    pub alignment: StaticAlignment,
    pub gearing: Option<WorkflowGearing>,
    pub readiness: Readiness,
    pub recommendation: Option<Value>,
    pub baseline_preview: Value,
    pub evidence_provenance: Option<Value>,
    pub tire_evidence: Option<Value>,
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
    measured_gearing_version(goal, count, profile, engine, AegoModel::production(goal))
}
/// Explicit opt-in candidate boundary for stack PR 5. This does not switch the
/// production workflow or create an applicable recommendation. In particular,
/// finish targets come from profile even though the measured solver passes None
/// as secondary correction. Raw request peaks cannot qualify this boundary.
pub fn measured_drag_candidate(
    input: &WorkflowRequest,
    proof: &super::evidence::QualifiedEvidence,
) -> Result<super::gearing::contracts::CandidateGearingResult, String> {
    if input.goal != RaceGoal::Drag
        || !["tuning-workflow-result/v1", "tuning-workflow-result/v2"]
            .contains(&input.schema_version.as_str())
    {
        return Err("Drag candidate requires an ICE workflow schema and Drag goal".into());
    }
    proof.validate(input)?;
    let engine = proof
        .engine()
        .ok_or("Drag candidate requires backend-qualified engine capture")?;
    let mut profile: TuningCarParams =
        serde_json::from_value(input.profile.clone()).map_err(|e| e.to_string())?;
    profile.max_hp_rpm = Some(engine.peak_power_rpm);
    profile.max_torque_rpm = Some(engine.peak_torque_rpm);
    profile.max_torque = engine.peak_torque_nm;
    let count = input.profile["adjustability"]["gears"]
        .as_u64()
        .filter(|n| (4..=10).contains(n))
        .ok_or("Drag candidate requires an explicit integer 4-10 gear count")?
        as usize;
    let mut qualified = json!({});
    proof.snapshot(&mut qualified);
    let usable_limit = qualified["engineCalculation"]["effectiveRedline"]
        .as_f64()
        .filter(|rpm| rpm.is_finite() && *rpm > 0.0 && *rpm <= engine.engine_max_rpm)
        .unwrap_or(engine.engine_max_rpm);
    let observed: Option<super::gearing::drag::DragObservedBounds> = input
        .profile
        .get("dragObservedBounds")
        .map(|raw| serde_json::from_value(raw.clone()))
        .transpose()
        .map_err(|e| format!("Invalid Drag observed bounds: {e}"))?;
    Ok(super::gearing::drag::solve_candidate(
        count,
        &profile,
        usable_limit,
        None,
        observed.as_ref(),
    ))
}
fn measured_gearing_version(
    goal: RaceGoal,
    count: usize,
    profile: &TuningCarParams,
    engine: Option<&MeasuredEngine>,
    model: Option<AegoModel>,
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
    let result = match model {
        None => super::gearing::calculate_aego_gearing(
            goal,
            count,
            &profile,
            engine.engine_max_rpm,
            None,
        ),
        Some(model) => {
            super::gearing::models::solve(model, count, &profile, engine.engine_max_rpm, None)
                .gearing
        }
    };
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
    let model = AegoModel::production(input.goal);
    calculate_with_replay_policy(input, proof, model, false, true)
}
pub(crate) fn calculate_saved(
    input: WorkflowRequest,
    proof: &super::evidence::QualifiedEvidence,
    model: Option<AegoModel>,
    formula: &str,
) -> Result<WorkflowResult, String> {
    calculate_with_replay_policy(
        input,
        Some(proof),
        model,
        true,
        formula == "rust/ice-measured-workflow-v4",
    )
}
fn calculate_with_replay_policy(
    input: WorkflowRequest,
    proof: Option<&super::evidence::QualifiedEvidence>,
    model: Option<AegoModel>,
    historical_replay: bool,
    composition_v4: bool,
) -> Result<WorkflowResult, String> {
    if model.is_some_and(|m| m.goal() != input.goal) {
        return Err("AEGO model does not match workflow goal".into());
    }
    if !historical_replay
        && input.schema_version == "tuning-workflow-result/v3"
        && input.profile["isElectric"] == true
        && proof.is_some()
        && !input.input_snapshot["evEvidenceConfirmation"].is_object()
    {
        return Err(
            "Current EV workflow requires independently confirmed identity and configuration"
                .into(),
        );
    }
    if let Some(proof) = proof {
        proof.validate(&input)?;
    }
    let qualified_ev = proof.map(|p| p.ev_input(&input)).transpose()?.flatten();
    let qualified_engine = proof.and_then(|p| p.engine());
    // Reserved AEGO output fields are backend-owned. No historical owner emits
    // these new fields; a fresh calculation discards claims instead of copying
    // them into an authoritative recommendation.
    if historical_replay
        && !composition_v4
        && [
            "gearingModelId",
            "gearingDiagnostics",
            "workflowSchemaVersion",
            "gearingView",
        ]
        .iter()
        .any(|key| input.input_snapshot.get(*key).is_some())
    {
        return Err("Historical recommendation cannot claim new AEGO diagnostics".into());
    }
    if ![
        "tuning-workflow-result/v1",
        "tuning-workflow-result/v2",
        "tuning-workflow-result/v3",
    ]
    .contains(&input.schema_version.as_str())
    {
        return Err("Unsupported tuning calculation schema".into());
    }
    let confirmed_ev = input.schema_version == "tuning-workflow-result/v3";
    if confirmed_ev && (input.profile["isElectric"] != true || super::cvt::selected(&input.profile))
    {
        return Err(
            "Workflow v3 is reserved for independently confirmed fixed-ratio EV evidence".into(),
        );
    }
    let current_chassis = input.schema_version != "tuning-workflow-result/v1";
    let schema_version = if confirmed_ev {
        "tuning-workflow-result/v3"
    } else if current_chassis {
        "tuning-workflow-result/v2"
    } else {
        "tuning-workflow-result/v1"
    };
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
    let calculation = current_chassis.then(|| super::chassis_load::calculate(input.goal, &profile));
    let chassis = match &calculation {
        Some(c) => c.values.clone(),
        None => calculate_chassis_tuning(input.goal, &profile),
    };
    let public_chassis = match &calculation {
        Some(c) => c.public_chassis(),
        None => Some(chassis.clone()),
    };
    let chassis_diagnostics = calculation.as_ref().map(|c| c.diagnostics.clone());
    let alignment = calculate_static_alignment(input.goal, input.season, &profile);
    let mut baseline_preview = super::baseline::preview(
        input.goal,
        &input.profile,
        &input.input_snapshot["baselineCurrent"],
        &chassis,
        &alignment,
    );
    if let Some(calculation) = &calculation {
        super::chassis_load::qualify_preview(&mut baseline_preview, calculation);
    }
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
            gearing_diagnostics: None,
            gearing_view: None,
            ratio_balance: input
                .input_snapshot
                .get("ratioBalance")
                .filter(|v| !v.is_null())
                .map(|_| {
                    super::ratio_balance::Diagnostic::unavailable(
                        "Requires a fully adjustable discrete ICE gearbox",
                    )
                }),
            cvt: Some(cvt),
            schema_version,
            chassis: public_chassis,
            chassis_diagnostics,
            alignment,
            gearing: None,
            recommendation: None,
            baseline_preview,
            evidence_provenance: None,
            tire_evidence: None,
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
    let new_aego = composition_v4 && !electric && model.is_some();
    let mut gearing_diagnostics = None;
    let mut gearing_view = None;
    let mut qualified_profile = profile.clone();
    let mut usable_limit = qualified_engine.map(|e| e.engine_max_rpm).unwrap_or(0.0);
    if let Some(engine) = qualified_engine {
        qualified_profile.max_hp_rpm = Some(engine.peak_power_rpm);
        qualified_profile.max_torque_rpm = Some(engine.peak_torque_rpm);
        qualified_profile.max_torque = engine.peak_torque_nm.or(profile.max_torque);
        let mut summary = json!({});
        if let Some(proof) = proof {
            proof.snapshot(&mut summary);
        }
        usable_limit = summary["engineCalculation"]["effectiveRedline"]
            .as_f64()
            .filter(|rpm| positive(*rpm) && *rpm <= engine.engine_max_rpm)
            .unwrap_or(engine.engine_max_rpm);
    }
    let mut gearing = if new_aego {
        let model = model.unwrap();
        let mut candidate = if !input.profile["adjustability"]["gears"]
            .as_u64()
            .is_some_and(|n| (4..=10).contains(&n))
        {
            super::gearing::models::unavailable(
                model,
                "An explicit integer 4-10 gear count is required",
            )
        } else if !profile.weight.is_some_and(positive)
            || !profile
                .weight_distribution
                .is_some_and(|v| positive(v) && v < 100.0)
            || !profile.max_hp.is_some_and(positive)
        {
            super::gearing::models::unavailable(model,"Complete the vehicle mass, distribution and engine power before calculating gearing")
        } else if qualified_engine.is_some() {
            super::gearing::models::solve(model, count, &qualified_profile, usable_limit, None)
        } else {
            super::gearing::models::unavailable(
                model,
                "Backend-qualified engine capture is required",
            )
        };
        if candidate.gearing.unsupported != Some(true)
            && !super::gearing::models::respects_hard_targets(
                model,
                &candidate.gearing,
                &candidate.diagnostics,
            )
        {
            candidate = super::gearing::models::unavailable(
                model,
                "Rounded gearing does not satisfy the model hard targets",
            );
        }
        gearing_diagnostics = Some(candidate.diagnostics);
        (qualified_engine.is_some() && candidate.gearing.unsupported != Some(true))
            .then_some(WorkflowGearing::Ice(candidate.gearing))
    } else if electric {
        qualified_ev
            .as_ref()
            .and_then(calculate_ev_gearing)
            .map(WorkflowGearing::Ev)
    } else {
        measured_gearing_version(input.goal, count, &profile, qualified_engine, model)
            .map(WorkflowGearing::Ice)
    };
    // Rebuild the immutable base from qualified evidence on every request/replay.
    // Only the request is persisted; client-provided outputs are never accepted.
    let ratio_balance = input
        .input_snapshot
        .get("ratioBalance")
        .filter(|v| !v.is_null())
        .map(|request| {
            if !current_chassis {
                gearing = None;
                return super::ratio_balance::Diagnostic::unavailable(
                    "Ratio balance requires the current workflow",
                );
            }
            let base = match &gearing {
                Some(WorkflowGearing::Ice(base)) => Some(base),
                _ => None,
            };
            let (adjusted, diagnostic) = if new_aego {
                super::ratio_balance::calculate_checked(&input.profile, base, request, |g| {
                    super::gearing::models::respects_hard_targets(
                        model.unwrap(),
                        g,
                        gearing_diagnostics.as_ref().unwrap(),
                    )
                })
            } else {
                super::ratio_balance::calculate(&input.profile, base, request)
            };
            gearing = adjusted.map(WorkflowGearing::Ice);
            diagnostic
        });
    if new_aego {
        if let (Some(WorkflowGearing::Ice(result)), Some(diagnostic)) =
            (&gearing, &gearing_diagnostics)
        {
            if result.unsupported != Some(true) {
                gearing_diagnostics = Some(super::gearing::models::adjusted_diagnostics(
                    model.unwrap(),
                    result,
                    diagnostic,
                ));
            }
        } else if ratio_balance.is_some() {
            if let Some(diagnostic) = &mut gearing_diagnostics {
                diagnostic["status"] = json!("unavailable");
                diagnostic["reason"] =
                    json!(ratio_balance.as_ref().and_then(|d| d.reason).unwrap_or(
                        "The requested ratio balance cannot preserve the model hard targets"
                    ));
            }
        }
        if let (Some(engine), Some(d)) = (qualified_engine, &gearing_diagnostics) {
            let radius = d["tireRadiusM"].as_f64().filter(|v| positive(*v));
            let reference = d["referenceRpm"].as_f64().filter(|v| positive(*v));
            if let (Some(radius), Some(reference)) = (radius, reference) {
                gearing_view = Some(
                    json!({"tireRadiusM":radius,"drivenTireAxle":d["drivenTireAxle"],"referenceRpm":reference,
                    "maxRpm":engine.engine_max_rpm,"effectiveRedline":usable_limit,"powerPeakRpm":engine.peak_power_rpm,
                    "torquePeakRpm":engine.peak_torque_rpm,"speedSemantics":d["speedSemantics"]}),
                );
            }
        }
    }
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
    if let Some(object) = snapshot.as_object_mut() {
        object.remove("gearingModelId");
        object.remove("gearingDiagnostics");
        object.remove("gearingView");
        object.remove("workflowSchemaVersion");
    }
    if let Some(proof) = proof {
        proof.snapshot(&mut snapshot);
    }
    snapshot["profile"] = input.profile.clone();
    snapshot["goal"] = serde_json::to_value(input.goal).map_err(|e| e.to_string())?;
    snapshot["season"] = serde_json::to_value(input.season).map_err(|e| e.to_string())?;
    if let Some(calculation) = &calculation {
        snapshot["chassisModelVersion"] = calculation.diagnostics["modelVersion"].clone();
        snapshot["chassisCalculation"] = calculation.diagnostics.clone();
    } else if snapshot.get("chassisModelVersion").is_some()
        || snapshot.get("chassisCalculation").is_some()
    {
        return Err("Historical workflow cannot claim current chassis metadata".into());
    }
    if electric {
        snapshot["evResult"] = serde_json::to_value(&gearing).map_err(|e| e.to_string())?;
    }
    let new_road = model == Some(AegoModel::RoadLaunchV3) && !electric;
    if !new_road {
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
    if composition_v4 && !electric {
        snapshot["workflowSchemaVersion"] = json!(schema_version);
    }
    if new_aego {
        snapshot["gearingModelVersion"] = json!(model.unwrap().id());
        snapshot["gearingModelId"] = gearing_diagnostics.as_ref().unwrap()["modelId"].clone();
        snapshot["gearingDiagnostics"] = gearing_diagnostics.as_ref().unwrap().clone();
    }
    let recommendation = if gearing_available {
        let mut rec = recommendation(
            &input.profile,
            &chassis,
            &alignment,
            gearing.as_ref().unwrap(),
            snapshot,
        );
        if current_chassis {
            rec["formulaVersion"] = json!(if confirmed_ev {
                "rust/ev-measured-workflow-v3"
            } else if electric {
                "rust/ev-measured-workflow-v2"
            } else {
                "rust/ice-measured-workflow-v4"
            });
            // Only independently qualified mechanical fields can be offered for application.
            let fields = rec["fields"].as_object_mut().unwrap();
            fields.retain(|key, _| {
                key.starts_with("gearing.")
                    || baseline_preview["fields"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|f| f["key"] == *key && f["status"] == "available")
            });
        }
        if composition_v4 && !electric {
            rec["formulaVersion"] = json!("rust/ice-measured-workflow-v4");
        }
        Some(rec)
    } else {
        None
    };
    Ok(WorkflowResult {
        gearing_diagnostics,
        gearing_view,
        ratio_balance,
        cvt: None,
        schema_version,
        chassis: public_chassis,
        chassis_diagnostics,
        alignment,
        gearing,
        readiness: Readiness {
            mechanical,
            engine_inputs,
            measured_engine,
            gearing_available,
        },
        recommendation,
        baseline_preview,
        evidence_provenance: proof.map(|p| p.provenance()),
        tire_evidence: proof.and_then(|p| p.tire_evidence()),
    })
}
pub fn mechanical_fields(
    profile: &Value,
    c: &ChassisTuningResult,
    a: &StaticAlignment,
) -> Map<String, Value> {
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
    let drive = profile["drivetrain"].as_str().map(str::trim);
    if !drive.is_some_and(|s| s.eq_ignore_ascii_case("RWD")) {
        add("diff.front.acceleration", c.diff.accel_f, "%");
        add("diff.front.deceleration", c.diff.decel_f, "%");
    }
    if !drive.is_some_and(|s| s.eq_ignore_ascii_case("FWD")) {
        add("diff.rear.acceleration", c.diff.accel_r, "%");
        add("diff.rear.deceleration", c.diff.decel_r, "%");
    }
    if drive.is_some_and(|s| s.eq_ignore_ascii_case("AWD")) {
        add("diff.center", c.diff.center_rear, "%");
    }
    fields
}
fn recommendation(
    profile: &Value,
    c: &ChassisTuningResult,
    a: &StaticAlignment,
    gearing: &WorkflowGearing,
    mut snapshot: Value,
) -> Value {
    let mut fields = mechanical_fields(profile, c, a);
    let mut add = |key: &str, value: f64, unit: &str| {
        fields.insert(key.into(), json!({"value":value,"unit":unit}));
    };
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
    json!({"formulaVersion":if electric {"rust/ev-measured-workflow-v1"} else {"rust/ice-measured-workflow-v4"},"inputSnapshot":snapshot,"fields":fields})
}
