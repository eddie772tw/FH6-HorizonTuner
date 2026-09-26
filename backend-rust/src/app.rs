use crate::{
    assets,
    companion::CompanionService,
    config_service::{lock, ConfigService},
    diagnostics::{self, Metrics},
    error::{ApiError, ApiResult},
    motec,
    native::NativeServices,
    network::{ApiRequest, ApiResponse, Backend},
    persistence::Persistence,
    road::{RoadService, RoadStore},
    storage,
    telemetry::{
        self, DragRecorder, DynoQualityGateRegistry, RaceRecorder, RaceRecorderConfig,
        RecorderCommand, TelemetryStore,
    },
};
use serde_json::{json, Value};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex},
    time::Instant,
};
use tokio::sync::{broadcast, watch};

fn database_error(error: String) -> ApiError {
    eprintln!("database: {error}");
    ApiError::new(500, "Database operation failed")
}
struct Engine {
    race: RaceRecorder,
    drag: DragRecorder,
    road: RoadService,
    dyno: DynoQualityGateRegistry,
    last_profile_save: Instant,
}
pub struct App {
    pub config: Arc<ConfigService>,
    pub database: Arc<TelemetryStore>,
    pub native: NativeServices,
    pub companion: Arc<CompanionService>,
    companion_workflow: Mutex<crate::companion_workflow::CompanionWorkflow>,
    companion_usb_operation: Mutex<()>,
    pub metrics: Mutex<Metrics>,
    pub telemetry_binding: Mutex<crate::platform::TelemetryBinding>,
    engine: Mutex<Engine>,
    telemetry: watch::Sender<Option<Arc<Value>>>,
    epoch: Instant,
    mcp: Mutex<crate::mcp::McpServer>,
    persistence: Persistence,
}
impl App {
    pub fn new(root: &Path) -> ApiResult<Arc<Self>> {
        let config = Arc::new(ConfigService::new(root)?);
        let database = Arc::new(
            TelemetryStore::new(&root.join("telemetry_sessions.db")).map_err(database_error)?,
        );
        let mut road = RoadService::new(
            database.clone(),
            RoadStore::new(
                root.join("telemetry_sessions.db")
                    .to_string_lossy()
                    .into_owned(),
            )?,
        );
        road.recover()?;
        let mut drag = DragRecorder::default();
        drag.set_context(&Value::Null, &config.car_database);
        let engine = Engine {
            race: RaceRecorder::new_with_context(
                RaceRecorderConfig::default(),
                config.settings(),
                config.car_database.clone(),
            ),
            drag,
            road,
            dyno: DynoQualityGateRegistry::default(),
            last_profile_save: Instant::now(),
        };
        let (telemetry, _) = watch::channel(None);
        let native = NativeServices::for_data_root(root);
        if let Some(device) = config.hud()["audioDeviceId"].as_str() {
            let _ = native.set_audio_device(device);
        }
        let companion = Arc::new(CompanionService::new(root, 8001));
        let persistence = Persistence::new(database.clone()).map_err(database_error)?;
        Ok(Arc::new(Self {
            config,
            database,
            native,
            companion,
            companion_workflow: Mutex::new(crate::companion_workflow::CompanionWorkflow::default()),
            companion_usb_operation: Mutex::new(()),
            metrics: Mutex::new(Metrics::default()),
            telemetry_binding: Mutex::new(crate::platform::TelemetryBinding::default()),
            engine: Mutex::new(engine),
            telemetry,
            epoch: Instant::now(),
            mcp: Mutex::new(crate::mcp::McpServer::default()),
            persistence,
        }))
    }
    pub fn live(&self) -> Option<Arc<Value>> {
        self.telemetry.borrow().clone()
    }
    fn pipeline_metrics(&self) -> Value {
        let mut snapshot = lock(&self.metrics).telemetry();
        snapshot["raceRecorderPersistence"] = self.persistence.snapshot();
        snapshot["roadRecorderPersistence"] = lock(&self.engine).road.persistence_metrics();
        snapshot["profilePersistence"] = self.config.profile_metrics();
        snapshot
    }
    /// Called exclusively by a bounded processing worker, outside UDP/HTTP I/O.
    pub fn process(&self, frame: Value) {
        let started = Instant::now();
        let settings = self.config.settings();
        let mut engine = lock(&self.engine);
        engine.race.update_settings(&settings);
        engine
            .race
            .record_at(&frame, self.epoch.elapsed().as_secs_f64());
        engine.road.observe(&frame);
        let id = frame["CarOrdinal"].as_i64().unwrap_or(0).to_string();
        let lookup = self.config.live_car_params(&id);
        let (params, profile_loaded) = match lookup {
            crate::profile_io::Lookup::Ready(value) => (value, true),
            crate::profile_io::Lookup::Missing => (Value::Null, true),
            crate::profile_io::Lookup::Pending | crate::profile_io::Lookup::Failed => {
                (Value::Null, false)
            }
        };
        engine.drag.record(&frame);
        let _ = self.persist_commands(&mut engine.race);
        if id != "0" && profile_loaded {
            let quality = engine.dyno.observe(&id, &frame);
            let existing = (!params.is_null()).then_some(params);
            let created = existing.is_none();
            let profile = existing.or_else(|| {
                settings["race_recording"]
                    .as_bool()
                    .unwrap_or(true)
                    .then(telemetry::create_default_car_params)
            });
            if let Some(mut profile) = profile {
                let reset = telemetry::reconcile_dyno_profile_segment(&mut profile, &quality);
                let changed = telemetry::collect_dyno_sample(
                    &mut profile,
                    &frame,
                    &quality,
                    &settings,
                    &engine.dyno,
                    &id,
                );
                let mut cache = lock(&self.config.profiles);
                cache.insert(id.clone(), profile.clone());
                if cache.len() > 20 {
                    if let Some(old) = cache.keys().find(|key| **key != id).cloned() {
                        cache.remove(&old);
                        engine.dyno.discard(&old);
                    }
                }
                drop(cache);
                if created
                    || reset
                    || (changed && engine.last_profile_save.elapsed().as_secs() >= 5)
                {
                    if self.config.schedule_car_params(&id, profile).is_err() {
                        lock(&self.metrics).profile_failures += 1;
                    }
                    engine.last_profile_save = Instant::now();
                }
            }
        }
        drop(engine);
        let mut presence = frame.clone();
        let info = &self.config.car_database[&id];
        let name = info["display_name"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| {
                let name = ["year", "make", "model"]
                    .iter()
                    .filter_map(|k| info.get(*k))
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| v.to_string())
                    })
                    .filter(|s| !s.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                if name.is_empty() {
                    if id != "0" {
                        format!("Car #{id}")
                    } else {
                        "Unknown Car".into()
                    }
                } else {
                    name
                }
            });
        presence["CarName"] = json!(name.chars().take(80).collect::<String>());
        self.native.discord_submit(presence);
        self.telemetry.send_replace(Some(Arc::new(frame)));
        let mut metrics = lock(&self.metrics);
        metrics.frames_processed += 1;
        metrics.stage("total", started.elapsed().as_secs_f64() * 1000.0);
    }
    fn persist_commands(&self, recorder: &mut RaceRecorder) -> ApiResult<()> {
        let mut failure = None;
        for command in recorder.drain_commands() {
            let starting = matches!(command, RecorderCommand::CreateSession { .. });
            let samples = matches!(command, RecorderCommand::WritePoints { .. });
            if let Err(error) = self.persistence.submit(command) {
                if starting {
                    recorder.clear();
                }
                // Dropped batches are recorded in final session metadata and diagnostics.
                if !samples {
                    failure = Some(error);
                }
            }
        }
        failure.map_or(Ok(()), |error| Err(database_error(error)))
    }
    pub fn maintain(&self) {
        let mut engine = lock(&self.engine);
        engine.race.tick(self.epoch.elapsed().as_secs_f64());
        engine.road.maintain();
        let _ = self.persist_commands(&mut engine.race);
    }
    pub fn shutdown(&self) {
        let mut engine = lock(&self.engine);
        engine.race.save_latest_and_clear("application-shutdown");
        let _ = self.persist_commands(&mut engine.race);
        engine.road.shutdown();
        drop(engine);
        if let Err(error) = self.persistence.flush() {
            eprintln!("recorder shutdown flush: {error}");
        }
        if let Err(error) = self.config.flush_profiles() {
            eprintln!("profile shutdown flush: {error}");
        }
        let profiles = lock(&self.config.profiles).clone();
        for (id, profile) in profiles {
            if let Err(e) = self.config.save_car_params(&id, &profile) {
                eprintln!("profile shutdown write: {e}");
            }
        }
        self.native.discord_stop();
    }
    pub fn session_id(&self, id: &str) -> ApiResult<Option<String>> {
        if id != "current" {
            return Ok(Some(id.into()));
        }
        if let Some(id) = lock(&self.engine).race.status().current_session_id {
            return Ok(Some(id));
        }
        Ok(self
            .database
            .list_sessions_page(1, 0)
            .map_err(database_error)?
            .first()
            .and_then(|s| s["session_id"].as_str())
            .map(str::to_owned))
    }
    fn recording_api(&self, request: &ApiRequest, data: &Value) -> ApiResult<Option<Value>> {
        let parts: Vec<&str> = request.path.trim_matches('/').split('/').collect();
        let method = request.method.as_str();
        let value=match(method,parts.as_slice()) {
            ("GET",["api","analysis","status"])=>{let s=lock(&self.engine).race.status();json!({"isRecording":s.is_recording,"recordingCount":s.total_count,"currentSessionId":s.current_session_id})}
            ("POST",["api","analysis","clear"])=>{let mut engine=lock(&self.engine);engine.race.save_latest_and_clear("manual-clear");self.persist_commands(&mut engine.race)?;drop(engine);self.persistence.flush().map_err(database_error)?;json!({"message":"Current recording session cleared."})}
            ("POST",["api","analysis","recorder","start"])=>{let mut engine=lock(&self.engine);let id=engine.race.start_manual(0,"Manual Session".into(),0,0,diagnostics::now()).map_err(database_error)?;self.persist_commands(&mut engine.race)?;drop(engine);self.persistence.flush().map_err(database_error)?;json!({"message":"Manual recording started successfully","sessionId":id})}
            ("POST",["api","analysis","recorder","stop"])=>{let mut engine=lock(&self.engine);let s=engine.race.status();if !s.is_recording||!s.manual_mode{json!({"error":"Manual recording is not active"})}else{engine.race.save_latest_and_clear("manual-stop");self.persist_commands(&mut engine.race)?;drop(engine);self.persistence.flush().map_err(database_error)?;json!({"message":"Manual recording stopped and saved successfully"})}}
            ("GET",["api","analysis","data"])=>{let lap=query_integer(request,"lap",0)?;Value::Array(match self.session_id("current")?{Some(id)=>self.database.get_telemetry_points(&id,(lap>0).then_some(lap)).map_err(database_error)?,None=>vec![]})}
            ("GET",["api","analysis","sessions"])=>Value::Array(self.database.list_all_sessions().map_err(database_error)?.iter().map(|s|json!({"filename":s["session_id"],"session_id":s["session_id"],"car_name":s["car_name"],"total_laps":s["total_laps"],"best_lap_time":s["best_lap_time"],"total_distance":s["total_distance"],"mtime":s["start_time"],"size":0})).collect()),
            ("GET",["api","analysis","sessions",id])=>{let lap=query_integer(request,"lap",0)?;Value::Array(self.database.get_telemetry_points(id,(lap>0).then_some(lap)).map_err(database_error)?)}
            ("DELETE",["api","analysis","sessions",id])=>{self.database.delete_session(id).map_err(database_error)?;json!({"message":"Session deleted successfully"})},
            ("GET",["api","analysis","sessions",id,"laps"])=>Value::Array(self.database.get_session_laps(id).map_err(database_error)?),
            ("GET",["api","analysis","sessions",id,"debrief"])=>{let points=match self.session_id(id)?{Some(id)=>self.database.get_telemetry_points(&id,None).map_err(database_error)?,None=>vec![]};motec::debrief(&points)}
            ("POST",["api","drag","prepare"])=>{lock(&self.engine).drag.prepare();json!({"message":"Drag recorder prepared, waiting for launch."})}
            ("POST",["api","drag","clear"])=>{lock(&self.engine).drag.clear();json!({"message":"Drag recorder cleared."})}
            ("GET",["api","drag","status"])=>{let engine=lock(&self.engine);json!({"status":engine.drag.status(),"points_count":engine.drag.point_count()})}
            ("GET",["api","drag","data"])=>lock(&self.engine).drag.data(),
            ("GET",["api","drag","analysis"])=>lock(&self.engine).drag.analysis(),
            ("POST",["api","drag","sessions","save"])=>{
                let (points, analysis) = {
                    let engine=lock(&self.engine);
                    (engine.drag.data(), engine.drag.analysis())
                };
                if points.as_array().is_none_or(Vec::is_empty){json!({"error":"No data to save"})}else{
                    let timestamp=diagnostics::now()as i64;
                    let filename=format!("drag_session_{timestamp}.json");
                    let mut payload=json!({"metadata":{"filename":filename,"timestamp":timestamp,"car_id":analysis.get("car_id").unwrap_or(&json!("0")),"car_name":analysis.get("car_name").unwrap_or(&json!("Unknown Car")),"max_speed_kmh":analysis.get("max_speed_kmh").unwrap_or(&json!(0.0)),"duration":analysis.get("duration").unwrap_or(&json!(0.0)),"launch_slip_percent":analysis.get("launch_slip_percent").unwrap_or(&json!(0.0))}});
                    payload["data"] = points;
                    payload["analysis"] = analysis;
                    storage::atomic_json(&self.config.root.join("drag_sessions").join(&filename),&payload)?;
                    json!({"message":"Drag session saved successfully","filename":filename})
                }
            }
            _=>{if let Some(path)=request.path.strip_prefix("/api/road"){return lock(&self.engine).road.handle(method,path,Some(data)).map(Some).map_err(|error| {
                // Python's read-only Road adapter maps missing/wrong-type saved
                // documents to 422; mutation conflicts retain their 409 contract.
                if method == "GET" && error.status == 409 { ApiError::invalid("Invalid request parameters") } else { error }
            });}return Ok(None);}
        };
        Ok(Some(value))
    }
    fn motec_api(&self, request: &ApiRequest) -> ApiResult<Option<ApiResponse>> {
        let (requested, open) = if request.method == "GET" {
            match request.path.strip_prefix("/api/analysis/export/motec/") {
                Some(id) => (id, false),
                None => return Ok(None),
            }
        } else if request.method == "POST" {
            match request.path.strip_prefix("/api/analysis/motec/open/") {
                Some(id) => (id, true),
                None => return Ok(None),
            }
        } else {
            return Ok(None);
        };
        let failure = |message: &str| {
            Some(ApiResponse::json(if open {
                json!({"error":message,"success":false})
            } else {
                json!({"error":message})
            }))
        };
        let Some(id) = self.session_id(requested)? else {
            return Ok(failure("Session not found"));
        };
        let Some(metadata) = self.database.get_session(&id).map_err(database_error)? else {
            return Ok(failure("Session not found"));
        };
        let points = self
            .database
            .get_telemetry_points(&id, None)
            .map_err(database_error)?;
        if points.is_empty() {
            return Ok(failure("No telemetry data points found in session"));
        }
        let filename = format!("{id}_motec.csv")
            .rsplit(['/', '\\'])
            .next()
            .unwrap()
            .to_owned();
        let path = match storage::safe_path(&self.config.root.join("sessions"), &filename) {
            Ok(path) => path,
            Err(_) => return Ok(failure("Invalid session export path")),
        };
        let bytes = motec::export(&metadata, &points)?;
        fs::write(&path, &bytes)?;
        if open {
            let launched = open_in_viewer(&path);
            Ok(Some(ApiResponse::json(
                json!({"success":true,"launched":launched,"filepath":path,"filename":filename,"message":if launched{"File exported successfully and launched in viewer"}else{"File exported successfully"}}),
            )))
        } else {
            let encoded = percent_encoding::utf8_percent_encode(
                &filename,
                percent_encoding::NON_ALPHANUMERIC,
            );
            Ok(Some(
                ApiResponse::bytes(200, bytes, "text/csv; charset=utf-8").header(
                    "Content-Disposition",
                    format!("attachment; filename*=utf-8''{encoded}"),
                ),
            ))
        }
    }
    fn static_asset(&self, path: &str) -> ApiResult<Option<ApiResponse>> {
        let (bytes, key) = if let Some(relative) = path.strip_prefix("/hud_user/") {
            let mut target = storage::safe_path(
                &self.config.root.join("hud_overlay"),
                relative.trim_end_matches('/'),
            )?;
            if target.is_dir() {
                target = storage::safe_path(
                    &self.config.root.join("hud_overlay"),
                    &format!("{}/index.html", relative.trim_end_matches('/')),
                )?;
            }
            (
                fs::read(&target).map_err(|_| ApiError::new(404, "Not Found"))?,
                target.to_string_lossy().into_owned(),
            )
        } else if path.starts_with("/hud/")
            || path.starts_with("/companion/")
            || path.starts_with("/assets/")
        {
            let key = path.trim_start_matches('/');
            let key = if assets::get(key).is_some() {
                key.into()
            } else {
                format!("{}/index.html", key.trim_end_matches('/'))
            };
            (
                assets::get(&key)
                    .ok_or_else(|| ApiError::new(404, "Not Found"))?
                    .to_vec(),
                key,
            )
        } else {
            return Ok(None);
        };
        let mime = mime_guess::from_path(&key)
            .first_or_octet_stream()
            .to_string();
        Ok(Some(
            ApiResponse::bytes(200, bytes, &mime)
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .header("Pragma", "no-cache")
                .header("Expires", "0"),
        ))
    }
}
fn query_integer(request: &ApiRequest, key: &str, default: i64) -> ApiResult<i64> {
    request
        .query
        .get(key)
        .map(|s| {
            s.parse()
                .map_err(|_| ApiError::invalid(format!("Invalid {key}")))
        })
        .unwrap_or(Ok(default))
}
#[cfg(windows)]
fn open_in_viewer(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            Foundation::HWND,
            UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        },
    };
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        ShellExecuteW(
            Some(HWND::default()),
            w!("open"),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
        .0 as isize
            > 32
    }
}
#[cfg(not(windows))]
fn open_in_viewer(_path: &Path) -> bool {
    false
}
impl Backend for App {
    fn telemetry(&self) -> watch::Receiver<Option<Arc<Value>>> {
        self.telemetry.subscribe()
    }
    fn overlay(&self) -> broadcast::Receiver<Value> {
        self.config.overlay.subscribe()
    }
    fn initial_overlay(&self) -> Value {
        json!({"type":"hud:config","data":self.config.hud()})
    }
    fn initial_overlay_events(&self) -> Vec<Value> {
        vec![
            self.initial_overlay(),
            json!({"type":"hud:audio","data":self.native.cached_audio_spectrum()}),
            json!({"type":"hud:media","data":self.native.system_media()}),
        ]
    }
    fn client_delta(&self, channel: &str, delta: i64) {
        lock(&self.metrics).client_delta(channel, delta);
    }
    fn request(&self, request: ApiRequest) -> ApiResult<ApiResponse> {
        if request.method == "GET" && request.path == "/api/health" {
            return Ok(ApiResponse::json(
                json!({"status":"ready","version":env!("CARGO_PKG_VERSION")}),
            ));
        }
        if request.method == "GET" && request.path == "/api/runtime" {
            return Ok(ApiResponse::json(json!({
                "platform": std::env::consts::OS,
                "capabilities": crate::platform::capabilities(),
                "telemetry": *lock(&self.telemetry_binding),
            })));
        }
        if !crate::platform::HUD_ENABLED {
            if request.path.starts_with("/api/overlay/")
                || request.path.starts_with("/api/audio/")
                || request.path.starts_with("/api/hud/")
                || request.path == "/api/diagnostics/overlay"
            {
                return Err(ApiError::new(
                    501,
                    "unsupported: HUD is not included in this build",
                ));
            }
            if request.path.starts_with("/hud/") || request.path.starts_with("/hud_user/") {
                return Err(ApiError::new(
                    404,
                    "HUD assets are not included in this build",
                ));
            }
        }
        match (request.method.as_str(), request.path.as_str()) {
            ("GET", "/api/companion/usb/devices") => {
                let _operation = lock(&self.companion_usb_operation);
                let client = crate::companion_usb_runtime::packaged_client(&self.config.root)?;
                let devices = client
                    .list_devices()
                    .map_err(|e| ApiError::new(503, &e.to_string()))?;
                return Ok(ApiResponse::json(json!({"devices": devices})));
            }
            ("POST", "/api/companion/usb/connect") => {
                let body = request.json()?;
                let serial = body["serial"]
                    .as_str()
                    .ok_or_else(|| ApiError::invalid("Choose a USB device first."))?;
                let _operation = lock(&self.companion_usb_operation);
                let client = crate::companion_usb_runtime::packaged_client(&self.config.root)?;
                let port = self.companion.get_status(None).port;
                let result = client
                    .connect(serial, port)
                    .map_err(|e| ApiError::new(503, &e.to_string()))?;
                return Ok(ApiResponse::json(serde_json::to_value(result)?));
            }
            ("GET", "/api/companion/workflow") => {
                let mut workflow = lock(&self.companion_workflow);
                workflow.touch_client(request.query.get("clientId").map(String::as_str));
                return Ok(ApiResponse::json(workflow.state()));
            }
            ("POST", "/api/companion/commands") => {
                return Ok(ApiResponse::json(
                    lock(&self.companion_workflow).enqueue(request.json()?)?,
                ))
            }
            ("POST", "/api/companion/host") => {
                return Ok(ApiResponse::json(
                    lock(&self.companion_workflow).exchange(request.json()?)?,
                ))
            }
            _ => {}
        }
        if (request.method == "POST" && request.path == "/api/companion/lan/pairing")
            || (request.method == "GET" && request.path == "/api/companion/qr")
        {
            let port = self
                .companion
                .get_lan_port()
                .ok_or_else(|| ApiError::new(503, "Companion LAN listener is unavailable"))?;
            if CompanionService::detect_lan_ips().is_empty() {
                return Err(ApiError::new(
                    503,
                    "No LAN address is available for pairing",
                ));
            }
            let qr = self.companion.generate_qr_payload(Some(port));
            return Ok(ApiResponse::json(
                serde_json::to_value(&qr).unwrap_or_default(),
            ));
        }
        if request.method == "POST" && request.path == "/api/companion/pair" {
            let body = request.json()?;
            let token = body["token"].as_str().unwrap_or_default();
            let device_name = body["device_name"].as_str().unwrap_or_default();
            let device_id = body["device_id"].as_str().unwrap_or_default();
            let (device, session_token) = self.companion.pair(token, device_name, device_id)?;
            return Ok(ApiResponse::json(serde_json::json!({
                "device": device,
                "session_token": session_token,
                "server_version": env!("CARGO_PKG_VERSION"),
            })));
        }
        if request.method == "GET" && request.path == "/api/companion/devices" {
            let devices = self.companion.list_devices();
            return Ok(ApiResponse::json(serde_json::json!({
                "devices": devices
            })));
        }
        if request.method == "DELETE" && request.path.starts_with("/api/companion/devices/") {
            let id = &request.path["/api/companion/devices/".len()..];
            let removed = self.companion.remove_device(id);
            return Ok(ApiResponse::json(serde_json::json!({
                "success": removed
            })));
        }
        if request.method == "GET" && request.path == "/api/companion/status" {
            let mut status = self.companion.get_status(None);
            status.active_connections = lock(&self.companion_workflow).client_count();
            return Ok(ApiResponse::json(
                serde_json::to_value(&status).unwrap_or_default(),
            ));
        }
        if request.method == "GET" && request.path == "/api/hud/manifest" {
            let manifest = self.companion.generate_hud_manifest();
            return Ok(ApiResponse::json(serde_json::json!({
                "manifest": manifest
            })));
        }
        if request.method == "GET" && request.path == "/api/mcp/status" {
            return Ok(ApiResponse::json(
                lock(&self.mcp).status(&self.config.settings()),
            ));
        }
        if request.method == "POST" && request.path == "/mcp" {
            if let Some(origin) = request
                .headers
                .get("origin")
                .and_then(|s| s.to_str().ok())
                .filter(|s| !s.is_empty())
            {
                if !url::Url::parse(origin).ok().is_some_and(|u| {
                    matches!(u.scheme(), "http" | "https")
                        && matches!(
                            u.host_str(),
                            Some("localhost" | "127.0.0.1" | "tauri.localhost")
                        )
                }) {
                    return Err(ApiError::new(403, "MCP Origin is not allowed"));
                }
            }
            if self.config.settings()["mcp_enabled"] == false {
                return Err(ApiError::new(403, "MCP Server is disabled in settings"));
            }
            let body: Value = serde_json::from_slice(&request.body)
                .map_err(|_| ApiError::new(400, "Invalid JSON payload"))?;
            if !body.is_object() {
                return Err(ApiError::new(400, "MCP payload must be a JSON object"));
            }
            return Ok(match lock(&self.mcp).handle(self, &body)? {
                Some(value) => ApiResponse::json(value),
                None => ApiResponse::bytes(202, vec![], ""),
            });
        }
        if request.method == "GET" {
            if let Some(response) = self.static_asset(&request.path)? {
                return Ok(response);
            }
        }
        if request.method == "POST" && request.path == "/api/analysis/import/motec" {
            let value = match motec::import(&request.body) {
                Ok((metadata, points)) if !points.is_empty() => {
                    json!({"metadata":{"filename":request.upload_filename,"car_name":metadata["car_name"],"session_id":metadata["session_id"]},"data":points})
                }
                Ok(_) => json!({"error":"Failed to parse MoTeC CSV or file is empty"}),
                Err(_) => json!({"error":"Failed to import MoTeC CSV"}),
            };
            return Ok(ApiResponse::json(value));
        }
        if let Some(response) = self.motec_api(&request)? {
            return Ok(response);
        }
        let data = request.json()?;
        let requires_object = request.method == "POST"
            && (matches!(
                request.path.as_str(),
                "/api/settings"
                    | "/api/analysis/config"
                    | "/api/overlay/config"
                    | "/api/overlay/layout"
                    | "/api/overlay/car_learning"
                    | "/api/audio/device"
            ) || request.path.starts_with("/api/car_params/")
                || request.path.starts_with("/api/tunings/"));
        if requires_object {
            if request.body.is_empty() || data.is_null() {
                return Err(ApiError::body_validation(
                    "missing",
                    "Field required",
                    Value::Null,
                ));
            }
            if !data.is_object() {
                return Err(ApiError::body_validation(
                    "dict_type",
                    "Input should be a valid dictionary",
                    data,
                ));
            }
        }
        let config_result = {
            // Serialize explicit profile edits with dyno snapshots; an older scheduled
            // automatic save must not overwrite the user's completed API update.
            let _profile_edit = (request.method != "GET"
                && request.path.starts_with("/api/car_params/"))
            .then(|| lock(&self.engine));
            self.config.handle(&request.method, &request.path, &data)
        };
        if let Some(result) = config_result {
            let value = result?;
            if matches!(
                request.path.as_str(),
                "/api/overlay/config" | "/api/overlay/layout" | "/api/overlay/reset"
            ) {
                if let Some(device) = self.config.hud()["audioDeviceId"].as_str() {
                    let _ = self.native.set_audio_device(device);
                }
            }
            return Ok(ApiResponse::json(value));
        }
        if let Some(value) = self.recording_api(&request, &data)? {
            return Ok(ApiResponse::json(value));
        }
        let value = match (request.method.as_str(), request.path.as_str()) {
            ("GET", "/api/audio/devices") => self.native.get_audio_devices(),
            ("POST", "/api/audio/device") => {
                let device = data
                    .get("device_id")
                    .or_else(|| data.get("audioDeviceId"))
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("default");
                self.native
                    .set_audio_device(device)
                    .map_err(|e| ApiError::new(500, e.to_string()))?;
                json!({"message":"Audio capture device set successfully","device_id":device,"success":true})
            }
            ("GET", "/api/overlay/audio_spectrum") => self.native.audio_spectrum(),
            ("GET", "/api/overlay/system_media") => self.native.system_media(),
            ("GET", "/api/overlay/media/thumbnail") => {
                let Some((content_type, bytes, hash)) = self.native.thumbnail_metadata() else {
                    return Err(ApiError::new(404, "No media thumbnail available"));
                };
                if request.query.get("v").is_some_and(|v| v != &hash) {
                    return Err(ApiError::new(404, "Media thumbnail version expired"));
                }
                if request
                    .headers
                    .get("if-none-match")
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|v| v.trim_matches('"') == hash)
                {
                    return Ok(ApiResponse::bytes(304, vec![], ""));
                }
                return Ok(ApiResponse::bytes(200, bytes, &content_type)
                    .header("ETag", format!("\"{hash}\""))
                    .header(
                        "Cache-Control",
                        if request.query.contains_key("v") {
                            "public, max-age=3600, immutable"
                        } else {
                            "public, max-age=30"
                        },
                    ));
            }
            ("GET", "/api/diagnostics/telemetry-pipeline") => self.pipeline_metrics(),
            ("GET", "/api/diagnostics/overlay") => {
                let mut overlay = lock(&self.metrics).overlay();
                overlay["native"] = self.native.diagnostics();
                overlay
            }
            ("GET", "/api/diagnostics/discord-presence") => self.native.discord_status(),
            ("POST", "/api/diagnostics/support-bundle") => {
                let pipeline = self.pipeline_metrics();
                let mut overlay = lock(&self.metrics).overlay();
                overlay["native"] = self.native.diagnostics();
                let snapshots = json!({"telemetryPipeline":pipeline,"overlay":overlay,"discordPresence":self.native.discord_status()});
                let bytes = diagnostics::support_bundle(
                    &self.config.root.join("logs/backend.log"),
                    &snapshots,
                    &data,
                )?;
                return Ok(ApiResponse::bytes(200, bytes, "application/zip")
                    .header(
                        "Content-Disposition",
                        "attachment; filename=\"fh6-diagnostic-support.zip\"",
                    )
                    .header("Cache-Control", "no-store"));
            }
            ("GET", "/api/logs") => diagnostics::logs(
                &self.config.root.join("logs/backend.log"),
                request.query.get("level").map(String::as_str),
                query_integer(&request, "limit", 300)?,
            ),
            ("DELETE", "/api/logs") => {
                let path = self.config.root.join("logs/backend.log");
                if path.exists() {
                    fs::write(path, "")?;
                    json!({"message":"Logs cleared successfully"})
                } else {
                    json!({"message":"Log file does not exist"})
                }
            }
            ("GET", "/api/analysis/motec/template") => {
                return Ok(ApiResponse::bytes(
                    200,
                    motec::WORKSPACE.as_bytes().to_vec(),
                    "application/xml",
                )
                .header(
                    "Content-Disposition",
                    "attachment; filename=FH6_HorizonTuner_MoTeC_Workspace.xml",
                ))
            }
            _ => return Err(ApiError::new(404, "Not Found")),
        };
        Ok(ApiResponse::json(value))
    }
}
