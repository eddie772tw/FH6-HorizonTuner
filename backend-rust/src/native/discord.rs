use std::env;
use std::io::{Read, Write};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

const IPC_PIPE_COUNT: usize = 10;
const UPDATE_INTERVAL: Duration = Duration::from_millis(500);
const STALE_TELEMETRY: Duration = Duration::from_secs(5);
const HEARTBEAT: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Default)]
pub struct PresenceSnapshot {
    pub car_ordinal: i64,
    pub car_name: String,
    pub mode: String,
    pub current_lap_seconds: Option<f64>,
    pub last_lap_seconds: Option<f64>,
    pub best_lap_seconds: Option<f64>,
    pub lap_number: Option<i64>,
    pub race_position: Option<i64>,
    pub current_race_time: Option<f64>,
}

fn positive_f64(value: Option<&Value>) -> Option<f64> {
    let value = value?.as_f64()?;
    value.is_finite().then_some(value).filter(|x| *x > 0.0)
}

fn positive_i64(value: Option<&Value>) -> Option<i64> {
    let value = value?.as_i64()?;
    (value > 0).then_some(value)
}

pub fn snapshot_from_telemetry(data: &Value) -> PresenceSnapshot {
    let car_ordinal = data.get("CarOrdinal").and_then(Value::as_i64).unwrap_or(0);
    let race_time = positive_f64(data.get("CurrentRaceTime"));
    let lap = positive_f64(data.get("CurrentLap"));
    let is_race = data.get("IsRaceOn").and_then(Value::as_i64).unwrap_or(0) == 1;
    let car_name = data
        .get("CarName")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if car_ordinal > 0 {
                "Car"
            } else {
                "Unknown Car"
            }
        })
        .to_owned();
    PresenceSnapshot {
        car_ordinal,
        car_name,
        mode: if is_race && race_time.is_some() && lap.is_some() {
            "race"
        } else {
            "roam"
        }
        .into(),
        current_lap_seconds: lap,
        last_lap_seconds: positive_f64(data.get("LastLap")),
        best_lap_seconds: positive_f64(data.get("BestLap")),
        lap_number: positive_i64(data.get("LapNumber")),
        race_position: positive_i64(data.get("RacePosition")),
        current_race_time: race_time,
    }
}

fn lap_time(value: Option<f64>) -> String {
    let Some(value) = value.filter(|v| v.is_finite() && *v > 0.0) else {
        return "--".into();
    };
    let minutes = (value / 60.0).floor() as u64;
    format!("{minutes}:{:06.3}", value - minutes as f64 * 60.0)
}

fn activity(snapshot: &PresenceSnapshot, start: i64) -> Value {
    let state = if snapshot.mode == "race" {
        let lap = snapshot
            .lap_number
            .map(|x| format!("Lap {x}"))
            .unwrap_or_else(|| "Race".into());
        let position = snapshot
            .race_position
            .map(|x| format!("P{x}"))
            .unwrap_or_else(|| "P--".into());
        format!(
            "Race · {lap} · {position} · {}",
            lap_time(snapshot.best_lap_seconds)
        )
    } else {
        "Roaming".into()
    };
    json!({"type": 0, "details": snapshot.car_name.chars().take(128).collect::<String>(), "state": state.chars().take(128).collect::<String>(), "timestamps": {"start": start}, "assets": {"large_image": "fh6_horizon_tuner", "large_text": "FH6 HorizonTuner", "small_text": snapshot.car_name}})
}

trait IpcStream: Read + Write + Send {}
impl<T: Read + Write + Send> IpcStream for T {}

struct DiscordIpc {
    stream: Option<Box<dyn IpcStream>>,
    application_id: String,
}

impl DiscordIpc {
    fn new(application_id: String) -> Self {
        Self {
            stream: None,
            application_id,
        }
    }

    fn connect(&mut self) -> Result<(), String> {
        for index in 0..IPC_PIPE_COUNT {
            let stream: Result<Box<dyn IpcStream>, String> = if cfg!(windows) {
                std::fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .open(format!(r"\\?\pipe\discord-ipc-{index}"))
                    .map(|s| Box::new(s) as Box<dyn IpcStream>)
                    .map_err(|e| e.to_string())
            } else {
                #[cfg(unix)]
                {
                    std::os::unix::net::UnixStream::connect(format!("/tmp/discord-ipc-{index}"))
                        .map(|s| Box::new(s) as Box<dyn IpcStream>)
                        .map_err(|e| e.to_string())
                }
                #[cfg(not(unix))]
                {
                    Err("Discord IPC is unavailable on this platform".into())
                }
            };
            let Ok(stream) = stream else { continue };
            self.stream = Some(stream);
            if self
                .send(0, &json!({"v": 1, "client_id": self.application_id}))
                .and_then(|response| {
                    if response.get("evt").and_then(Value::as_str) == Some("READY") {
                        Ok(())
                    } else {
                        Err("Discord IPC handshake was not ready".into())
                    }
                })
                .is_ok()
            {
                return Ok(());
            }
            self.close();
        }
        Err("Discord Desktop IPC pipe not available".into())
    }

    fn send(&mut self, opcode: u32, payload: &Value) -> Result<Value, String> {
        let Some(stream) = self.stream.as_mut() else {
            return Err("Discord IPC is not connected".into());
        };
        let bytes = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
        stream
            .write_all(&opcode.to_le_bytes())
            .map_err(|e| e.to_string())?;
        stream
            .write_all(&(bytes.len() as u32).to_le_bytes())
            .map_err(|e| e.to_string())?;
        stream.write_all(&bytes).map_err(|e| e.to_string())?;
        let mut header = [0u8; 8];
        stream.read_exact(&mut header).map_err(|e| e.to_string())?;
        let response_opcode = u32::from_le_bytes(header[..4].try_into().unwrap());
        let length = u32::from_le_bytes(header[4..].try_into().unwrap());
        if response_opcode != 1 || length > 4 * 1024 * 1024 {
            return Err("Discord IPC response was invalid".into());
        }
        let mut body = vec![0; length as usize];
        stream.read_exact(&mut body).map_err(|e| e.to_string())?;
        serde_json::from_slice(&body).map_err(|e| e.to_string())
    }

    fn set_activity(&mut self, payload: Value) -> Result<(), String> {
        let nonce = format!("{}-{}", unix_seconds(), payload.to_string().len());
        let response = self.send(1, &json!({"cmd": "SET_ACTIVITY", "args": {"pid": std::process::id(), "activity": payload}, "nonce": nonce}))?;
        if response.get("evt").and_then(Value::as_str) == Some("ERROR") {
            return Err("Discord IPC rejected SET_ACTIVITY".into());
        }
        Ok(())
    }
    fn clear(&mut self) {
        let _ = self.send(1, &json!({"cmd": "SET_ACTIVITY", "args": {"pid": std::process::id(), "activity": Value::Null}, "nonce": "clear"}));
    }
    fn close(&mut self) {
        self.stream.take();
    }
}

struct WorkerState {
    latest: Option<(Value, std::time::Instant)>,
    stop: bool,
}

pub struct DiscordPresence {
    application_id: Option<String>,
    state: Arc<(Mutex<WorkerState>, Condvar)>,
    status: Arc<Mutex<Value>>,
    join: Mutex<Option<JoinHandle<()>>>,
}

impl DiscordPresence {
    pub fn new() -> Self {
        Self::for_data_root(None)
    }
    pub fn for_data_root(root: Option<&std::path::Path>) -> Self {
        let valid = |value: String| {
            let value = value.trim().to_owned();
            ((17..=20).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit()))
                .then_some(value)
        };
        let resource = if cfg!(debug_assertions) {
            Some(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend"))
        } else {
            env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(std::path::Path::to_owned))
        };
        let read = |path: std::path::PathBuf| {
            std::fs::read(path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .and_then(|v| {
                    v.get("discord_application_id")
                        .filter(|v| !v.is_null())
                        .map(|v| {
                            v.as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string())
                        })
                })
                .and_then(valid)
        };
        let project = resource
            .as_deref()
            .and_then(std::path::Path::parent)
            .and_then(|p| read(p.join("config/discord.local.json")));
        let local = root.and_then(|root| read(root.join("discord.local.json")));
        let legacy = resource
            .as_deref()
            .and_then(|p| read(p.join("discord_application_id.json")));
        let application_id = env::var("DISCORD_APPLICATION_ID")
            .ok()
            .and_then(valid)
            .or(project)
            .or(local)
            .or(legacy)
            .or_else(|| valid(env!("FH6_BUNDLED_DISCORD_APPLICATION_ID").to_owned()));
        let configured = application_id.is_some();
        Self {
            application_id,
            state: Arc::new((
                Mutex::new(WorkerState {
                    latest: None,
                    stop: false,
                }),
                Condvar::new(),
            )),
            status: Arc::new(Mutex::new(
                json!({"configured": configured, "state": if configured {"waiting_for_telemetry"} else {"missing_application_id"}, "lastError": null, "lastTelemetryAt": null, "lastAttemptAt": null, "connectionAttempts": 0, "updatesSent": 0, "lastActivity": null, "lastActivitySentAt": null, "reconnects": 0}),
            )),
            join: Mutex::new(None),
        }
    }

    pub fn start(&self) {
        if self.application_id.is_none() {
            return;
        }
        let mut slot = self.join.lock().unwrap();
        if slot.is_some() {
            return;
        }
        let state = self.state.clone();
        let status = self.status.clone();
        let application_id = self.application_id.clone().unwrap();
        *slot = Some(
            thread::Builder::new()
                .name("discord-presence".into())
                .spawn(move || run_worker(state, status, application_id))
                .expect("Discord worker must start"),
        );
    }
    pub fn stop(&self) {
        {
            let (lock, signal) = &*self.state;
            if let Ok(mut state) = lock.lock() {
                state.stop = true;
                signal.notify_all();
            }
        }
        if let Some(join) = self.join.lock().unwrap().take() {
            super::finish_worker_with_timeout(join, Duration::from_secs(2));
        }
    }
    pub fn submit(&self, telemetry: Value) {
        if self.application_id.is_none() {
            return;
        }
        if let Ok(mut status) = self.status.lock() {
            status["lastTelemetryAt"] = json!(crate::diagnostics::now());
            if matches!(
                status["state"].as_str(),
                Some("waiting_for_telemetry" | "error")
            ) {
                status["state"] = json!("waiting_for_discord");
            }
        }
        let (lock, signal) = &*self.state;
        if let Ok(mut state) = lock.lock() {
            state.latest = Some((telemetry, std::time::Instant::now()));
            signal.notify_one();
        }
    }
    pub fn clear(&self) {
        self.stop();
    }
    pub fn status(&self) -> Value {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or_else(|_| json!({"configured": false, "state": "unavailable"}))
    }
}

impl Default for DiscordPresence {
    fn default() -> Self {
        Self::new()
    }
}

fn run_worker(
    state: Arc<(Mutex<WorkerState>, Condvar)>,
    status: Arc<Mutex<Value>>,
    application_id: String,
) {
    let mut client = DiscordIpc::new(application_id);
    let mut last_key = String::new();
    let mut last_sent = std::time::Instant::now() - HEARTBEAT;
    let mut activity_start = unix_seconds();
    let mut mode = String::new();
    let mut car = 0i64;
    let mut reconnects = 0u64;
    loop {
        let (lock, signal) = &*state;
        let mut guard = lock.lock().unwrap();
        let result = signal.wait_timeout(guard, UPDATE_INTERVAL).unwrap();
        guard = result.0;
        if guard.stop {
            break;
        }
        let Some((data, received)) = guard.latest.clone() else {
            continue;
        };
        drop(guard);
        if received.elapsed() > STALE_TELEMETRY {
            client.clear();
            continue;
        }
        let snapshot = snapshot_from_telemetry(&data);
        if snapshot.mode != mode || snapshot.car_ordinal != car {
            activity_start = unix_seconds();
            mode = snapshot.mode.clone();
            car = snapshot.car_ordinal;
        }
        let payload = activity(&snapshot, activity_start);
        let key = payload.to_string();
        if key == last_key && last_sent.elapsed() < HEARTBEAT {
            continue;
        }
        if client.stream.is_none() {
            if let Ok(mut s) = status.lock() {
                s["state"] = json!("connecting");
                s["connectionAttempts"] = json!(s["connectionAttempts"].as_u64().unwrap_or(0) + 1);
                s["lastAttemptAt"] = json!(unix_seconds());
            }
            if client.connect().is_err() {
                reconnects += 1;
                if let Ok(mut s) = status.lock() {
                    s["state"] = json!("error");
                    s["lastError"] = json!("Discord IPC unavailable");
                    s["reconnects"] = json!(reconnects);
                }
                continue;
            }
        }
        match client.set_activity(payload.clone()) {
            Ok(()) => {
                last_key = key;
                last_sent = std::time::Instant::now();
                if let Ok(mut s) = status.lock() {
                    s["state"] = json!("connected");
                    s["updatesSent"] = json!(s["updatesSent"].as_u64().unwrap_or(0) + 1);
                    s["lastActivity"] = payload;
                    s["lastActivitySentAt"] = json!(unix_seconds());
                }
            }
            Err(error) => {
                client.close();
                reconnects += 1;
                if let Ok(mut s) = status.lock() {
                    s["state"] = json!("error");
                    s["lastError"] = json!(error.chars().take(240).collect::<String>());
                    s["reconnects"] = json!(reconnects);
                }
            }
        }
    }
    client.clear();
    client.close();
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
