use crate::error::{ApiError, ApiResult};
use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};
use regex::Regex;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    io::{Cursor, Write},
    path::Path,
    sync::LazyLock,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}
pub fn write_log(root: &Path, level: &str, message: &str) {
    static LOG_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOG_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = root.join("logs/backend.log");
    if fs::metadata(&path).is_ok_and(|m| m.len() > 5 * 1024 * 1024) {
        let backup = path.with_extension("log.1");
        let _ = fs::remove_file(&backup);
        let _ = fs::rename(&path, &backup);
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(
            file,
            "{} [{level}] backend: {message}",
            Local::now().format("%Y-%m-%d %H:%M:%S,%3f")
        );
    }
}
pub fn round(value: f64, digits: i32) -> f64 {
    let scale = 10f64.powi(digits);
    (value * scale).round_ties_even() / scale
}
fn summary(values: &VecDeque<f64>) -> Value {
    if values.is_empty() {
        return json!({"count":0,"last":0.0,"avg":0.0,"max":0.0,"p95":0.0});
    }
    let mut sorted: Vec<f64> = values.iter().copied().collect();
    sorted.sort_by(f64::total_cmp);
    json!({"count":values.len(),"last":round(*values.back().unwrap(),3),"avg":round(values.iter().sum::<f64>()/values.len()as f64,3),"max":round(*sorted.last().unwrap(),3),"p95":round(sorted[(values.len()*95).div_ceil(100)-1],3)})
}
#[derive(Default)]
pub struct Metrics {
    pub clients: BTreeMap<String, i64>,
    pub frames_processed: u64,
    pub frames_dropped: u64,
    pub queue_depth: usize,
    pub queue_peak: usize,
    drop_reasons: BTreeMap<String, u64>,
    datagrams: u64,
    parsed: u64,
    rejected: BTreeMap<String, u64>,
    last_datagram: Option<f64>,
    last_length: usize,
    schemas: BTreeMap<String, u64>,
    last_schema: Option<String>,
    previous_timestamp: Option<u32>,
    source: Option<String>,
    duplicates: u64,
    out_of_order: u64,
    wraps: u64,
    estimated_drops: u64,
    resets: u64,
    stages: BTreeMap<String, VecDeque<f64>>,
    pub overlay_counters: BTreeMap<String, u64>,
    pub overlay_durations: BTreeMap<String, VecDeque<f64>>,
    pub persistence_pending: u64,
    pub persistence_completed: u64,
    pub persistence_failures: u64,
    pub persistence_dropped: u64,
    pub profile_failures: u64,
    pub persistence_last_write_ms: f64,
}
impl Metrics {
    pub fn datagram(&mut self, length: usize) {
        self.datagrams += 1;
        self.last_length = length;
        self.last_datagram = Some(now());
    }
    pub fn reject(&mut self, reason: &str) {
        *self.rejected.entry(reason.into()).or_default() += 1;
        if reason == "not_racing" {
            self.rebase();
        }
    }
    fn rebase(&mut self) {
        if self.previous_timestamp.take().is_some() {
            self.resets += 1;
        }
        self.source = None;
    }
    pub fn parsed(&mut self, frame: &Value, source: String) {
        self.parsed += 1;
        if let Some(schema) = frame["TelemetrySchema"].as_str() {
            *self.schemas.entry(schema.into()).or_default() += 1;
            self.last_schema = Some(schema.into());
        }
        let Some(timestamp) = frame["TimestampMS"].as_u64().map(|x| x as u32) else {
            return;
        };
        if self.source.as_ref().is_some_and(|s| s != &source) {
            self.rebase();
        }
        self.source = Some(source);
        if let Some(previous) = self.previous_timestamp {
            if timestamp == previous {
                self.duplicates += 1;
                return;
            }
            let elapsed = if timestamp < previous {
                let wrapped = timestamp.wrapping_sub(previous);
                if wrapped <= 60000 {
                    self.wraps += 1;
                    wrapped
                } else if previous - timestamp <= 250 {
                    self.out_of_order += 1;
                    return;
                } else {
                    self.rebase();
                    self.previous_timestamp = Some(timestamp);
                    return;
                }
            } else {
                timestamp - previous
            };
            self.estimated_drops += (elapsed / 16).saturating_sub(1) as u64;
        }
        self.previous_timestamp = Some(timestamp);
    }
    pub fn dropped(&mut self, count: u64, reason: &str) {
        self.frames_dropped += count;
        *self.drop_reasons.entry(reason.into()).or_default() += count;
    }
    pub fn stage(&mut self, name: &str, milliseconds: f64) {
        let values = self.stages.entry(name.into()).or_default();
        if values.len() >= 240 {
            values.pop_front();
        }
        values.push_back(milliseconds.max(0.0));
    }
    pub fn client_delta(&mut self, channel: &str, delta: i64) {
        let count = self.clients.entry(channel.into()).or_default();
        *count = (*count + delta).max(0);
    }
    pub fn telemetry(&self) -> Value {
        json!({"contractVersion":"telemetry-pipeline-metrics/v1","framesProcessed":self.frames_processed,"framesDropped":self.frames_dropped,"dropReasons":self.drop_reasons,
        "input":{"datagramsReceived":self.datagrams,"packetsParsed":self.parsed,"packetsRejected":self.rejected,"lastDatagramAt":self.last_datagram,"lastPacketLength":self.last_length,"schemasAccepted":self.schemas,"lastPacketSchema":self.last_schema,"timestampDiagnostics":{"duplicates":self.duplicates,"outOfOrder":self.out_of_order,"wraps":self.wraps,"estimatedDrops":self.estimated_drops,"resets":self.resets}},
        "queue":{"current":self.queue_depth,"peak":self.queue_peak},"clients":{"json":self.clients.get("json").copied().unwrap_or(0),"binary":self.clients.get("binary").copied().unwrap_or(0)},"stagesMs":self.stages.iter().map(|(k,v)|(k.clone(),summary(v))).collect::<BTreeMap<_,_>>(),
        "profilePersistence":{"pendingWrites":0,"failedWrites":self.profile_failures},"raceRecorderPersistence":{"pendingWork":self.persistence_pending,"queuePeak":0,"completedBatches":self.persistence_completed,"droppedBatches":0,"droppedSamples":self.persistence_dropped,"failedWrites":self.persistence_failures,"rejectedControlWork":0,"lastWriteDurationMs":round(self.persistence_last_write_ms,3)}})
    }
    pub fn overlay(&self) -> Value {
        json!({"contractVersion":"overlay-performance-metrics/v1","renderMode":if std::env::var("VFD_RENDER_MODE").as_deref()==Ok("optimized"){"optimized"}else{"legacy"},"activeClients":self.clients.get("overlay").copied().unwrap_or(0),"counters":self.overlay_counters,"durationsMs":self.overlay_durations.iter().map(|(k,v)|(k.clone(),summary(v))).collect::<BTreeMap<_,_>>()})
    }
    pub fn overlay_duration(&mut self, key: &str, milliseconds: f64) {
        let samples = self.overlay_durations.entry(key.into()).or_default();
        if samples.len() >= 120 {
            samples.pop_front();
        }
        samples.push_back(milliseconds);
    }
}
static LOG_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\w+)\] ([\w.-]+): (.*)$").unwrap()
});
pub fn logs(path: &Path, level: Option<&str>, limit: i64) -> Value {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut entries: Vec<Value> = Vec::new();
    for line in text.lines() {
        if let Some(m) = LOG_PATTERN.captures(line) {
            entries.push(json!({"timestamp":&m[1],"level":m[2].to_uppercase(),"logger":&m[3],"message":&m[4]}));
        } else if let Some(entry) = entries.last_mut() {
            entry["message"] = json!(format!(
                "{}\n{line}",
                entry["message"].as_str().unwrap_or("")
            ));
        } else {
            entries.push(json!({"timestamp":"","level":"INFO","logger":"stdout","message":line}));
        }
    }
    if let Some(level) = level.filter(|l| !l.eq_ignore_ascii_case("ALL")) {
        entries.retain(|e| {
            e["level"]
                .as_str()
                .is_some_and(|l| l.eq_ignore_ascii_case(level))
        });
    }
    let start = if limit > 0 {
        entries.len().saturating_sub(limit as usize)
    } else if limit < 0 {
        (-limit) as usize
    } else {
        0
    };
    json!({"logs":entries.into_iter().skip(start).collect::<Vec<_>>()})
}
pub fn redact(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(key, _)| {
                    let key = key.to_lowercase().replace('-', "_");
                    ![
                        "password",
                        "passphrase",
                        "credential",
                        "secret",
                        "token",
                        "authorization",
                        "api_key",
                        "apikey",
                        "raw_udp",
                        "payload",
                        "packet",
                        "path",
                        "player",
                        "gamertag",
                        "user_name",
                        "username",
                        "email",
                    ]
                    .iter()
                    .any(|part| key.contains(part))
                })
                .map(|(k, v)| (k.clone(), redact(v)))
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.iter().map(redact).collect()),
        Value::String(text) => {
            static UNSAFE: LazyLock<Regex> = LazyLock::new(|| {
                Regex::new(r"(?i)\b(raw[_ ]?udp|packet payload|raw payload)\b").unwrap()
            });
            static SECRET: LazyLock<Regex> = LazyLock::new(|| {
                Regex::new(r"(?i)\b(?:password|passphrase|token|secret|credential|authorization|proxy-authorization|api[_-]?key)\b\s*[:=]|\b(?:bearer|basic)\s+\S").unwrap()
            });
            static PATH: LazyLock<Regex> = LazyLock::new(|| {
                Regex::new(r"[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+|(?:^|[^:/\w])/\S").unwrap()
            });
            static EMAIL: LazyLock<Regex> =
                LazyLock::new(|| Regex::new(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b").unwrap());
            json!(if UNSAFE.is_match(text) {
                "[redacted: unsafe diagnostic content]".to_owned()
            } else if SECRET.is_match(text) {
                "[redacted: credential]".to_owned()
            } else if PATH.is_match(text) {
                "[redacted: absolute path]".to_owned()
            } else {
                EMAIL.replace_all(text, "[redacted-email]").into_owned()
            })
        }
        _ => value.clone(),
    }
}
pub fn support_bundle(log_path: &Path, diagnostics: &Value, request: &Value) -> ApiResult<Vec<u8>> {
    let minutes = request
        .get("windowMinutes")
        .and_then(Value::as_i64)
        .unwrap_or(10);
    if !(1..=60).contains(&minutes) {
        return Err(ApiError::invalid("windowMinutes must be between 1 and 60"));
    }
    let allowed = [
        "discordPresence",
        "overlay",
        "recentLogs",
        "telemetryPipeline",
    ];
    let fields: Vec<String> = request
        .get("fields")
        .and_then(Value::as_array)
        .filter(|v| !v.is_empty())
        .map(|values| {
            values
                .iter()
                .map(|v| v.as_str().unwrap_or("").to_string())
                .collect()
        })
        .unwrap_or_else(|| allowed.iter().map(|s| s.to_string()).collect());
    if fields.iter().any(|s| !allowed.contains(&s.as_str())) {
        return Err(ApiError::new(400, "Invalid support bundle request"));
    }
    let now = Utc::now();
    let cutoff = now - chrono::Duration::minutes(minutes);
    let mut files = Vec::new();
    for field in &fields {
        if field == "recentLogs" {
            let parsed = logs(log_path, None, 0);
            let mut entries = Vec::new();
            for entry in parsed["logs"].as_array().into_iter().flatten() {
                let timestamp = entry["timestamp"].as_str().unwrap_or("");
                let parsed = NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%d %H:%M:%S,%3f")
                    .ok()
                    .and_then(|v| Local.from_local_datetime(&v).earliest())
                    .map(DateTime::<Utc>::from);
                if parsed.is_some_and(|v| v >= cutoff && v <= now) {
                    entries.push(format!(
                        "{} [{}] {}: {}",
                        timestamp,
                        entry["level"].as_str().unwrap_or(""),
                        entry["logger"].as_str().unwrap_or(""),
                        entry["message"].as_str().unwrap_or("")
                    ));
                }
            }
            let mut text = String::new();
            for entry in entries.iter().skip(entries.len().saturating_sub(100)) {
                for line in entry.lines() {
                    let safe = redact(&json!(line));
                    let line = safe.as_str().unwrap_or("");
                    if text.len() + line.len() + 1 > 256 * 1024 {
                        break;
                    }
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(line);
                }
            }
            files.push(("recent-logs.txt".into(), text.into_bytes()));
        } else {
            files.push((
                format!("diagnostics/{field}.json"),
                serde_json::to_vec_pretty(&redact(&diagnostics[field]))?,
            ));
        }
    }
    files.push(("manifest.json".into(),serde_json::to_vec_pretty(&json!({"schemaVersion":"fh6-diagnostic-support-bundle/v1","generatedAt":now.to_rfc3339(),"appVersion":env!("CARGO_PKG_VERSION"),"backendVersion":format!("{}.0",env!("CARGO_PKG_VERSION")),"settingsSchema":"settings/v1 (schema identifier only; no settings values)","windowMinutes":minutes,"includedFields":fields,"redaction":{"excluded":["raw UDP payloads and packets","absolute paths","player identifiers","credentials, tokens, and secrets"],"collection":"manual local export; this bundle is not uploaded automatically"}}))?));
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in files {
        if bytes.len() > 256 * 1024 {
            return Err(ApiError::new(400, "Invalid support bundle request"));
        }
        archive
            .start_file(
                name,
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated),
            )
            .map_err(|_| ApiError::new(500, "Unable to create support bundle"))?;
        archive.write_all(&bytes)?;
    }
    let result = archive
        .finish()
        .map_err(|_| ApiError::new(500, "Unable to create support bundle"))?
        .into_inner();
    if result.len() > 1024 * 1024 {
        return Err(ApiError::new(400, "Invalid support bundle request"));
    }
    Ok(result)
}
