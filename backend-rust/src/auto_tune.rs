use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicU16, Ordering},
    Mutex,
};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

type Result<T> = std::result::Result<T, String>;

pub struct AutoTune {
    slot: Mutex<Option<Run>>,
    root: PathBuf,
    runtime: Option<PathBuf>,
    port: AtomicU16,
}

struct Run {
    dir: PathBuf,
    child: Child,
    goal: String,
    season: String,
    request: StartRequest,
    from_agent: bool,
    started: Instant,
    started_at: SystemTime,
    finished_ms: Option<u64>,
    timing_written: bool,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Snapshot {
    status: String,
    step: u8,
    elapsed_ms: u64,
    observed: BTreeMap<String, Value>,
    recommended: BTreeMap<String, Value>,
    logs: Vec<Log>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Log {
    elapsed_ms: u64,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    #[serde(flatten)]
    state: Snapshot,
    pub run_id: String,
    image_revision: Option<String>,
    pub active: bool,
    source: &'static str,
    goal: String,
    season: String,
}

fn request_stop(run: &mut Run) -> Result<()> {
    if run.child.try_wait().map_err(|e| e.to_string())?.is_none() {
        fs::write(run.dir.join("STOP"), []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn set_enabled(base: &Path, value: bool, run: Option<&mut Run>) -> Result<()> {
    let path = base.join("developer-options");
    if value {
        fs::create_dir_all(base).map_err(|e| e.to_string())?;
        fs::write(path, []).map_err(|e| e.to_string())
    } else {
        if let Some(run) = run {
            request_stop(run)?;
        }
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn quiet(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.stdin(Stdio::null())
}

fn create_run_dir(base: &Path) -> Result<PathBuf> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_micros();
    let dir = base.join(format!("run-{stamp}-{}", std::process::id()));
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn validate_goal(goal: &str, season: &str) -> Result<()> {
    if goal == "Drift" {
        return Err("Drift requires manual gear, RPM and wheel-speed targets.".into());
    }
    if !matches!(goal, "Road" | "Rally" | "Drag")
        || !matches!(season, "Spring" | "Summer" | "Autumn" | "Winter")
    {
        return Err("Unknown goal or season.".into());
    }
    Ok(())
}

fn revision(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    Some(format!(
        "{}-{}",
        meta.modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_nanos(),
        meta.len()
    ))
}

/// Usage disclosure is an agent instruction, not a separate feature gate.
pub const EXPERIMENTAL_NOTICE: &str = "Before starting, tell the user that automated tuning is experimental and may be less efficient than the agent's native computer-use capability, if available. Developer options only control tab visibility; MCP does not require them. This tool changes in-game tuning and drives the selected car. Keep FH6 in the foreground in its festival garage; use status and screenshot tools to monitor, and stop to cancel.";

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRequest {
    pub goal: String,
    pub season: String,
    pub expected_car_name: Option<String>,
    pub request_id: Option<String>,
}

impl AutoTune {
    pub fn new(root: &Path) -> Self {
        Self {
            slot: Mutex::new(None),
            root: root.join("auto-tune"),
            runtime: std::env::var_os("FH6_AUTO_TUNE_RUNTIME").map(PathBuf::from),
            port: AtomicU16::new(0),
        }
    }
    pub fn set_port(&self, port: u16) {
        self.port.store(port, Ordering::Relaxed);
    }
    pub fn enabled(&self) -> bool {
        cfg!(windows) && self.root.join("developer-options").is_file()
    }
    pub fn set_enabled(&self, value: bool) -> Result<()> {
        if !cfg!(windows) {
            return Err("Game control requires Windows.".into());
        }
        let mut slot = self.slot.lock().map_err(|e| e.to_string())?;
        set_enabled(
            &self.root,
            value,
            slot.as_mut().filter(|run| !run.from_agent),
        )
    }
    pub fn available(&self) -> bool {
        cfg!(windows)
            && self.runtime.as_ref().is_some_and(|p| {
                p.join("python/python.exe").is_file() && p.join("auto_tune/worker.py").is_file()
            })
    }
    pub fn start(&self, request: StartRequest, agent: bool) -> Result<String> {
        validate_goal(&request.goal, &request.season)?;
        if agent {
            if request
                .expected_car_name
                .as_ref()
                .is_none_or(|s| s.trim().is_empty() || s.len() > 160)
                || request
                    .request_id
                    .as_ref()
                    .is_none_or(|s| s.trim().is_empty() || s.len() > 80)
            {
                return Err("MCP start requires expectedCarName and a unique requestId.".into());
            }
        } else if !self.enabled() {
            return Err("Enable developer options to start from the desktop tab.".into());
        }
        let mut slot = self.slot.lock().map_err(|e| e.to_string())?;
        if let Some(run) = slot.as_mut() {
            if request.request_id.is_some() && request.request_id == run.request.request_id {
                if request != run.request {
                    return Err("Request ID already used with different arguments.".into());
                }
                return Ok(run.dir.file_name().unwrap().to_string_lossy().into_owned());
            }
            if run.child.try_wait().map_err(|e| e.to_string())?.is_none() {
                return Err("A tuning run is already active. Poll or stop it first.".into());
            }
        }
        if !self.available() {
            return Err("Open the packaged Windows HorizonTuner desktop to provide the embedded controller runtime.".into());
        }
        let port = self.port.load(Ordering::Relaxed);
        if port == 0 {
            return Err("Backend HTTP listener is not ready.".into());
        }
        let bundle = self.runtime.as_ref().unwrap();
        let started = Instant::now();
        let started_at = SystemTime::now();
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let dir = create_run_dir(&self.root)?;
        let start_ms = started_at
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64;
        fs::write(dir.join("desktop-start.json"), serde_json::json!({"startedAtUnixMs":start_ms,"goal":request.goal,"season":request.season,"source":if agent {"mcp"}else{"desktop"},"requestId":request.request_id}).to_string()).map_err(|e| e.to_string())?;
        let mut command = Command::new(bundle.join("python/python.exe"));
        command
            .args(["-I", "-B", "-X", "utf8"])
            .arg(bundle.join("auto_tune/worker.py"))
            .args(["--ocr-engine", "onnx", "--ocr-runtime"])
            .arg(bundle.join("auto_tune/native"))
            .arg("--output")
            .arg(&dir)
            .arg("--port")
            .arg(port.to_string())
            .arg("--goal")
            .arg(&request.goal)
            .arg("--season")
            .arg(&request.season)
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .current_dir(bundle.join("auto_tune"))
            .stdout(Stdio::null())
            .stderr(fs::File::create(dir.join("worker.stderr")).map_err(|e| e.to_string())?);
        if let Some(name) = &request.expected_car_name {
            command.arg("--expected-car-name").arg(name);
        }
        let child = quiet(&mut command).spawn().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow(child.id());
        }
        let run_id = dir.file_name().unwrap().to_string_lossy().into_owned();
        *slot = Some(Run {
            dir,
            child,
            goal: request.goal.clone(),
            season: request.season.clone(),
            request,
            from_agent: agent,
            started,
            started_at,
            finished_ms: None,
            timing_written: false,
        });
        Ok(run_id)
    }
    pub fn stop(&self, run_id: Option<&str>) -> Result<()> {
        let mut slot = self.slot.lock().map_err(|e| e.to_string())?;
        if let Some(run) = slot.as_mut() {
            if run_id.is_some_and(|id| run.dir.file_name().and_then(|s| s.to_str()) != Some(id)) {
                return Err("Tuning run changed.".into());
            }
            request_stop(run)?;
        }
        Ok(())
    }
    pub fn image(&self, run_id: &str) -> Result<Vec<u8>> {
        let slot = self.slot.lock().map_err(|e| e.to_string())?;
        let run = slot.as_ref().ok_or("No tuning run.")?;
        if run.dir.file_name().and_then(|s| s.to_str()) != Some(run_id) {
            return Err("Tuning run changed.".into());
        }
        let path = crate::storage::safe_path(&run.dir, "latest.png").map_err(|e| e.to_string())?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
            return Err("Screenshot is too large.".into());
        }
        fs::read(path).map_err(|e| e.to_string())
    }
    pub fn status(&self) -> Result<Value> {
        Ok(
            serde_json::json!({"available":self.available(),"developerOptions":self.enabled(),"experimental":true,"instructions":EXPERIMENTAL_NOTICE,"run":self.poll()?}),
        )
    }
    pub fn poll(&self) -> Result<Option<View>> {
        let mut slot = self.slot.lock().map_err(|e| e.to_string())?;
        let Some(run) = slot.as_mut() else {
            return Ok(None);
        };
        let exit = run.child.try_wait().map_err(|e| e.to_string())?;
        let elapsed = run.started.elapsed().as_millis() as u64;
        let end = if exit.is_some() {
            *run.finished_ms.get_or_insert(elapsed)
        } else {
            elapsed
        };
        let path = run.dir.join("state.json");
        let mut view: Snapshot = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Snapshot::default(),
            Err(e) => return Err(e.to_string()),
        };
        let terminal = matches!(view.status.as_str(), "failed" | "stopped" | "completed");
        if let Some(exit) = exit {
            if !terminal || (view.status == "completed" && !exit.success()) {
                let text = fs::read_to_string(run.dir.join("worker.stderr")).unwrap_or_default();
                let reason = text
                    .lines()
                    .rev()
                    .find(|s| !s.trim().is_empty())
                    .unwrap_or("Controller exited before completing the run.");
                view.status = "failed".into();
                view.logs.push(Log {
                    elapsed_ms: end,
                    message: format!("{reason} ({exit})"),
                });
            }
        } else if !terminal {
            view.status = if run.dir.join("STOP").exists() {
                "stopping"
            } else {
                "running"
            }
            .into();
        }
        // Terminal state is atomically written by the worker. Its timestamp includes
        // desktop startup overhead even if the tab was closed halfway through.
        view.elapsed_ms = if terminal {
            fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(run.started_at).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(end)
        } else {
            end
        };
        if exit.is_some() && !run.timing_written {
            let timing = serde_json::json!({ "elapsedMs": view.elapsed_ms, "status": view.status });
            fs::write(run.dir.join("desktop-timing.json"), timing.to_string())
                .map_err(|e| e.to_string())?;
            run.timing_written = true;
        }
        Ok(Some(View {
            state: view,
            active: exit.is_none(),
            source: if run.from_agent { "mcp" } else { "desktop" },
            goal: run.goal.clone(),
            season: run.season.clone(),
            run_id: run.dir.file_name().unwrap().to_string_lossy().into_owned(),
            image_revision: revision(&run.dir.join("latest.png")),
        }))
    }
}
impl Drop for AutoTune {
    fn drop(&mut self) {
        let _ = self.stop(None);
    }
}
#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn agent_run_shares_exclusion_and_cancellation_without_a_developer_gate() {
        use super::*;
        let root = create_run_dir(&std::env::temp_dir()).unwrap();
        let service = AutoTune::new(&root);
        fs::create_dir_all(&service.root).unwrap();
        let dir = create_run_dir(&service.root).unwrap();
        let id = dir.file_name().unwrap().to_string_lossy().into_owned();
        let request = StartRequest {
            goal: "Road".into(),
            season: "Winter".into(),
            expected_car_name: Some("1964 Aston Martin DB5".into()),
            request_id: Some("agent-request".into()),
        };
        let child = quiet(Command::new("cmd.exe").args(["/D", "/Q", "/C", "set /p ignored="]))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        *service.slot.lock().unwrap() = Some(Run {
            dir: dir.clone(),
            child,
            goal: request.goal.clone(),
            season: request.season.clone(),
            request: request.clone(),
            from_agent: true,
            started: Instant::now(),
            started_at: SystemTime::now(),
            finished_ms: None,
            timing_written: false,
        });
        assert_eq!(service.start(request.clone(), true).unwrap(), id);
        let mut different = request.clone();
        different.request_id = Some("second-request".into());
        assert!(service
            .start(different, true)
            .unwrap_err()
            .contains("already active"));
        let mut conflicting = request;
        conflicting.season = "Summer".into();
        assert!(service
            .start(conflicting, true)
            .unwrap_err()
            .contains("different arguments"));
        service.set_enabled(true).unwrap();
        service.set_enabled(false).unwrap();
        assert!(!service.enabled());
        assert!(!dir.join("STOP").exists());
        assert!(service.stop(Some("stale-run")).is_err());
        service.stop(Some(&id)).unwrap();
        assert!(dir.join("STOP").is_file());
        let mut run = service.slot.lock().unwrap().take().unwrap();
        drop(run.child.stdin.take());
        run.child.wait().unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_goals_with_missing_manual_inputs_before_spawning_a_worker() {
        for goal in ["Road", "Rally", "Drag"] {
            assert!(super::validate_goal(goal, "Winter").is_ok());
        }
        assert!(super::validate_goal("Drift", "Winter").is_err());
        assert!(super::validate_goal("Road", "Wnter").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn disabling_options_stops_the_active_child_and_removes_the_gate() {
        use super::*;
        let dir = create_run_dir(&std::env::temp_dir()).unwrap();
        set_enabled(&dir, true, None).unwrap();
        assert!(dir.join("developer-options").is_file());
        let child = quiet(Command::new("cmd.exe").args(["/D", "/Q", "/C", "set /p ignored="]))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut run = Run {
            dir: dir.clone(),
            child,
            goal: "Road".into(),
            season: "Winter".into(),
            request: StartRequest::default(),
            from_agent: false,
            started: Instant::now(),
            started_at: SystemTime::now(),
            finished_ms: None,
            timing_written: false,
        };
        assert!(run.child.try_wait().unwrap().is_none());
        set_enabled(&dir, false, Some(&mut run)).unwrap();
        drop(run.child.stdin.take());
        run.child.wait().unwrap();
        assert!(!dir.join("developer-options").is_file());
        assert!(dir.join("STOP").is_file());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn polling_allows_atomic_replacement_while_the_previous_file_is_open() {
        use super::*;
        use std::io::Read;
        let dir = create_run_dir(&std::env::temp_dir()).unwrap();
        let path = dir.join("state.json");
        fs::write(&path, "running").unwrap();
        // This is also the default share mode used by fs::read in auto_tune_poll.
        let mut previous = fs::File::open(&path).unwrap();
        fs::write(dir.join("state.tmp"), "completed").unwrap();
        fs::rename(dir.join("state.tmp"), &path).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "completed");
        let mut text = String::new();
        previous.read_to_string(&mut text).unwrap();
        assert_eq!(text, "running");
        drop(previous);
        fs::remove_dir_all(dir).unwrap();
    }
}
