//! Backend-qualified evidence. Request peaks/moments are never provenance.
use super::{
    ev::{EvGearMeasurement, EvGearingInput},
    ev_measurement, measurement,
    workflow::{calculate_qualified, MeasuredEngine, WorkflowRequest, WorkflowResult},
};
use crate::{
    error::{ApiError, ApiResult},
    road::RoadStore,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum EvidenceRequest {
    CvtCapture {
        capture: Value,
    },
    SavedCvt {
        #[serde(rename = "evidenceId")]
        evidence_id: String,
    },
    SavedEngine {
        #[serde(rename = "observationId")]
        observation_id: String,
    },
    SavedEv {
        #[serde(rename = "evidenceId")]
        evidence_id: String,
    },
    EngineCapture {
        observation: Value,
        capture: Value,
    },
    EvCapture {
        #[serde(rename = "carId")]
        car_id: String,
        setup: Value,
        frames: Vec<Value>,
    },
}
#[derive(Clone, Debug, Serialize)]
pub struct QualifiedEvidence {
    #[serde(rename = "powertrain")]
    kind: String,
    car_id: String,
    analysis_version: String,
    identity: Value,
    dependency_key: Option<String>,
    engine: Option<MeasuredEngine>,
    gears: Option<Vec<EvGearMeasurement>>,
    setup: Value,
    observation: Value,
    summary: Value,
    evidence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tire_summary: Option<Value>,
}
pub fn equivalent(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(k, v)| b.get(k).is_some_and(|b| equivalent(v, b)))
        }
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equivalent(a, b))
        }
        _ => a == b,
    }
}
pub fn qualify(raw: &EvidenceRequest) -> Result<QualifiedEvidence, String> {
    match raw {
        EvidenceRequest::EngineCapture {
            observation,
            capture,
        } => {
            let car = observation["carId"]
                .as_str()
                .ok_or("Observation carId is required")?;
            let id = observation["id"]
                .as_str()
                .ok_or("Observation id is required")?;
            let expected = &observation["data"];
            if observation["schema"] != "engine-observation/v1"
                || observation["source"] != "measured"
                || observation["dependencyKey"].as_str().is_none()
                || id.is_empty()
                || capture["schemaVersion"] != "tuning-capture/v1"
                || !expected["identity"].is_object()
                || capture["metadata"]["carId"].as_str() != Some(car)
                || capture["references"]["engineObservationId"].as_str() != Some(id)
                || capture["references"]["dependencyKey"] != observation["dependencyKey"]
            {
                return Err("Capture provenance does not match its observation".into());
            }
            let summary = measurement::analyze(
                &json!({"observationId":id,"carId":car,"capture":capture,"expected":expected}),
            );
            if summary["status"] != "ready" {
                return Err("Capture has no qualified measured engine evidence".into());
            }
            let number = |v: &Value| {
                v.as_f64()
                    .filter(|x| x.is_finite() && *x > 0.0)
                    .ok_or("Invalid measured peak")
            };
            let engine = MeasuredEngine {
                engine_max_rpm: number(&summary["engineMaxRpm"])?,
                peak_power_rpm: number(&summary["peakPower"]["rpm"])?,
                peak_torque_rpm: number(&summary["peakTorque"]["rpm"])?,
                peak_torque_nm: Some(number(&summary["peakTorque"]["value"])?),
            };
            Ok(QualifiedEvidence {
                kind: "ice".into(),
                analysis_version: "engine-loaded-sweep/v4".into(),
                car_id: car.into(),
                identity: expected["identity"].clone(),
                dependency_key: observation["dependencyKey"].as_str().map(str::to_owned),
                engine: Some(engine),
                gears: None,
                setup: Value::Null,
                observation: observation.clone(),
                summary,
                evidence_id: None,
                tire_summary: Some(super::tire_evidence::observe(
                    capture["samples"]
                        .as_array()
                        .ok_or("Capture samples required")?,
                    &json!({"carOrdinal":expected["identity"]["ordinal"],"performanceIndex":expected["identity"]["performanceIndex"],"carClass":expected["identity"]["carClass"]}),
                )),
            })
        }
        EvidenceRequest::EvCapture {
            car_id,
            setup,
            frames,
        } => {
            if frames.is_empty() || frames.len() > 30000 {
                return Err("EV capture requires 1–30000 frames".into());
            }
            let mut state = ev_measurement::initial(car_id);
            for frame in frames {
                state = ev_measurement::advance(&state, frame);
            }
            if state["status"] == "blocked" || !state["identity"].is_object() {
                return Err("EV capture identity is unavailable or changed".into());
            }
            let gears: Vec<EvGearMeasurement> =
                serde_json::from_value(state["gears"].clone()).map_err(|e| e.to_string())?;
            let input = EvGearingInput {
                setup: serde_json::from_value(setup.clone()).map_err(|e| e.to_string())?,
                measurements: gears.clone(),
                candidate_final_drive: setup["finalDrive"].as_f64(),
            };
            if super::ev::calculate_ev_gearing(&input).is_none() {
                return Err("EV capture is not qualified".into());
            }
            Ok(QualifiedEvidence {
                kind: "ev".into(),
                analysis_version: "ev-measurement/v1".into(),
                car_id: car_id.clone(),
                identity: state["identity"].clone(),
                dependency_key: None,
                engine: None,
                gears: Some(gears),
                setup: setup.clone(),
                observation: Value::Null,
                summary: state,
                evidence_id: None,
                tire_summary: None,
            })
        }
        _ => Err("Saved evidence requires the local evidence store".into()),
    }
}
impl QualifiedEvidence {
    pub fn tire_evidence(&self) -> Option<Value> {
        self.tire_summary.clone()
    }
    pub fn provenance(&self) -> Value {
        // ICE capturedAt is observation creation time, not a verified capture window.
        // EV has no equivalent timestamp. Never substitute store/analysis/current time.
        let recorded = if self.kind == "ice" {
            self.observation["capturedAt"]
                .as_f64()
                .filter(|v| v.is_finite() && *v >= 0.0)
        } else {
            None
        };
        json!({"schemaVersion":"tuning-evidence-provenance/v1","evidenceId":self.evidence_id,"source":if self.evidence_id.is_some(){"saved-capture"}else{"imported-capture"},"analysisVersion":self.analysis_version,"carId":self.car_id,"powertrain":self.kind,"identity":self.identity,"observationId":self.observation.get("id"),"observationRecordedAt":recorded,"dependencyKey":self.dependency_key,"capturedAt":null,"sessionId":null,"setupVersion":null,"upgradeVersion":null,"lapWindow":null,"timeWindow":null})
    }
    pub fn calculate(&self, input: WorkflowRequest) -> Result<WorkflowResult, String> {
        calculate_qualified(input, Some(self))
    }

    pub fn engine(&self) -> Option<&MeasuredEngine> {
        self.engine.as_ref()
    }
    pub fn ev_input(&self, input: &WorkflowRequest) -> Result<Option<EvGearingInput>, String> {
        if self.kind != "ev" {
            return Ok(None);
        }
        if !equivalent(&self.setup, &input.profile["evGearbox"]) {
            return Err("EV setup differs from captured configuration".into());
        }
        Ok(Some(EvGearingInput {
            setup: serde_json::from_value(self.setup.clone()).map_err(|e| e.to_string())?,
            measurements: self.gears.clone().unwrap_or_default(),
            candidate_final_drive: input
                .ev
                .as_ref()
                .map(|v| v.candidate_final_drive)
                .unwrap_or(self.setup["finalDrive"].as_f64()),
        }))
    }
    pub fn validate(&self, input: &WorkflowRequest) -> Result<(), String> {
        if super::cvt::selected(&input.profile) {
            return Err("ICE/EV evidence cannot qualify a CVT transmission".into());
        }
        if input.input_snapshot["carId"].as_str() != Some(&self.car_id)
            || (input.profile["isElectric"] == true) != (self.kind == "ev")
        {
            return Err("Evidence belongs to another car or powertrain".into());
        }
        if let Some(key) = &self.dependency_key {
            let expected = json!([
                self.car_id,
                input.profile["drivetrain"],
                input.profile["induction"],
                input.profile["maxHp"],
                input.profile["maxTorque"]
            ]);
            let recorded: Value =
                serde_json::from_str(key).map_err(|_| "Invalid observation dependency key")?;
            if !equivalent(&expected, &recorded) {
                return Err("Evidence belongs to another engine profile".into());
            }
        }
        Ok(())
    }
    pub fn snapshot(&self, snapshot: &mut Value) {
        snapshot["evidenceId"] = json!(self.evidence_id);
        snapshot["evidenceSource"] = json!(if self.evidence_id.is_some() {
            "saved-capture"
        } else {
            "imported-capture"
        });
        snapshot["evidenceAnalysisVersion"] = json!(self.analysis_version);
        snapshot["evidenceIdentity"] = self.identity.clone();
        if self.kind == "ice" {
            snapshot["engineObservation"] = self.observation.clone();
            snapshot["engineCalculation"] = self.summary.clone();
        } else {
            snapshot["evMeasurement"] = self.summary.clone();
            snapshot["evObservation"] = self.observation.clone();
        }
    }
}
#[derive(Clone)]
pub struct EvidenceService {
    pub store: RoadStore,
}
impl EvidenceService {
    fn save(&self, mut proof: QualifiedEvidence, id: Option<&str>) -> ApiResult<QualifiedEvidence> {
        let id = id
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        proof.evidence_id = Some(id.clone());
        let value = serde_json::to_value(&proof)?;
        match self
            .store
            .append("tuning-evidence/v1", "tuning-evidence", &value, Some(&id))
        {
            Ok(_) => Ok(proof),
            Err(e) => self
                .load(&id)
                .map(|mut saved| {
                    if saved.tire_summary.is_none() {
                        saved.tire_summary = proof.tire_summary;
                    }
                    saved
                })
                .or(Err(e)),
        }
    }
    fn load(&self, id: &str) -> ApiResult<QualifiedEvidence> {
        let v = self.store.get(id, Some("tuning-evidence/v1"), None)?;
        let text = |key: &str| {
            v[key]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| ApiError::invalid("Invalid saved evidence metadata"))
        };
        let version = text("analysis_version")?;
        if !matches!(
            (v["powertrain"].as_str(), version.as_str()),
            (Some("ice"), "engine-loaded-sweep/v4") | (Some("ev"), "ev-measurement/v1")
        ) {
            return Err(ApiError::invalid("Unsupported qualified evidence version"));
        }
        Ok(QualifiedEvidence {
            analysis_version: version,
            kind: text("powertrain")?,
            car_id: text("car_id")?,
            identity: v["identity"].clone(),
            dependency_key: v["dependency_key"].as_str().map(str::to_owned),
            engine: serde_json::from_value(v["engine"].clone())?,
            gears: serde_json::from_value(v["gears"].clone())?,
            setup: v["setup"].clone(),
            observation: v["observation"].clone(),
            summary: v["summary"].clone(),
            evidence_id: Some(id.into()),
            tire_summary: v.get("tire_summary").filter(|v| !v.is_null()).cloned(),
        })
    }
    pub fn ev_gearing(&self, input: &Value) -> ApiResult<Value> {
        let id = input["evidenceId"]
            .as_str()
            .ok_or_else(|| ApiError::invalid("Qualified EV evidenceId required"))?;
        let proof = self.resolve(&EvidenceRequest::SavedEv {
            evidence_id: id.into(),
        })?;
        if !equivalent(&proof.setup, &input["setup"]) {
            return Err(ApiError::conflict("EV evidence setup mismatch"));
        }
        let input = EvGearingInput {
            setup: serde_json::from_value(proof.setup)?,
            measurements: proof.gears.unwrap_or_default(),
            candidate_final_drive: input["candidateFinalDrive"].as_f64(),
        };
        Ok(serde_json::to_value(super::ev::calculate_ev_gearing(
            &input,
        ))?)
    }
    pub fn resolve(&self, raw: &EvidenceRequest) -> ApiResult<QualifiedEvidence> {
        self.resolve_with_cache(raw, true)
    }
    fn resolve_with_cache(
        &self,
        raw: &EvidenceRequest,
        persist_cache: bool,
    ) -> ApiResult<QualifiedEvidence> {
        if matches!(
            raw,
            EvidenceRequest::SavedEngine { .. } | EvidenceRequest::SavedEv { .. }
        ) && !std::path::Path::new(&self.store.db_path).exists()
        {
            return Err(ApiError::new(404, "Saved evidence database is unavailable"));
        }
        match raw {
            EvidenceRequest::SavedEngine { observation_id } => {
                let key = format!("qualified-engine-v4:{observation_id}");
                let saved_id = match self.load(&key) {
                    Ok(proof) if proof.tire_summary.is_some() => return Ok(proof),
                    Ok(proof) => proof.evidence_id,
                    Err(_) => None,
                };
                let saved = self
                    .store
                    .get(observation_id, Some("engine-observation"), None)?;
                let mut proof = qualify(&EvidenceRequest::EngineCapture {
                    observation: saved["observation"].clone(),
                    capture: saved["capture"].clone(),
                })
                .map_err(|e| ApiError::invalid(&e))?;
                // Enrich legacy caches without discarding their saved provenance.
                // A cold readonly replay still has no qualified saved ID.
                proof.evidence_id = saved_id;
                if persist_cache {
                    self.save(proof, Some(&key))
                } else {
                    Ok(proof)
                }
            }
            EvidenceRequest::SavedEv { evidence_id } => {
                let proof = self.load(evidence_id)?;
                if proof.kind != "ev" {
                    return Err(ApiError::invalid("EV evidence is required"));
                }
                Ok(proof)
            }
            _ => qualify(raw).map_err(|e| ApiError::invalid(&e)),
        }
    }
    pub fn calculate(&self, input: WorkflowRequest) -> ApiResult<WorkflowResult> {
        self.calculate_with_cache(input, true)
    }
    /// MCP and offline CLI retain read-only semantics, including a cold cache.
    pub fn calculate_read_only(&self, input: WorkflowRequest) -> ApiResult<WorkflowResult> {
        self.calculate_with_cache(input, false)
    }
    fn calculate_with_cache(
        &self,
        mut input: WorkflowRequest,
        persist_cache: bool,
    ) -> ApiResult<WorkflowResult> {
        if input.schema_version != "tuning-workflow-result/v1" {
            return Err(ApiError::invalid("Unsupported tuning calculation schema"));
        }
        if super::cvt::selected(&input.profile) {
            if let Some(EvidenceRequest::SavedCvt { evidence_id }) = &input.evidence {
                if !std::path::Path::new(&self.store.db_path).is_file() {
                    return Err(ApiError::new(404, "Saved evidence database is unavailable"));
                }
                let saved = self
                    .store
                    .get_read_only(evidence_id, Some("cvt-evidence/v1"), None)?;
                // Replay the immutable raw capture; saved qualification is never trusted.
                input.evidence = Some(EvidenceRequest::CvtCapture {
                    capture: saved["capture"].clone(),
                });
            }
            return super::workflow::calculate_workflow(input).map_err(|e| ApiError::invalid(&e));
        }
        let proof = input
            .evidence
            .as_ref()
            .map(|e| self.resolve_with_cache(e, persist_cache))
            .transpose()?;
        calculate_qualified(input, proof.as_ref()).map_err(|e| ApiError::invalid(&e))
    }
    pub fn save_ev(&self, input: &Value) -> ApiResult<Value> {
        let raw: EvidenceRequest =
            serde_json::from_value(input.clone()).map_err(|e| ApiError::invalid(&e.to_string()))?;
        if !matches!(raw, EvidenceRequest::EvCapture { .. }) {
            return Err(ApiError::invalid("Raw EV capture required"));
        }
        let mut proof = qualify(&raw).map_err(|e| ApiError::invalid(&e))?;
        let captured = self.store.append(
            "ev-observation/v1",
            "ev-observations",
            &json!({"capture":input}),
            None,
        )?;
        proof.observation = json!({"id":captured["id"],"carId":proof.car_id,"identity":proof.identity,"schema":"ev-observation/v1","source":"capture-qualified"});
        let proof = self.save(proof, None)?;
        Ok(json!({"evidenceId":proof.evidence_id,"state":proof.summary}))
    }
    pub fn save_cvt(&self, input: &Value) -> ApiResult<Value> {
        let raw: EvidenceRequest = serde_json::from_value(input["evidence"].clone())
            .map_err(|e| ApiError::invalid(&e.to_string()))?;
        let EvidenceRequest::CvtCapture { capture } = raw else {
            return Err(ApiError::invalid("Raw CVT capture required"));
        };
        let result =
            super::cvt::evaluate(&input["profile"], &input["inputSnapshot"], Some(&capture));
        if result.capture_status != super::cvt::Status::Qualified {
            return Err(ApiError::invalid(
                "CVT capture must pass foundation qualification before saving",
            ));
        }
        let saved = self.store.append(
            "cvt-evidence/v1",
            "cvt-evidence",
            &json!({"capture":capture}),
            None,
        )?;
        Ok(json!({"evidenceId":saved["id"],"qualification":result}))
    }
    pub fn verify_recommendation(&self, rec: &Value, identity: Option<&Value>) -> ApiResult<()> {
        let snapshot = &rec["inputSnapshot"];
        let id = snapshot["evidenceId"].as_str().ok_or_else(|| {
            ApiError::invalid("Recommendation requires backend-qualified saved evidence")
        })?;
        let proof = self.load(id)?;
        if let Some(identity) = identity {
            for key in ["ordinal", "performanceIndex", "carClass"] {
                if key == "carClass" && identity.get(key).is_none() {
                    continue;
                }
                if !equivalent(&identity[key], &proof.identity[key]) {
                    return Err(ApiError::conflict(
                        "Recommendation evidence belongs to a different configuration",
                    ));
                }
            }
        }
        let request:WorkflowRequest=serde_json::from_value(json!({"schemaVersion":"tuning-workflow-result/v1","goal":snapshot["goal"],"season":snapshot["season"],"profile":snapshot["profile"],"engine":null,"ev":if proof.kind=="ev"{json!({"setup":proof.setup,"measurements":[],"candidateFinalDrive":snapshot["evResult"]["finalDrive"]})}else{Value::Null},"inputSnapshot":snapshot})).map_err(|e|ApiError::invalid(&e.to_string()))?;
        let expected = super::workflow::calculate_qualified_version(
            request,
            Some(&proof),
            rec["formulaVersion"] == "rust/ice-measured-workflow-v1",
        )
        .map_err(|e| ApiError::invalid(&e))?;
        if !expected
            .recommendation
            .as_ref()
            .is_some_and(|expected| equivalent(expected, rec))
        {
            return Err(ApiError::conflict(
                "Recommendation differs from authoritative measured evidence",
            ));
        }
        Ok(())
    }
}
