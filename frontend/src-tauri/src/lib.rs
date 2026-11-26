// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
mod auto_tune_bundle;
mod file_export;

#[cfg(all(target_os = "windows", target_arch = "x86_64", not(debug_assertions)))]
const EMBEDDED_SIDECAR: &[u8] = include_bytes!("../bin/server-sidecar-x86_64-pc-windows-msvc.exe");

#[cfg(all(windows, any(not(target_arch = "x86_64"), debug_assertions)))]
const EMBEDDED_SIDECAR: &[u8] = &[];

#[derive(Clone, Serialize)]
struct BackendStatus {
    state: String,
    port: Option<u16>,
    error: Option<String>,
}

struct BackendState(Mutex<BackendStatus>);

struct BackendProcess(Mutex<Option<Child>>);

impl Default for BackendProcess {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

impl BackendState {
    fn new() -> Self {
        Self(Mutex::new(BackendStatus {
            state: "starting".to_string(),
            port: None,
            error: None,
        }))
    }
}

fn set_backend_status(app_handle: &tauri::AppHandle, status: BackendStatus) {
    if let Ok(mut current) = app_handle.state::<BackendState>().0.lock() {
        *current = status;
    }
}

fn stop_backend_process(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<BackendProcess>();
    let mut process = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(mut child) = process.take() {
        // The owned Rust sidecar drains accepted telemetry and flushes
        // recordings when stdin closes, then releases its UDP sockets.
        drop(child.stdin.take());

        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            match child.try_wait() {
                Ok(Some(_)) => return Ok(()),
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => break,
            }
        }

        if let Err(error) = child.kill().and_then(|()| child.wait().map(|_| ())) {
            *process = Some(child);
            return Err(format!("Cannot stop owned backend before update: {error}"));
        }
    }
    Ok(())
}

static SIDECAR_TMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn ensure_safe_dir(path: &Path) -> Result<PathBuf, String> {
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink() || !m.is_dir()) {
        return Err(format!("Refusing unsafe sidecar directory {path:?}"));
    }
    fs::create_dir_all(path).map_err(|e| format!("Sidecar dir {path:?}: {e}"))?;
    path.canonicalize()
        .map_err(|e| format!("Sidecar path {path:?}: {e}"))
}

fn ensure_extracted_sidecar(root: &Path, ver: &str, embedded: &[u8]) -> Result<PathBuf, String> {
    if embedded.is_empty() {
        return Err("No embedded Windows x64 sidecar is available for this build.".to_string());
    }
    // Reject symlinks/junctions in shared %TEMP% and verify full binary content before executing.
    let canonical_root = ensure_safe_dir(root)?;
    let canonical_dir =
        ensure_safe_dir(&canonical_root.join(format!("sidecar-{ver}-{}", embedded.len())))?;
    if !canonical_dir.starts_with(&canonical_root) {
        return Err(format!("Sidecar directory escaped root: {canonical_dir:?}"));
    }
    let sidecar_path = canonical_dir.join("server-sidecar.exe");
    if let Ok(meta) = fs::symlink_metadata(&sidecar_path) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err(format!(
                "Refusing unsafe sidecar executable {sidecar_path:?}"
            ));
        }
        if meta.len() == embedded.len() as u64
            && fs::read(&sidecar_path).is_ok_and(|bytes| bytes == embedded)
        {
            return Ok(sidecar_path);
        }
    }
    let seq = SIDECAR_TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let temp_path = canonical_dir.join(format!(".server-sidecar-{}-{seq}.tmp", std::process::id()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|e| format!("Stage sidecar {temp_path:?}: {e}"))?;
    let result = file.write_all(embedded).and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|()| fs::rename(&temp_path, &sidecar_path)) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Extract sidecar {sidecar_path:?}: {error}"));
    }
    Ok(sidecar_path)
}

#[cfg(windows)]
fn extract_embedded_sidecar() -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("FH6-HorizonTuner");
    ensure_extracted_sidecar(&root, env!("CARGO_PKG_VERSION"), EMBEDDED_SIDECAR)
}

#[cfg(windows)]
fn pin_extracted_sidecar(path: &Path, embedded: &[u8]) -> Result<Vec<fs::File>, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x02000000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x00200000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

    let directory = path.parent().ok_or("Missing sidecar directory")?;
    let root = directory.parent().ok_or("Missing sidecar root")?;
    let mut guards = Vec::with_capacity(3);
    // Denying FILE_SHARE_DELETE pins both directories against rename/replacement.
    // OPEN_REPARSE_POINT makes the metadata check apply to the opened link itself.
    for directory in [root, directory] {
        let guard = fs::OpenOptions::new()
            .access_mode(0)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(directory)
            .map_err(|e| format!("Pin sidecar directory {directory:?}: {e}"))?;
        let metadata = guard.metadata().map_err(|e| e.to_string())?;
        if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(format!("Refusing unsafe sidecar directory {directory:?}"));
        }
        guards.push(guard);
    }

    // Deny writes and deletion before verifying the exact handle kept through spawn.
    let mut file = fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|e| format!("Pin sidecar executable {path:?}: {e}"))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || metadata.len() != embedded.len() as u64
    {
        return Err(format!("Refusing unsafe sidecar executable {path:?}"));
    }
    let mut bytes = Vec::with_capacity(embedded.len());
    (&mut file)
        .take(embedded.len() as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Verify pinned sidecar {path:?}: {e}"))?;
    if bytes != embedded {
        return Err(format!("Sidecar changed before launch: {path:?}"));
    }
    guards.push(file);
    Ok(guards)
}

fn resolve_portable_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut args = std::env::args().skip(1);
    while let Some(argument) = args.next() {
        if argument == "--data-dir" {
            if let Some(explicit_dir) = args.next() {
                return Ok(PathBuf::from(explicit_dir));
            }
        }
    }

    #[cfg(windows)]
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            let portable_dir = parent.to_path_buf();
            if fs::create_dir_all(&portable_dir).is_ok() {
                let probe = portable_dir.join(".fh6-write-test");
                if fs::write(&probe, b"ok").is_ok() {
                    let _ = fs::remove_file(probe);
                    return Ok(portable_dir);
                }
            }
        }
    }

    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve portable data directory: {e}"))
}

fn spawn_sidecar_output_reader<R>(reader: R, app_handle: tauri::AppHandle, is_stderr: bool)
where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().flatten() {
            if !is_stderr {
                if let Some(port) = parse_backend_ready_port(line.as_bytes()) {
                    set_backend_status(
                        &app_handle,
                        BackendStatus {
                            state: "ready".to_string(),
                            port: Some(port),
                            error: None,
                        },
                    );
                }
            }
            if is_stderr {
                eprintln!("backend err: {line}");
            } else {
                println!("backend: {line}");
            }
        }
    });
}

fn parse_backend_ready_port(line: &[u8]) -> Option<u16> {
    let line = std::str::from_utf8(line).ok()?.trim();
    let payload = line.strip_prefix("FH6_BACKEND_READY:")?;
    serde_json::from_str::<serde_json::Value>(payload)
        .ok()?
        .get("port")?
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
}

fn watch_external_backend(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let port = match std::env::var("BACKEND_PORT") {
            Ok(value) => match value.parse::<u16>() {
                Ok(port) if port > 0 => port,
                _ => {
                    fail_backend(
                        &app_handle,
                        "BACKEND_PORT must be between 1 and 65535.".into(),
                    );
                    return;
                }
            },
            Err(_) => 8001,
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if backend_is_ready(port) {
                set_backend_status(
                    &app_handle,
                    BackendStatus {
                        state: "ready".into(),
                        port: Some(port),
                        error: None,
                    },
                );
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        fail_backend(
            &app_handle,
            format!("No responsive external backend at HTTP {port}. Start the Rust backend first; see docs/guides/development.md."),
        );
    });
}

fn fail_backend(app_handle: &tauri::AppHandle, error: String) {
    eprintln!("{error}");
    set_backend_status(
        app_handle,
        BackendStatus {
            state: "failed".into(),
            port: None,
            error: Some(error),
        },
    );
}

fn backend_command(app_handle: &tauri::AppHandle) -> Result<(Command, Vec<fs::File>), String> {
    if cfg!(debug_assertions) {
        println!("Starting independent Rust development backend.");
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .ok_or("Cannot resolve the development checkout")?
            .to_path_buf();
        let backend = root
            .join("backend-rust/target/debug")
            .join(if cfg!(windows) {
                "server-sidecar.exe"
            } else {
                "server-sidecar"
            });
        if !backend.is_file() {
            return Err(
                "Rust backend is missing. Run pnpm -C frontend run build:backend first.".into(),
            );
        }
        let mut command = Command::new(backend);
        command
            .current_dir(&root)
            .args(["--dev", "--data-dir"])
            .arg(root.join("backend"));
        auto_tune_bundle::configure_backend(
            app_handle,
            &root.join("backend/auto-tune"),
            &mut command,
        );
        Ok((command, Vec::new()))
    } else {
        println!("Starting packaged release backend.");
        let data_dir = resolve_portable_data_dir(app_handle)?;
        fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
        #[cfg(windows)]
        let backend = extract_embedded_sidecar()?;
        #[cfg(windows)]
        let guards = pin_extracted_sidecar(&backend, EMBEDDED_SIDECAR)?;
        #[cfg(not(windows))]
        let guards = Vec::new();
        #[cfg(not(windows))]
        let backend = app_handle
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("sidecar/server-sidecar");
        let mut command = Command::new(backend);
        command.arg("--data-dir").arg(&data_dir);
        auto_tune_bundle::configure_backend(app_handle, &data_dir.join("auto-tune"), &mut command);
        Ok((command, guards))
    }
}

fn start_owned_backend(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let (mut command, executable_guards) = backend_command(app_handle)?;
    if cfg!(windows) && app_handle.config().identifier == "com.eddie772tw.frontend" {
        command.arg("--companion-supported");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!("Cannot start backend: {error}. Run setup_dev.bat if developing.")
        })?;
    drop(executable_guards);
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let owned_id = child.id();
    *app_handle
        .state::<BackendProcess>()
        .0
        .lock()
        .map_err(|error| error.to_string())? = Some(child);
    if let Some(stdout) = stdout {
        spawn_sidecar_output_reader(stdout, app_handle.clone(), false);
    }
    if let Some(stderr) = stderr {
        spawn_sidecar_output_reader(stderr, app_handle.clone(), true);
    }
    let app_handle = app_handle.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            // Release the process lock before shutdown or status updates.
            let exit = {
                let process_state = app_handle.state::<BackendProcess>();
                let Ok(mut process) = process_state.0.lock() else {
                    return;
                };
                let Some(child) = process.as_mut() else {
                    return;
                };
                if child.id() != owned_id {
                    return;
                }
                child.try_wait()
            };
            match exit {
                Ok(Some(status)) => {
                    fail_backend(&app_handle, format!("Backend exited ({status}). Check terminal output or backend.log; close any existing backend before retrying."));
                    return;
                }
                Err(error) => {
                    fail_backend(&app_handle, format!("Cannot monitor backend: {error}"));
                    return;
                }
                Ok(None) => {}
            }
            let starting = app_handle
                .state::<BackendState>()
                .0
                .lock()
                .map(|status| status.state == "starting")
                .unwrap_or(false);
            if starting && Instant::now() >= deadline {
                fail_backend(
                    &app_handle,
                    "Backend startup timed out. Check terminal output or backend.log.".into(),
                );
                let _ = stop_backend_process(&app_handle);
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
    Ok(())
}

/// Restrict desktop lifecycle, HUD, and updater IPC commands to `"main"`.
fn require_main_window_label(label: &str) -> Result<(), String> {
    if label != "main" {
        return Err("This command requires the main application window.".into());
    }
    Ok(())
}

fn require_main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    require_main_window_label(window.label())
}

fn require_main_app_handle(window: &tauri::WebviewWindow) -> Result<tauri::AppHandle, String> {
    require_main_window(window)?;
    Ok(window.app_handle().clone())
}

#[tauri::command]
fn get_backend_port(
    caller: tauri::WebviewWindow,
    state: tauri::State<'_, BackendState>,
) -> Result<u16, String> {
    require_main_window(&caller)?;
    backend_port_from_state(&state)
}

fn backend_port_from_state(state: &BackendState) -> Result<u16, String> {
    let status = state
        .0
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    status.port.ok_or_else(|| {
        status
            .error
            .clone()
            .unwrap_or_else(|| "Backend is still starting".to_string())
    })
}

fn backend_port_from_app(app_handle: &tauri::AppHandle) -> Result<u16, String> {
    backend_port_from_state(&app_handle.state::<BackendState>())
}

fn backend_is_ready(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };

    let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
    let _ = stream.set_read_timeout(Some(Duration::from_millis(750)));
    if stream
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = [0u8; 128];
    let Ok(bytes_read) = stream.read(&mut response) else {
        return false;
    };
    let response = &response[..bytes_read];
    response.starts_with(b"HTTP/1.0 200") || response.starts_with(b"HTTP/1.1 200")
}

fn hud_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/hud/index.html")
}

fn show_overlay_at_port(window: &tauri::WebviewWindow, port: u16) -> Result<(), String> {
    let url = format!("{}?t={}", hud_url(port), now_millis());
    let parsed_url = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    window.navigate(parsed_url).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[tauri::command]
fn get_backend_status(
    caller: tauri::WebviewWindow,
    state: tauri::State<'_, BackendState>,
) -> Result<BackendStatus, String> {
    require_main_window(&caller)?;
    state
        .0
        .lock()
        .map(|status| status.clone())
        .map_err(|_| "Backend state lock poisoned".to_string())
}

use tauri::Manager;

#[tauri::command]
fn set_hud_click_through(caller: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn get_hud_window_visible(caller: tauri::WebviewWindow) -> Result<bool, String> {
    let app_handle = require_main_app_handle(&caller)?;
    match app_handle.get_webview_window("overlay") {
        Some(window) => window.is_visible().map_err(|error| error.to_string()),
        None => Ok(false),
    }
}

#[tauri::command]
fn toggle_hud_window(caller: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    if let Some(window) = app_handle.get_webview_window("overlay") {
        if visible {
            let port = backend_port_from_app(&app_handle)?;
            show_overlay_at_port(&window, port)?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
            let blank_url = tauri::Url::parse("about:blank").map_err(|e| e.to_string())?;
            let _ = window.navigate(blank_url);
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn reload_hud_window(caller: tauri::WebviewWindow) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    if let Some(window) = app_handle.get_webview_window("overlay") {
        let port = backend_port_from_app(&app_handle)?;
        let url = format!("{}?t={}", hud_url(port), now_millis());
        let parsed_url = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
        let blank_url = tauri::Url::parse("about:blank").map_err(|e| e.to_string())?;

        let _ = window.navigate(blank_url);
        std::thread::sleep(std::time::Duration::from_millis(50));
        window.navigate(parsed_url).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

/*
// Hotkey listener structure reserved for future extension
// Currently commented out as per requirement:
// fn setup_global_hotkeys(app: &tauri::App) {
//     // Ctrl+L: toggle click-through
//     // Ctrl+S: save window position
//     // Ctrl+R: reset rev limiter learning
// }
 */

#[derive(serde::Serialize)]
struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    is_primary: bool,
}

#[tauri::command]
fn get_available_monitors(caller: tauri::WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let app_handle = require_main_app_handle(&caller)?;
    let monitors = app_handle.available_monitors().map_err(|e| e.to_string())?;
    let primary = app_handle.primary_monitor().ok().flatten();

    let mut list = Vec::new();
    for (idx, m) in monitors.into_iter().enumerate() {
        let name = m
            .name()
            .cloned()
            .unwrap_or_else(|| format!("Display {}", idx + 1));
        let size = m.size();
        let pos = m.position();
        let is_primary = primary
            .as_ref()
            .map(|p| p.name() == m.name())
            .unwrap_or(idx == 0);

        list.push(MonitorInfo {
            name,
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            is_primary,
        });
    }
    Ok(list)
}

#[tauri::command]
fn move_hud_to_monitor(
    caller: tauri::WebviewWindow,
    monitor_x: i32,
    monitor_y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window
            .set_position(tauri::PhysicalPosition::new(monitor_x, monitor_y))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn stop_backend_for_update(caller: tauri::WebviewWindow) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    stop_backend_process(&app_handle)?;
    set_backend_status(
        &app_handle,
        BackendStatus {
            state: "updating".into(),
            port: None,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command]
fn resume_backend_after_failed_update(caller: tauri::WebviewWindow) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    set_backend_status(
        &app_handle,
        BackendStatus {
            state: "starting".into(),
            port: None,
            error: None,
        },
    );
    if std::env::args().any(|arg| arg == "--no-sidecar") || std::env::var("FH6_NO_SIDECAR").is_ok()
    {
        watch_external_backend(app_handle);
        Ok(())
    } else {
        start_owned_backend(&app_handle)
            .inspect_err(|error| fail_backend(&app_handle, error.clone()))
    }
}

#[tauri::command]
fn prepare_update_and_restart(caller: tauri::WebviewWindow) -> Result<(), String> {
    let app_handle = require_main_app_handle(&caller)?;
    println!("Preparing for OTA update restart: stopping backend sidecar and terminating background processes.");
    stop_backend_process(&app_handle)?;
    std::thread::sleep(Duration::from_millis(300));
    app_handle.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(code) = auto_tune_bundle::verification_cli() {
        std::process::exit(code);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(BackendState::new())
        .manage(BackendProcess::default())
        .manage(auto_tune_bundle::RuntimeGuards::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                let label = window.label();
                let app_handle = window.app_handle();
                if label == "main" {
                                    println!("Primary window [{label}] closed — terminating all windows and backend sidecar.");
                    if let Err(error) = stop_backend_process(&app_handle) { eprintln!("{error}"); }
                    app_handle.exit(0);
                }
            }
        })
        .setup(|app| {
            #[cfg(not(windows))]
            app.handle().plugin(tauri_plugin_dialog::init())?;
            #[cfg(windows)]
            #[allow(unused_variables)]
            let overlay_window = tauri::WebviewWindowBuilder::new(
                app,
                "overlay",
                tauri::WebviewUrl::External(
                    tauri::Url::parse("about:blank").expect("about:blank must be a valid URL"),
                ),
            )
            .title("Horizon Tuner HUD")
            .inner_size(1920.0, 1080.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .shadow(false)
            .visible(false)
            .build()
            .expect("failed to build overlay window");
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT, WS_EX_LAYERED
                };
                use windows::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
                use windows::Win32::UI::Controls::MARGINS;

                // Configure Windows DWM transparent client margins and layered click-through styles.
                // Preserves hardware acceleration and DWM compositing for high-refresh overlays.
                if let Ok(hwnd_val) = overlay_window.hwnd() {
                    let hwnd = HWND(hwnd_val.0 as _);
                    unsafe {
                        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                        ex_style |= WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0;
                        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style as _);

                        let margins = MARGINS { cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1 };
                        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
                    }
                }
            }



            let external_backend = std::env::args().any(|arg| arg == "--no-sidecar")
                || std::env::var("FH6_NO_SIDECAR").is_ok();
            if external_backend {
                println!("Connecting to explicitly selected external backend.");
                watch_external_backend(app.handle().clone());
            } else if let Err(error) = start_owned_backend(app.handle()) {
                fail_backend(app.handle(), error);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_export::save_export_file,
            get_backend_port,
            get_backend_status,
            set_hud_click_through,
            get_hud_window_visible,
            toggle_hud_window,
            reload_hud_window,
            get_available_monitors,
            move_hud_to_monitor,
            stop_backend_for_update,
            resume_backend_after_failed_update,
            prepare_update_and_restart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        backend_is_ready, backend_port_from_state, ensure_extracted_sidecar, hud_url,
        require_main_window_label, BackendState,
    };
    use std::fs;
    use std::io::Write;
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn overlay_url_uses_the_published_backend_port() {
        assert_eq!(hud_url(8123), "http://127.0.0.1:8123/hud/index.html");
    }

    #[test]
    fn main_window_guard_rejects_overlay_and_untrusted_labels() {
        assert!(require_main_window_label("main").is_ok());
        for label in ["overlay", "", "MAIN", "main-2"] {
            assert!(require_main_window_label(label).is_err(), "{label:?}");
        }
    }

    #[test]
    fn compiled_acl_isolates_overlay_and_remote_origins_from_privileged_capabilities() {
        let mut context: tauri::Context = tauri::generate_context!();
        let authority = context.runtime_authority_mut();
        let local = tauri::ipc::Origin::Local;
        let remote_hud = tauri::ipc::Origin::Remote {
            url: tauri::Url::parse("http://127.0.0.1:8001/hud/index.html").unwrap(),
        };
        let remote_custom = tauri::ipc::Origin::Remote {
            url: tauri::Url::parse("http://localhost:8001/hud_user/custom/index.html").unwrap(),
        };
        for command in [
            "plugin:updater|check",
            "plugin:updater|download",
            "plugin:updater|install",
            "plugin:process|restart",
            "plugin:process|exit",
            "plugin:window|close",
            "plugin:window|set_ignore_cursor_events",
        ] {
            for origin in [&local, &remote_hud, &remote_custom] {
                assert!(
                    authority
                        .resolve_access(command, "overlay", "overlay", origin)
                        .is_none(),
                    "overlay must be denied {command} on {origin}"
                );
            }
            for origin in [&remote_hud, &remote_custom] {
                assert!(
                    authority
                        .resolve_access(command, "main", "main", origin)
                        .is_none(),
                    "main must be denied {command} on {origin}"
                );
            }
        }
        for command in [
            "plugin:updater|check",
            "plugin:process|restart",
            "plugin:window|close",
        ] {
            assert!(authority
                .resolve_access(command, "main", "main", &local)
                .is_some());
        }
    }

    #[test]
    fn backend_port_requires_ready_status() {
        let state = BackendState::new();
        assert_eq!(
            backend_port_from_state(&state).unwrap_err(),
            "Backend is still starting"
        );
    }

    #[test]
    fn readiness_requires_an_http_200_response() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let port = listener
            .local_addr()
            .expect("read test listener address")
            .port();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept readiness probe");
            let mut request = [0u8; 128];
            let _ = std::io::Read::read(&mut stream, &mut request);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
                .expect("write readiness response");
        });
        assert!(backend_is_ready(port));
    }

    #[test]
    fn sidecar_extraction_verifies_full_bytes_and_rejects_unsafe_targets() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("fh6-sidecar-test-{}-{nonce}", std::process::id()));
        let payload = b"MZ-verified-sidecar-bytes";
        assert!(ensure_extracted_sidecar(&root, "1.0.0", b"").is_err());

        let extracted = ensure_extracted_sidecar(&root, "1.0.0", payload).unwrap();
        assert_eq!(fs::read(&extracted).unwrap(), payload);

        // Same-length tampering must be detected and replaced rather than executed.
        let tampered = b"MZ-TAMPERED-sidecar-bytes";
        assert_eq!(tampered.len(), payload.len());
        fs::write(&extracted, tampered).unwrap();
        let re_extracted = ensure_extracted_sidecar(&root, "1.0.0", payload).unwrap();
        assert_eq!(fs::read(&re_extracted).unwrap(), payload);

        // Non-file target at executable path (directory collision) must fail securely.
        fs::remove_file(&re_extracted).unwrap();
        fs::create_dir(&re_extracted).unwrap();
        assert!(ensure_extracted_sidecar(&root, "1.0.0", payload).is_err());

        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn pinned_sidecar_cannot_be_modified_or_redirected_before_spawn() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "fh6-sidecar-pinned-test-{}-{nonce}",
            std::process::id()
        ));
        let payload = b"MZ-verified-sidecar-bytes";
        let path = ensure_extracted_sidecar(&root, "1.0.0", payload).unwrap();
        let guards = super::pin_extracted_sidecar(&path, payload).unwrap();
        assert!(fs::write(&path, b"tampered").is_err());
        assert!(fs::remove_file(&path).is_err());
        assert!(fs::rename(&path, path.with_extension("old")).is_err());
        assert!(fs::rename(path.parent().unwrap(), root.join("moved-version")).is_err());
        assert!(fs::rename(&root, root.with_extension("moved")).is_err());
        assert_eq!(fs::read(&path).unwrap(), payload);
        drop(guards);

        // A swap between extraction and pinning must fail the handle-based recheck.
        fs::write(&path, b"MZ-TAMPERED-sidecar-bytes").unwrap();
        assert!(super::pin_extracted_sidecar(&path, payload).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn pinned_verified_executable_can_be_spawned() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "fh6-sidecar-launch-test-{}-{nonce}",
            std::process::id()
        ));
        let system_root = std::env::var_os("SystemRoot").unwrap();
        let payload =
            fs::read(std::path::PathBuf::from(system_root).join("System32/cmd.exe")).unwrap();
        let path = ensure_extracted_sidecar(&root, "1.0.0", &payload).unwrap();
        let guards = super::pin_extracted_sidecar(&path, &payload).unwrap();
        let mut child = std::process::Command::new(&path)
            .args(["/D", "/C", "exit", "0"])
            .spawn()
            .unwrap();
        drop(guards);
        assert!(child.wait().unwrap().success());
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn sidecar_extraction_rejects_links_without_touching_their_targets() {
        use std::os::unix::fs::symlink;

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "fh6-sidecar-links-test-{}-{nonce}",
            std::process::id()
        ));
        let outside = base.join("outside");
        fs::create_dir_all(&outside).unwrap();
        let root = base.join("root");
        let payload = b"MZ-verified-sidecar-bytes";
        symlink(&outside, &root).unwrap();
        assert!(ensure_extracted_sidecar(&root, "1.0.0", payload).is_err());
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        fs::remove_file(&root).unwrap();

        fs::create_dir(&root).unwrap();
        let version_dir = root.join(format!("sidecar-1.0.0-{}", payload.len()));
        symlink(&outside, &version_dir).unwrap();
        assert!(ensure_extracted_sidecar(&root, "1.0.0", payload).is_err());
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        fs::remove_file(&version_dir).unwrap();

        fs::create_dir(&version_dir).unwrap();
        let outside_file = outside.join("untouched.exe");
        fs::write(&outside_file, payload).unwrap();
        let executable = version_dir.join("server-sidecar.exe");
        // Even a symlink to the exact trusted bytes must be refused.
        symlink(&outside_file, &executable).unwrap();
        assert!(ensure_extracted_sidecar(&root, "1.0.0", payload).is_err());
        assert_eq!(fs::read(&outside_file).unwrap(), payload);
        fs::remove_file(&executable).unwrap();

        let missing_target = outside.join("missing.exe");
        symlink(&missing_target, &executable).unwrap();
        assert!(ensure_extracted_sidecar(&root, "1.0.0", payload).is_err());
        assert!(!missing_target.exists());
        fs::remove_dir_all(&base).unwrap();
    }
}
