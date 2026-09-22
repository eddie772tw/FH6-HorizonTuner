use super::{
    analysis::summarize_road_observations, comparison::compare_road_runs, models::validate_request,
    store::RoadStore, tuning_capture::export_road_capture,
};
use crate::error::{ApiError, ApiResult};
use serde_json::{json, Value};
use std::{
    sync::Arc,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

/// Implemented by the telemetry worker.  Methods mirror Python TelemetrySQLite
/// to keep the migration free of an adapter layer.
use crate::telemetry::TelemetryStore;
pub struct RoadService {
    pub database: Arc<TelemetryStore>,
    pub store: RoadStore,
    active: Option<Value>,
    latest_identity: Option<Value>,
    latest_timestamp: Option<f64>,
    latest_class: i64,
    progress_at: Option<Instant>,
    stable_frames: u32,
    sequence: u64,
    last_error: Option<String>,
    pending: Vec<Value>,
    recorded_count: usize,
}
impl RoadService {
    pub fn new(database: Arc<TelemetryStore>, store: RoadStore) -> Self {
        Self {
            database,
            store,
            active: None,
            latest_identity: None,
            latest_timestamp: None,
            latest_class: 0,
            progress_at: None,
            stable_frames: 0,
            sequence: 0,
            last_error: None,
            pending: Vec::new(),
            recorded_count: 0,
        }
    }
    fn identity(frame: &Value) -> Option<Value> {
        let o = frame.as_object()?;
        let ord = o.get("CarOrdinal")?.as_f64()?;
        let pi = o.get("CarPerformanceIndex")?.as_f64()?;
        let dt = o.get("DrivetrainType")?.as_f64()?;
        if !ord.is_finite()
            || ord <= 0.0
            || ord.fract() != 0.0
            || !pi.is_finite()
            || pi.fract() != 0.0
            || !(0.0..=2.0).contains(&dt)
            || dt.fract() != 0.0
        {
            return None;
        }
        Some(json!({"ordinal":ord as i64,"performanceIndex":pi as i64,"drivetrain":dt as i64}))
    }
    pub fn observe(&mut self, frame: &Value) {
        let id = Self::identity(frame);
        let ts = frame.get("TimestampMS").and_then(Value::as_f64);
        let progressed = ts.is_some_and(|x| x.is_finite() && Some(x) != self.latest_timestamp);
        if id.is_some() && progressed {
            self.stable_frames = if id == self.latest_identity
                && self.latest_timestamp.is_none_or(|x| ts.unwrap() > x)
            {
                self.stable_frames + 1
            } else {
                1
            };
            self.latest_identity = id.clone();
            self.latest_timestamp = ts;
            self.latest_class = frame.get("CarClass").and_then(Value::as_i64).unwrap_or(0);
            self.progress_at = Some(Instant::now());
            self.sequence += 1;
        }
        let armed = self
            .active
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|a| a.get("armedSequence"))
            .and_then(Value::as_u64);
        let expected = self
            .active
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|a| a.get("identity"))
            .cloned();
        let Some(armed) = armed else { return };
        if self.sequence <= armed {
            return;
        }
        if id.is_some() && id != expected {
            self.flush_pending();
            let run = self.active.take();
            if let Some(run) = run {
                let _ = self.summarize_with_reason(&run, "identity-changed");
            }
            return;
        }
        if id.is_none() || !progressed {
            return;
        }
        if frame.get("IsRaceOn").and_then(Value::as_i64) == Some(1)
            && frame
                .get("CurrentRaceTime")
                .and_then(Value::as_f64)
                .is_some_and(|x| x > 0.0)
        {
            self.pending.push(frame.clone());
        }
    }
    pub fn live(&self) -> Value {
        let fresh = self
            .progress_at
            .is_some_and(|t| t.elapsed().as_secs_f64() < 2.0)
            && self.stable_frames >= 2;
        let count = self.recorded_count + self.pending.len();
        json!({"identity":self.latest_identity,"fresh":fresh,"source":if fresh{"measured"}else{"unknown"},"activeRun":self.active,"sampleCount":count,"state":if self.active.as_ref().is_some_and(|_|count>0){"recording"}else if self.active.is_some(){"waiting-for-race"}else{"idle"},"error":self.last_error})
    }
    pub fn record(&mut self, frame: &Value) {
        self.observe(frame)
    }
    pub fn create(&self, request: Value) -> ApiResult<Value> {
        validate_request("workflow", &request)?;
        let id = Uuid::new_v4().simple().to_string();
        let mut payload = request.as_object().cloned().unwrap_or_default();
        payload.insert(
            "identitySource".into(),
            Value::String(
                if self.live()["fresh"].as_bool() == Some(true) {
                    "measured"
                } else {
                    "game-confirmed"
                }
                .into(),
            ),
        );
        let workflow = RoadStore::document("workflow", &id, &Value::Object(payload), Some(&id));
        let rec = request.get("recommendation");
        if let Some(rec) = rec.filter(|v| !v.is_null()) {
            self.validate_recommendation(rec, request.get("identity"))?;
        }
        let mut fields = serde_json::Map::new();
        if let Some(rec) = rec.and_then(|v| v.get("fields")).and_then(Value::as_object) {
            for (key, value) in rec {
                let mut field = value.as_object().cloned().unwrap_or_default();
                field.insert("source".into(), Value::String("estimate".into()));
                fields.insert(key.clone(), Value::Object(field));
            }
        }
        let mut setup = json!({"label":"A","fields":fields,"confirmationScope":if rec.is_some_and(|v|!v.is_null()){"partial"}else{"observation-only"},"formulaVersion":rec.and_then(|v|v.get("formulaVersion")),"source":if rec.is_some_and(|v|!v.is_null()){"recommendation"}else{"unknown"},"inputSnapshot":rec.and_then(|v|v.get("inputSnapshot")),"baselineSetupId":null});
        setup = RoadStore::document("setup", &id, &setup, None);
        self.store.append_documents(&[workflow.clone(), setup])?;
        Ok(workflow)
    }
    fn validate_recommendation(
        &self,
        recommendation: &Value,
        identity: Option<&Value>,
    ) -> ApiResult<()> {
        let snapshot = recommendation
            .get("inputSnapshot")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                ApiError::invalid("The recommendation requires a saved engine observation")
            })?;
        let observation = snapshot
            .get("engineObservation")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                ApiError::invalid("The recommendation requires a saved engine observation")
            })?;
        let oid = observation
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ApiError::invalid("The recommendation requires a saved engine observation")
            })?;
        let saved = self.store.get(oid, Some("engine-observation"), None)?;
        if saved.get("observation") != Some(&Value::Object(observation.clone()))
            || snapshot.get("carId") != observation.get("carId")
        {
            return Err(ApiError::conflict(
                "The recommendation does not match its saved engine evidence",
            ));
        }
        if let Some(id) = identity {
            if id.get("ordinal").map(Value::to_string)
                != observation.get("carId").map(Value::to_string)
                || id.get("performanceIndex")
                    != observation
                        .get("data")
                        .and_then(|x| x.get("identity"))
                        .and_then(|x| x.get("performanceIndex"))
            {
                return Err(ApiError::conflict(
                    "Engine evidence belongs to a different car or configuration",
                ));
            }
        }
        Ok(())
    }
    pub fn handle(&mut self, method: &str, path: &str, body: Option<&Value>) -> ApiResult<Value> {
        let b = body.cloned().unwrap_or_else(|| json!({}));
        let normalized = path.strip_prefix("/api/road").unwrap_or(path);
        let p = normalized
            .trim_matches('/')
            .split('/')
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>();
        if method == "GET" && p == ["live"] {
            return Ok(self.live());
        }
        if method == "GET" && p == ["engine-observations"] {
            return Ok(Value::Array(
                self.store
                    .list(None, Some("engine-observation"), true)?
                    .into_iter()
                    .filter_map(|x| x.get("observation").cloned())
                    .collect(),
            ));
        }
        if method == "POST" && p == ["engine-observations"] {
            validate_request("engine", &b)?;
            return self.store.save_engine(&b);
        }
        if method == "GET" && p.len() == 3 && p[0] == "engine-observations" && p[2] == "capture" {
            return Ok(self.store.get(p[1], Some("engine-observation"), None)?["capture"].clone());
        }
        if method == "GET" && p == ["compatibility"] {
            return Ok(Value::Array(self.store.list(
                None,
                Some("compatibility"),
                false,
            )?));
        }
        if method == "POST" && p == ["compatibility"] {
            validate_request("compatibility", &b)?;
            self.validate_recommendation(&b["recommendation"], None)?;
            let mut x = b.as_object().cloned().unwrap_or_default();
            x.insert("status".into(), Value::String("compatibility-only".into()));
            return self
                .store
                .append("compatibility", "compatibility", &Value::Object(x), None);
        }
        if method == "POST" && p == ["stop"] {
            self.stop()?;
            return Ok(json!({"saved":true}));
        }
        if method == "GET" && p == ["workflows"] {
            return Ok(Value::Array(self.store.list(
                None,
                Some("workflow"),
                false,
            )?));
        }
        if method == "POST" && p == ["workflows"] {
            return self.create(b);
        }
        if p.len() >= 2 && p[0] == "workflows" {
            let wf = p[1];
            if method == "GET" && p.len() == 2 {
                let _ = self.store.get(wf, Some("workflow"), None)?;
                return Ok(Value::Array(self.store.list(Some(wf), None, false)?));
            }
            if method == "POST" && p.len() == 3 && p[2] == "runs" {
                return self.start_run(wf, &b);
            }
            if method == "POST" && p.len() == 3 && p[2] == "candidates" {
                validate_request("candidate", &b)?;
                let run = self.store.get(
                    b["baselineRunId"].as_str().unwrap_or(""),
                    Some("run"),
                    Some(wf),
                )?;
                if self
                    .store
                    .list(Some(wf), Some("summary"), false)?
                    .iter()
                    .all(|x| x["runId"] != run["id"])
                {
                    return Err(ApiError::conflict(
                        "Save the baseline run before preparing a candidate",
                    ));
                }
                let basis = self.store.get(
                    run["setupId"].as_str().unwrap_or(""),
                    Some("setup"),
                    Some(wf),
                )?;
                if basis["baselineSetupId"].is_string() {
                    return Err(ApiError::conflict(
                        "Keep a candidate as the new baseline before preparing another change",
                    ));
                }
                let parameter = b["parameter"].as_str().unwrap_or("");
                let mut fields = basis["fields"].as_object().cloned().unwrap_or_default();
                if let Some(existing) = fields.get(parameter) {
                    if existing["unit"] != b["baseline"]["unit"]
                        || existing["value"]
                            .as_f64()
                            .zip(b["baseline"]["value"].as_f64())
                            .is_some_and(|(x, y)| (x - y).abs() > 1e-6)
                    {
                        return Err(ApiError::conflict("Use the same saved unit and value for A, or record a new baseline after changing them"));
                    }
                }
                fields.insert(parameter.into(), b["baseline"].clone());
                let baseline=self.store.append("setup",wf,&json!({"label":"A","fields":fields,"confirmationScope":"partial","source":"game-confirmed","baselineSetupId":null,"basisSetupId":basis["id"],"basisRunId":run["id"],"readbackTiming":"after-run-unchanged","formulaVersion":basis["formulaVersion"]}),None)?;
                let mut proposal = b.as_object().cloned().unwrap_or_default();
                proposal.insert("baselineSetupId".into(), baseline["id"].clone());
                proposal.insert(
                    "methodVersion".into(),
                    Value::String("road-exploration/v1".into()),
                );
                proposal.insert("evidenceLevel".into(), Value::String("exploratory".into()));
                proposal.insert("status".into(), Value::String("draft".into()));
                let proposal = self
                    .store
                    .append("feedback", wf, &Value::Object(proposal), None)?;
                let mut candidate_fields =
                    baseline["fields"].as_object().cloned().unwrap_or_default();
                let mut setting = b["baseline"].clone();
                if let Some(s) = setting.as_object_mut() {
                    s.insert("value".into(), b["candidateValue"].clone());
                    s.insert("source".into(), Value::String("estimate".into()));
                }
                candidate_fields.insert(parameter.into(), setting);
                let candidate = json!({"label":"B","fields":candidate_fields,"confirmationScope":"partial","source":b["source"],"baselineSetupId":baseline["id"],"feedbackId":proposal["id"],"targetParameter":parameter,"formulaVersion":null,"status":"draft"});
                return self.store.append("setup", wf, &candidate, None);
            }
            if method == "POST" && p.len() == 3 && p[2] == "stop" {
                self.stop()?;
                return Ok(json!({"saved":true}));
            }
            if method == "POST" && p.len() == 5 && p[2] == "runs" && p[4] == "finish" {
                validate_request("finish", &b)?;
                let _ = self.store.get(p[3], Some("run"), Some(wf))?;
                if self
                    .store
                    .list(Some(wf), Some("summary"), false)?
                    .iter()
                    .all(|x| x["runId"] != p[3])
                {
                    return Err(ApiError::conflict(
                        "Save the recorded run before confirming its result",
                    ));
                }
                return self.store.append(
                    "finish",
                    wf,
                    &{
                        let mut x = b.as_object().cloned().unwrap_or_default();
                        x.insert("runId".into(), Value::String(p[3].into()));
                        Value::Object(x)
                    },
                    None,
                );
            }
            if method == "GET" && p.len() == 5 && p[2] == "runs" && p[4] == "capture" {
                return export_road_capture(self.database.as_ref(), &self.store, wf, p[3]);
            }
            if method == "POST" && p.len() == 3 && p[2] == "comparisons" {
                return compare_road_runs(&self.store, self.database.as_ref(), wf, &b);
            }
            if method == "POST" && p.len() == 3 && p[2] == "decisions" {
                validate_request("decision", &b)?;
                let report = self.store.get(
                    b["reportId"].as_str().unwrap_or(""),
                    Some("comparison"),
                    Some(wf),
                )?;
                let choice = b["choice"].as_str().unwrap_or("");
                let selected_id = if choice == "keep-candidate" {
                    report["candidateSetupId"].as_str().unwrap_or("")
                } else {
                    report["baselineSetupId"].as_str().unwrap_or("")
                };
                let selected = self.store.get(selected_id, Some("setup"), Some(wf))?;
                let promoted = if choice == "keep-candidate" {
                    let mut x = selected.as_object().cloned().unwrap_or_default();
                    for k in [
                        "id",
                        "createdAt",
                        "schema",
                        "workflowId",
                        "kind",
                        "feedbackId",
                        "targetParameter",
                    ] {
                        x.remove(k);
                    }
                    x.insert("label".into(), Value::String("A".into()));
                    x.insert("baselineSetupId".into(), Value::Null);
                    x.insert("basisSetupId".into(), Value::String(selected_id.into()));
                    x.insert(
                        "source".into(),
                        Value::String("user-selected-candidate".into()),
                    );
                    x.insert("status".into(), Value::String("draft".into()));
                    x.insert("reportId".into(), b["reportId"].clone());
                    Some(RoadStore::document("setup", wf, &Value::Object(x), None))
                } else {
                    None
                };
                let setup = promoted.as_ref().unwrap_or(&selected);
                let decision = RoadStore::document(
                    "decision",
                    wf,
                    &json!({"reportId":b["reportId"],"choice":choice,"setupId":setup["id"],"selectedSetupId":selected_id,"draft":setup,"status":"awaiting-game-confirmation"}),
                    None,
                );
                let mut docs = Vec::new();
                if let Some(p) = promoted {
                    docs.push(p)
                }
                docs.push(decision.clone());
                self.store.append_documents(&docs)?;
                return Ok(decision);
            }
        }
        Err(ApiError::new(404, "Road endpoint not found"))
    }
    pub fn maintain(&mut self) {
        self.flush_pending();
    }
    pub fn shutdown(&mut self) {
        self.flush_pending();
    }
    fn flush_pending(&mut self) {
        if self.pending.is_empty() {
            return;
        }
        let sid = self
            .active
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|a| a.get("sessionId"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        if let Some(sid) = sid {
            let points = std::mem::take(&mut self.pending);
            self.recorded_count += points.len();
            if let Err(e) = self.database.insert_points_batch(&sid, &points) {
                self.last_error = Some(e);
            }
        }
    }
    pub fn start_run(&mut self, workflow_id: &str, request: &Value) -> ApiResult<Value> {
        validate_request("start", request)?;
        if self.active.is_some() {
            return Err(ApiError::conflict(
                "Save the current Road run before starting another",
            ));
        }
        let workflow = self.store.get(workflow_id, Some("workflow"), None)?;
        let setup_id = request["setupId"]
            .as_str()
            .ok_or_else(|| ApiError::invalid("setupId is required"))?;
        let setup = self.store.get(setup_id, Some("setup"), Some(workflow_id))?;
        if let Some(rec) = workflow.get("recommendation") {
            if !rec.is_null() && rec.get("inputSnapshot") != request.get("inputSnapshot") {
                return Err(ApiError::conflict("Vehicle inputs changed. Create a new baseline and confirm the game settings again."));
            }
        }
        if !self.live()["fresh"].as_bool().unwrap_or(false)
            || self.latest_identity != Some(workflow["identity"].clone())
        {
            return Err(ApiError::conflict(
                "Fresh progressing telemetry from the selected car and configuration is required",
            ));
        }
        let session_id = Uuid::new_v4().simple().to_string();
        self.database
            .create_session(
                &session_id,
                workflow["identity"]["ordinal"].as_i64().unwrap_or(0),
                workflow["carName"].as_str().unwrap_or(""),
                self.latest_class,
                workflow["identity"]["performanceIndex"]
                    .as_i64()
                    .unwrap_or(0),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs_f64(),
            )
            .map_err(|e| ApiError::new(500, e))?;
        self.recorded_count = 0;
        let mut payload = request.as_object().cloned().unwrap_or_default();
        payload.insert("sessionId".into(), Value::String(session_id.clone()));
        payload.insert("identity".into(), workflow["identity"].clone());
        payload.insert(
            "setupConfirmationScope".into(),
            setup["confirmationScope"].clone(),
        );
        payload.insert("event".into(), workflow["event"].clone());
        payload.insert(
            "settingsSource".into(),
            Value::String("game-confirmed".into()),
        );
        payload.insert(
            "armedTimestamp".into(),
            self.latest_timestamp.map_or(Value::Null, |x| json!(x)),
        );
        let mut applied = serde_json::Map::new();
        for (key, value) in setup["fields"].as_object().into_iter().flatten() {
            let mut field = value.as_object().cloned().unwrap_or_default();
            field.insert("source".into(), Value::String("game-confirmed".into()));
            applied.insert(key.clone(), Value::Object(field));
        }
        payload.insert("appliedSetup".into(), Value::Object(applied));
        let run = self
            .store
            .append("run", workflow_id, &Value::Object(payload), None)?;
        self.active = Some(
            json!({"id":run["id"],"workflowId":workflow_id,"sessionId":session_id,"identity":workflow["identity"],"armedSequence":self.sequence}),
        );
        Ok(run)
    }
    pub fn stop(&mut self) -> ApiResult<()> {
        self.flush_pending();
        if let Some(active) = self.active.take() {
            let _ = self.summarize_with_reason(&active, "manual-stop")?;
        }
        Ok(())
    }
    pub fn recover(&mut self) -> ApiResult<()> {
        for d in self.store.list(None, Some("run"), true)? {
            if self
                .store
                .list(
                    Some(d["workflowId"].as_str().unwrap_or("")),
                    Some("summary"),
                    false,
                )?
                .iter()
                .all(|x| x["runId"] != d["id"])
            {
                let _ = self.summarize_with_reason(&d, "application-interrupted")?;
            }
        }
        Ok(())
    }
    fn summarize_with_reason(&self, run: &Value, reason: &str) -> ApiResult<Value> {
        let sid = run["sessionId"].as_str().unwrap_or("");
        let points = self
            .database
            .get_telemetry_points(sid, None)
            .map_err(|e| ApiError::new(500, e))?;
        let mut meta = self
            .database
            .get_session_metadata(sid)
            .map_err(|e| ApiError::new(500, e))?;
        if meta["state"] != "finalized" {
            let _self_result=self.database.finalize_session(sid,json!({"endReason":reason,"incompletePersistence":reason=="application-interrupted"})).map_err(|e|ApiError::new(500,e))?;
            meta = self
                .database
                .get_session_metadata(sid)
                .map_err(|e| ApiError::new(500, e))?;
        }
        let race: Vec<f64> = points
            .iter()
            .filter(|p| p.get("IsRaceOn").and_then(Value::as_i64) == Some(1))
            .filter_map(|p| p.get("CurrentRaceTime").and_then(Value::as_f64))
            .collect();
        let schemas = points
            .iter()
            .map(|p| {
                p.get("sourceSchema")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_owned()
            })
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .map(Value::String)
            .collect::<Vec<_>>();
        self.store.append("summary",run["workflowId"].as_str().unwrap_or(""),&json!({"runId":run["id"],"sessionId":sid,"observations":summarize_road_observations(&points),"recording":meta,"raceTimeCoverage":{"firstSeconds":race.first(),"lastSeconds":race.last()},"sourceSchemas":schemas}),None)
    }
}
