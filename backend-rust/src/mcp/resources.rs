use super::service::McpService;
use serde_json::{json, Value};

pub fn list(service: &McpService<'_>) -> Value {
    let mut out = vec![
        json!({"uri":"fh6://telemetry/live","name":"Live Telemetry Snapshot","description":"Latest real-time UDP telemetry frame and ingestion status.","mimeType":"application/json"}),
        json!({"uri":"fh6://settings/current","name":"System & HUD Settings","description":"Current user preferences, units, and HUD configuration.","mimeType":"application/json"}),
    ];
    for session in service.list_race_sessions(5, 0) {
        let id = session["session_id"].as_str().unwrap_or("");
        out.push(json!({"uri":format!("fh6://telemetry/session/{id}"),"name":format!("Race Session {id} ({})",session["car_name"].as_str().unwrap_or("Unknown")),"description":format!("Session summary with {} laps.",session["total_laps"].as_i64().unwrap_or(0)),"mimeType":"application/json"}));
    }
    for c in service.list_captures(None, None, None).into_iter().take(5) {
        let id = c["capture_id"].as_str().unwrap_or("");
        out.push(json!({"uri":format!("fh6://capture/{id}"),"name":format!("Tuning Capture {id}"),"description":format!("Capture dataset ({} samples).",c["samples_count"].as_i64().unwrap_or(0)),"mimeType":"application/json"}));
    }
    Value::Array(out)
}
fn wrap(uri: &str, data: Value) -> Value {
    json!({"contents":[{"uri":uri,"mimeType":"application/json","text":serde_json::to_string_pretty(&data).unwrap_or_else(|_|data.to_string())}]})
}
pub fn read(service: &McpService<'_>, uri: &str) -> Result<Value, (i64, String)> {
    let (scheme, rest) = uri.split_once("://").unwrap_or(("", uri));
    if scheme != "fh6" {
        return Err((
            -32602,
            format!("Unsupported URI scheme: {scheme}. Expected 'fh6://'"),
        ));
    }
    let mut p = rest.split('/');
    let host = p.next().unwrap_or("");
    let id = p.collect::<Vec<_>>().join("/");
    let data = match host {
        "telemetry" if id.is_empty() || id == "live" => service.get_live_telemetry_snapshot(),
        "telemetry" if id.starts_with("session/") => {
            let sid = id.trim_start_matches("session/");
            service
                .session_summary(sid)
                .ok_or_else(|| (-32004, format!("Session not found: {sid}")))?
        }
        "capture" => service
            .capture_summary(&id)
            .ok_or_else(|| (-32004, format!("Capture dataset not found: {id}")))?,
        "car" => {
            let d = service
                .car_details(&id)
                .ok_or_else(|| (-32004, format!("Car not found: {id}")))?;
            json!({"details":d,"capabilities":service.capabilities(&id,None)})
        }
        "tuning" if id.split('/').count() >= 2 => {
            let mut pieces = id.splitn(2, '/');
            let car = pieces.next().unwrap_or("");
            let save = pieces.next().unwrap_or("");
            service
                .preset(car, save)
                .ok_or_else(|| (-32004, format!("Tuning preset not found: {car}/{save}")))?
        }
        "settings" => json!({"settings":service.settings(),"hud":service.hud()}),
        _ => return Err((-32602, format!("Unknown resource URI: {uri}"))),
    };
    Ok(wrap(uri, data))
}
