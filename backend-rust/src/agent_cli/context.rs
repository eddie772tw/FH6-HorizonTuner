use super::options::Options;
use crate::{assets, storage};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration};

pub struct Context {
    pub root: PathBuf,
    pub url: String,
    client: ureq::Agent,
}
impl Context {
    pub fn new(args: &Options) -> Result<Self, String> {
        let root = args.get("data-dir").map(PathBuf::from).unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
            } else {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_owned()))
                    .unwrap_or_else(|| PathBuf::from("."))
            }
        });
        let root = std::path::absolute(root).map_err(|e| e.to_string())?;
        let port = [
            root.join("logs/web_port.txt"),
            root.join("backend/logs/web_port.txt"),
        ]
        .iter()
        .find_map(|p| {
            fs::read_to_string(p)
                .ok()?
                .trim()
                .parse::<u16>()
                .ok()
                .filter(|p| *p > 0)
        })
        .unwrap_or(8001);
        let url = args
            .get("backend-url")
            .map(|s| s.trim_end_matches('/').to_owned())
            .unwrap_or_else(|| format!("http://127.0.0.1:{port}"));
        let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
        if !["http", "https"].contains(&parsed.scheme())
            || parsed.host_str().is_none()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err("Invalid backend URL".into());
        }
        let client = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(3)))
            .build()
            .new_agent();
        Ok(Self { root, url, client })
    }
    pub fn get(&self, path: &str) -> Result<Value, String> {
        self.client
            .get(format!("{}/{path}", self.url))
            .call()
            .and_then(|mut r| r.body_mut().read_json())
            .map_err(|e| e.to_string())
    }
    pub fn post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let text = self
            .client
            .post(format!("{}/{path}", self.url))
            .header("Accept", "application/json, text/event-stream")
            .send_json(body)
            .and_then(|mut r| r.body_mut().read_to_string())
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&text)
            .or_else(|_| {
                text.lines()
                    .filter_map(|l| l.strip_prefix("data:"))
                    .find_map(|l| serde_json::from_str(l.trim()).ok())
                    .ok_or_else(|| serde_json::from_str::<Value>("").unwrap_err())
            })
            .map_err(|e| e.to_string())
    }
    pub fn tool(&self, name: &str, arguments: Value) -> Result<Value, String> {
        let response = self.post("mcp",&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":arguments}}))?;
        if let Some(e) = response.get("error") {
            return Err(e.to_string());
        }
        let result = &response["result"];
        let content = result["content"]
            .as_array()
            .and_then(|a| a.iter().find(|v| v["type"] == "text"))
            .and_then(|v| v["text"].as_str());
        if result["isError"] == true {
            return Err(content.unwrap_or("MCP tool failed").into());
        }
        if let Some(text) = content {
            serde_json::from_str(text).map_err(|e| e.to_string())
        } else if let Some(v) = result.get("structuredContent") {
            Ok(v.clone())
        } else {
            Err("MCP response has no tool content".into())
        }
    }
    pub fn cars(&self) -> Result<Value, String> {
        for path in [
            self.root.join("car_database.json"),
            self.root.join("backend/car_database.json"),
        ] {
            if path.exists() {
                return storage::read_json(&path).map_err(|e| e.to_string());
            }
        }
        assets::json("car_database.json").ok_or("Bundled car database missing".into())
    }
    pub fn tunings(&self) -> Result<PathBuf, String> {
        let primary = self.root.join("tunings");
        let legacy = self.root.join("backend/tunings");
        let path = if !primary.exists() && legacy.is_dir() {
            legacy
        } else {
            primary
        };
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        path.canonicalize().map_err(|e| e.to_string())
    }
    pub fn preset_path(&self, car: &str, name: &str) -> Result<PathBuf, String> {
        if [car, name]
            .iter()
            .any(|s| s.is_empty() || s.contains(['/', '\\']))
        {
            return Err("Invalid preset name or car ID".into());
        }
        storage::safe_path(&self.tunings()?, &format!("{car}-{name}.json"))
            .map_err(|e| e.to_string())
    }
}
pub fn segment(text: &str) -> String {
    percent_encoding::utf8_percent_encode(text, percent_encoding::NON_ALPHANUMERIC).to_string()
}
