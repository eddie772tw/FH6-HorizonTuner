// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(all(target_os = "windows", target_arch = "x86_64", not(debug_assertions)))]
const EMBEDDED_SIDECAR: &[u8] = include_bytes!("../bin/server-sidecar-x86_64-pc-windows-msvc.exe");

#[cfg(not(all(target_os = "windows", target_arch = "x86_64", not(debug_assertions))))]
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

fn stop_backend_process(app_handle: &tauri::AppHandle) {
    if let Ok(mut process) = app_handle.state::<BackendProcess>().0.lock() {
        if let Some(mut child) = process.take() {
            // Closing stdin is the sidecar's graceful shutdown signal. This is
            // important for the Python cleanup path and releases the UDP
            // listener before we resort to forceful termination.
            drop(child.stdin.take());

            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                match child.try_wait() {
                    Ok(Some(_)) => return,
                    Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }

            // PyInstaller one-file executables have a bootloader process and
            // a worker process with the same executable path. Killing only
            // Child's PID can leave the worker behind and keep UDP 8000 open.
            #[cfg(target_os = "windows")]
            {
                let pid = child.id().to_string();
                let _ = Command::new("taskkill")
                    .args(["/PID", pid.as_str(), "/T", "/F"])
                    .status();
                // taskkill owns termination of the PyInstaller process tree.
                // Do not call Child::wait here: the bootloader/worker handle
                // can remain signalled asynchronously and block the Tauri
                // close-request handler indefinitely.
                let _ = child.try_wait();
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn extract_embedded_sidecar() -> Result<PathBuf, String> {
    if EMBEDDED_SIDECAR.is_empty() {
        return Err("No embedded Windows x64 sidecar is available for this build.".to_string());
    }

    let sidecar_dir = std::env::temp_dir().join("FH6-HorizonTuner").join(format!(
        "sidecar-{}-{}",
        env!("CARGO_PKG_VERSION"),
        EMBEDDED_SIDECAR.len()
    ));
    let sidecar_path = sidecar_dir.join("server-sidecar.exe");
    fs::create_dir_all(&sidecar_dir).map_err(|e| {
        format!(
            "Failed to create sidecar extraction directory {:?}: {}",
            sidecar_dir, e
        )
    })?;

    let needs_write = fs::metadata(&sidecar_path)
        .map(|metadata| metadata.len() != EMBEDDED_SIDECAR.len() as u64)
        .unwrap_or(true);
    if needs_write {
        fs::write(&sidecar_path, EMBEDDED_SIDECAR).map_err(|e| {
            format!(
                "Failed to extract embedded sidecar to {:?}: {}",
                sidecar_path, e
            )
        })?;
    }

    Ok(sidecar_path)
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
            format!("No responsive external backend at HTTP {port}. Start backend/main.py first; see docs/guides/development.md."),
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

fn backend_command(app_handle: &tauri::AppHandle) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        println!("Starting development backend from Python source (no sidecar EXE).");
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .ok_or("Cannot resolve the development checkout")?
            .to_path_buf();
        let python = root.join(".venv").join(if cfg!(windows) {
            "Scripts/python.exe"
        } else {
            "bin/python"
        });
        if !python.is_file() {
            return Err("Python environment is missing. Run setup_dev.bat first.".into());
        }
        let mut command = Command::new("uv");
        command
            .current_dir(&root)
            .args(["run", "--offline", "--no-project", "--python"])
            .arg(python)
            .args(["python", "-u"])
            .arg(root.join("backend/main.py"))
            .args(["--dev", "--data-dir"])
            .arg(root.join("backend"));
        Ok(command)
    } else {
        println!("Starting embedded release backend.");
        let data_dir = resolve_portable_data_dir(app_handle)?;
        fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
        let mut command = Command::new(extract_embedded_sidecar()?);
        command.arg("--data-dir").arg(data_dir);
        Ok(command)
    }
}

fn start_owned_backend(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let mut command = backend_command(app_handle)?;
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
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
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
                stop_backend_process(&app_handle);
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_backend_port(state: tauri::State<'_, BackendState>) -> Result<u16, String> {
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
        .write_all(
            b"GET /api/overlay/config HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
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
fn get_backend_status(state: tauri::State<'_, BackendState>) -> Result<BackendStatus, String> {
    state
        .0
        .lock()
        .map(|status| status.clone())
        .map_err(|_| "Backend state lock poisoned".to_string())
}

use tauri::Manager;

#[tauri::command]
fn set_hud_click_through(app_handle: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn toggle_hud_window(app_handle: tauri::AppHandle, visible: bool) -> Result<(), String> {
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
fn reload_hud_window(app_handle: tauri::AppHandle) -> Result<(), String> {
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
fn get_available_monitors(app_handle: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
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
    app_handle: tauri::AppHandle,
    monitor_x: i32,
    monitor_y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
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
fn prepare_update_and_restart(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("Preparing for OTA update restart: stopping backend sidecar and terminating background processes.");
    stop_backend_process(&app_handle);
    std::thread::sleep(Duration::from_millis(300));
    app_handle.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(BackendState::new())
        .manage(BackendProcess::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                let label = window.label();
                let app_handle = window.app_handle();
                if label == "main" {
                    println!("Primary window [{label}] closed — terminating all windows and backend sidecar.");
                    stop_backend_process(&app_handle);
                    app_handle.exit(0);
                }
            }
        })
        .setup(|app| {
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
            greet,
            get_backend_port,
            get_backend_status,
            set_hud_click_through,
            toggle_hud_window,
            reload_hud_window,
            get_available_monitors,
            move_hud_to_monitor,
            prepare_update_and_restart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{backend_is_ready, backend_port_from_state, hud_url, BackendState};
    use std::io::Write;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn overlay_url_uses_the_published_backend_port() {
        assert_eq!(hud_url(8123), "http://127.0.0.1:8123/hud/index.html");
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
}
