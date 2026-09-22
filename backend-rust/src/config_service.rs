//! Low-rate file APIs. Call from a blocking worker; never from UDP receive.
use crate::{
    assets, config,
    error::{ApiError, ApiResult},
    storage,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tokio::sync::{broadcast, watch};

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

pub struct ConfigService {
    pub root: PathBuf,
    pub settings: Mutex<Value>,
    pub car_database: Value,
    pub profiles: Mutex<BTreeMap<String, Value>>,
    pub overlay: broadcast::Sender<Value>,
    pub settings_changed: watch::Sender<Value>,
}
impl ConfigService {
    pub fn new(root: &Path) -> ApiResult<Self> {
        storage::initialize(root)?;
        let defaults = config::defaults("DEFAULT_SETTINGS");
        let loaded = storage::load_settings(root, &defaults).unwrap_or_else(|e| {
            eprintln!("{e}");
            defaults.clone()
        });
        let mut settings = defaults;
        for (key, value) in loaded.as_object().into_iter().flatten() {
            if ["units", "theme"].contains(&key.as_str()) && value.is_object() {
                config::merge_object(&mut settings[key], value);
            } else {
                settings[key] = value.clone();
            }
        }
        settings["units"] = config::normalize_units(&settings["units"]);
        let (overlay, _) = broadcast::channel(32);
        let (settings_changed, _) = watch::channel(settings.clone());
        Ok(Self {
            root: root.to_owned(),
            settings: Mutex::new(settings),
            car_database: assets::json("car_database.json").unwrap_or(json!({})),
            profiles: Mutex::new(BTreeMap::new()),
            overlay,
            settings_changed,
        })
    }
    pub fn settings(&self) -> Value {
        lock(&self.settings).clone()
    }
    pub fn hud(&self) -> Value {
        let data = storage::read_json(&self.root.join("hud_config.json"))
            .ok()
            .filter(|v| v.as_object().is_some_and(|v| !v.is_empty()))
            .unwrap_or_else(|| config::defaults("DEFAULT_HUD_CONFIG"));
        config::hud_for_frontend(&data, &self.settings())
    }
    pub fn publish_hud(&self) {
        let _ = self
            .overlay
            .send(json!({"type":"hud:config","data":self.hud()}));
    }
    pub fn car_params(&self, id: &str) -> Option<Value> {
        if let Some(value) = lock(&self.profiles).get(id) {
            return Some(value.clone());
        }
        let path = storage::safe_path(&self.root.join("car_params"), &format!("{id}.json")).ok()?;
        storage::read_json(&path)
            .ok()
            .or_else(|| assets::json(&format!("car_params/{id}.json")))
    }
    pub fn save_car_params(&self, id: &str, value: &Value) -> ApiResult<()> {
        let path = storage::safe_path(&self.root.join("car_params"), &format!("{id}.json"))?;
        storage::atomic_json(&path, value)?;
        lock(&self.profiles).insert(id.to_owned(), value.clone());
        Ok(())
    }
    pub fn list_drag_sessions(&self) -> Vec<Value> {
        let mut sessions: Vec<Value> = json_files(&self.root.join("drag_sessions"))
            .into_iter()
            .filter_map(|path| {
                storage::read_json(&path)
                    .ok()
                    .map(|p| p.get("metadata").cloned().unwrap_or(json!({})))
            })
            .collect();
        sessions.sort_by(|a, b| {
            b["timestamp"]
                .as_f64()
                .unwrap_or(0.0)
                .total_cmp(&a["timestamp"].as_f64().unwrap_or(0.0))
        });
        sessions
    }
    pub fn handle(&self, method: &str, path: &str, data: &Value) -> Option<ApiResult<Value>> {
        let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
        Some((|| { match (method,parts.as_slice()) {
            ("GET",["api","settings"]) => Ok(self.settings()),
            ("POST",["api","settings"]) => {
                let value = { let mut settings=lock(&self.settings); let next=config::merge_settings(&settings,data)?;
                    storage::save_settings(&self.root,&next).map_err(|_| ApiError::new(500,"Settings could not be saved"))?; *settings=next.clone(); next };
                self.settings_changed.send_replace(value.clone());
                if data["theme"].is_object() || data["units"].is_object() { self.publish_hud(); }
                Ok(value)
            }
            ("GET",["api","settings","storage-overview"]) => Ok(storage::storage_overview(&self.root)),
            ("GET",["api","cars","database"]) => Ok(self.car_database.clone()),
            ("GET",["api","cars","with_params"]) => {
                let mut cars:Vec<Value> = json_files(&self.root.join("car_params")).iter().filter_map(|p| p.file_stem()?.to_str()).map(|id| json!({"id":id,"name":self.car_database[id].get("display_name").cloned().unwrap_or(json!(format!("Car {id}")))})).collect();
                cars.sort_by(|a,b| a["name"].as_str().cmp(&b["name"].as_str())); Ok(json!(cars))
            }
            ("GET",["api","car_params",id]) => Ok(self.car_params(id).unwrap_or(json!({"error":"Car parameters not found"}))),
            ("POST",["api","car_params",id]) => {
                let mut value=self.car_params(id).unwrap_or(json!({})); config::merge_object(&mut value,data); self.save_car_params(id,&value)?; Ok(json!({"message":"Car parameters saved successfully"}))
            }
            ("DELETE",["api","car_params",id,"dyno_curve"]) => {
                let Some(mut value)=self.car_params(id) else {return Ok(json!({"error":"Car parameters not found"}));};
                value["dyno_curve"]=json!({}); if let Some(object)=value.as_object_mut() { object.remove("maxHpRpm"); object.remove("maxTorqueRpm"); }
                self.save_car_params(id,&value)?; Ok(json!({"message":"Dyno curve data cleared successfully"}))
            }
            ("GET",["api","languages"]) => {
                let mut languages=serde_json::Map::new(); languages.insert("en-us".to_owned(),json!("English (US)"));
                for path in json_files(&self.root.join("lang")) { let code=path.file_stem().unwrap().to_string_lossy().to_lowercase(); if code=="iso639" || code=="en-us" {continue;} if let Ok(v)=storage::read_json(&path) { if v.is_object() {languages.insert(code.clone(),v.get("__language_name__").cloned().unwrap_or(json!(code)));} } }
                for (code,value) in assets::languages() { languages.entry(code.clone()).or_insert_with(||value.get("__language_name__").cloned().unwrap_or(json!(code))); }
                Ok(json!(languages.into_iter().map(|(code,name)|json!({"code":code,"name":name})).collect::<Vec<_>>()))
            }
            ("GET",["api","languages",code]) => {
                if !code.chars().all(|c| c.is_ascii_alphanumeric() || c=='-') {return Err(ApiError::invalid("Invalid language code"));}
                let code=code.to_lowercase(); if code=="en-us" {return Ok(json!({}));}
                Ok(storage::read_json(&self.root.join("lang").join(format!("{code}.json"))).ok().or_else(||assets::json(&format!("lang/{code}.json"))).unwrap_or(json!({"error":"Language not found"})))
            }
            ("GET",["api","tunings"]) => Ok(json!({"tunings":json_files(&self.root.join("tunings")).iter().filter_map(|p|p.file_stem()?.to_str()).collect::<Vec<_>>()})),
            ("GET" | "POST",["api","tunings",id,name]) => {
                let path=storage::safe_path(&self.root.join("tunings"),&format!("{id}-{name}.json"))?;
                if method=="GET" {Ok(storage::read_json(&path).unwrap_or(json!({"error":"Tuning not found"})))} else {storage::atomic_json(&path,data)?; Ok(json!({"message":"Saved successfully"}))}
            }
            ("GET",["api","analysis","config"]) => Ok(storage::read_json(&self.root.join("user_configs/analysis_layout.json")).unwrap_or(json!({"activeMetric":"speed","customMathChannels":[],"enabledCharts":["track_map","inputs_gear","gg_diagram","slip_scatter","susp_dist","temp_dist"]}))),
            ("POST",["api","analysis","config"]) => {
                storage::atomic_json(&self.root.join("user_configs/analysis_layout.json"),data)?; Ok(json!({"message":"Analysis layout saved successfully"}))
            }
            ("GET",["api","overlay","config" | "layout"]) => Ok(self.hud()),
            ("POST",["api","overlay","config" | "layout"]) => {
                storage::atomic_json(&self.root.join("hud_config.json"),&config::normalize_hud(data))?; self.publish_hud(); Ok(json!({"message":"HUD config saved successfully","success":true}))
            }
            ("POST",["api","overlay","reset"]) => {
                let data=config::normalize_hud(&config::defaults("DEFAULT_HUD_CONFIG")); storage::atomic_json(&self.root.join("hud_config.json"),&data)?; self.publish_hud();
                Ok(json!({"message":"HUD config reset to defaults successfully","success":true,"data":data}))
            }
            ("GET",["api","overlay","car_learning"]) => Ok(storage::read_json(&self.root.join("car_learning.json")).unwrap_or(json!({}))),
            ("POST",["api","overlay","car_learning"]) => {storage::atomic_json(&self.root.join("car_learning.json"),data)?;Ok(json!({"message":"Car learning data saved successfully","success":true}))}
            ("GET",["api","hud","styles"]) => Ok(self.hud_styles()),
            ("GET",["api","drag","sessions"]) => Ok(json!(self.list_drag_sessions())),
            ("GET" | "DELETE",["api","drag","sessions",name]) => {
                let path=storage::safe_path(&self.root.join("drag_sessions"),name)?;
                if !path.is_file() {return Ok(json!({"error":"Drag session file not found"}));}
                if method=="GET" {storage::read_json(&path)} else {fs::remove_file(path)?; Ok(json!({"message":"Drag session deleted successfully"}))}
            }
            _ => Err(ApiError::new(404,"Not Found")),
        } })()).filter(|result| !matches!(result,Err(e) if e.status==404))
    }
    pub fn hud_styles(&self) -> Value {
        let ignored = [
            "shared",
            "assets",
            "telemetry",
            "common",
            "fonts",
            "css",
            "js",
            "__pycache__",
            "defi_triple",
            "initial_d",
        ];
        let mut styles = BTreeMap::new();
        for (name, _) in assets::EMBEDDED {
            if let Some(id) = name
                .strip_prefix("hud/")
                .and_then(|s| s.strip_suffix("/index.html"))
            {
                if !id.contains('/') && !ignored.contains(&id) {
                    styles.insert(
                        id.to_string(),
                        json!({"id":id,"source":"builtin","urlPrefix":"/hud"}),
                    );
                }
            }
        }
        if let Ok(entries) = fs::read_dir(self.root.join("hud_overlay")) {
            for entry in entries.flatten() {
                let id = entry.file_name().to_string_lossy().into_owned();
                if entry.path().join("index.html").is_file() && !ignored.contains(&id.as_str()) {
                    styles.insert(
                        id.clone(),
                        json!({"id":id,"source":"user","urlPrefix":"/hud_user"}),
                    );
                }
            }
        }
        json!({"styles":styles.into_values().collect::<Vec<_>>()})
    }
}
pub fn json_files(directory: &Path) -> Vec<PathBuf> {
    let mut files: Vec<_> = fs::read_dir(directory)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "json"))
        .collect();
    files.sort();
    files
}
