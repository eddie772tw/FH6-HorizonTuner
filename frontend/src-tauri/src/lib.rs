// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::Serialize;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize)]
struct BackendStatus {
    state: String,
    port: Option<u16>,
    error: Option<String>,
}

struct BackendState(Mutex<BackendStatus>);

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

fn parse_backend_ready_port(line: &[u8]) -> Option<u16> {
    let line = std::str::from_utf8(line).ok()?.trim();
    let payload = line.strip_prefix("FH6_BACKEND_READY:")?;
    serde_json::from_str::<serde_json::Value>(payload)
        .ok()?
        .get("port")?
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
}

fn find_external_backend_port_file() -> Option<PathBuf> {
    let mut bases = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        bases.push(current_dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            bases.push(parent.to_path_buf());
        }
    }

    for base in bases {
        let mut directory = Some(base.as_path());
        while let Some(dir) = directory {
            for candidate in [
                dir.join("backend").join("logs").join("web_port.txt"),
                dir.join("logs").join("web_port.txt"),
            ] {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
            directory = dir.parent();
        }
    }
    None
}

fn watch_external_backend(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        for _ in 0..600 {
            if let Some(port_file) = find_external_backend_port_file() {
                if let Ok(contents) = fs::read_to_string(port_file) {
                    if let Ok(port) = contents.trim().parse::<u16>() {
                        set_backend_status(&app_handle, BackendStatus {
                            state: "ready".to_string(),
                            port: Some(port),
                            error: None,
                        });
                        return;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        set_backend_status(&app_handle, BackendStatus {
            state: "failed".to_string(),
            port: None,
            error: Some("Could not find the externally started development backend port.".to_string()),
        });
    });
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
    let status = state.0.lock().map_err(|_| "Backend state lock poisoned".to_string())?;
    status.port.ok_or_else(|| status.error.clone().unwrap_or_else(|| {
        "Backend is still starting".to_string()
    }))
}

fn backend_port_from_app(app_handle: &tauri::AppHandle) -> Result<u16, String> {
    backend_port_from_state(&app_handle.state::<BackendState>())
}

#[tauri::command]
fn get_backend_status(state: tauri::State<'_, BackendState>) -> Result<BackendStatus, String> {
    state.0.lock()
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
            let port = backend_port_from_app(&app_handle).unwrap_or(8001);
            let url = format!("http://127.0.0.1:{}/hud/index.html", port);
            let _ = window.eval(&format!(
                "if (!window.location.href.includes('127.0.0.1:{}')) window.location.href = '{}';",
                port, url
            ));
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
            let _ = window.eval("window.location.href = 'about:blank';");
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}


#[tauri::command]
fn reload_hud_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        let port = backend_port_from_app(&app_handle).unwrap_or(8001);
        let url = format!("http://127.0.0.1:{}/hud/index.html", port);

        let _ = window.eval("window.location.href = 'about:blank';");
        std::thread::sleep(std::time::Duration::from_millis(50));
        let _ = window.eval(&format!("window.location.href = '{}';", url));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                    println!("Main window closed/destroyed — terminating all windows and backend sidecar.");
                    window.app_handle().exit(0);
                }
            }
        })
        .setup(|app| {
            #[allow(unused_variables)]
            let overlay_window = tauri::WebviewWindowBuilder::new(
                app,
                "overlay",
                tauri::WebviewUrl::App("about:blank".into())
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



            let args: Vec<String> = std::env::args().collect();
            let external_backend = cfg!(debug_assertions)
                || args.contains(&"--no-sidecar".to_string())
                || std::env::var("FH6_NO_SIDECAR").is_ok();
            if external_backend {
                println!("Using externally started backend (debug/no-sidecar mode).");
                if let Ok(port_str) = std::env::var("BACKEND_PORT") {
                    if let Ok(port) = port_str.parse::<u16>() {
                        set_backend_status(app.handle(), BackendStatus {
                            state: "ready".to_string(),
                            port: Some(port),
                            error: None,
                        });
                        return Ok(());
                    }
                }
                watch_external_backend(app.handle().clone());
                return Ok(());
            }

            let data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to resolve application data directory: {e}"))?;
            fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create application data directory: {e}"))?;
            let ready_file = data_dir.join("logs").join("web_port.txt");
            // A previous process' port is never valid for a newly spawned sidecar.
            let _ = fs::remove_file(&ready_file);
            let data_dir = data_dir.to_string_lossy().into_owned();

            match app.shell().sidecar("bin/server-sidecar") {
                Ok(sidecar_command) => {
                    let sidecar_with_args = sidecar_command.args(["--data-dir", &data_dir]);
                    match sidecar_with_args.spawn() {
                        Ok((mut rx, _child)) => {
                            println!("Sidecar process spawned successfully!");
                            let app_handle = app.handle().clone();
                            let ready_file = ready_file.clone();
                            let ready_app_handle = app.handle().clone();
                            // Windowed PyInstaller executables can expose no stdout stream on
                            // Windows. The ready file is a deterministic fallback in the same
                            // user-writable directory passed to this exact sidecar instance.
                            std::thread::spawn(move || {
                                for _ in 0..600 {
                                    if let Ok(contents) = fs::read_to_string(&ready_file) {
                                        if let Ok(port) = contents.trim().parse::<u16>() {
                                            set_backend_status(&ready_app_handle, BackendStatus {
                                                state: "ready".to_string(),
                                                port: Some(port),
                                                error: None,
                                            });
                                            return;
                                        }
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(50));
                                }
                            });
                            tauri::async_runtime::spawn(async move {
                                while let Some(event) = rx.recv().await {
                                    if let CommandEvent::Stdout(line) = event {
                                        if let Some(port) = parse_backend_ready_port(&line) {
                                            set_backend_status(&app_handle, BackendStatus {
                                                state: "ready".to_string(),
                                                port: Some(port),
                                                error: None,
                                            });
                                            println!("Backend sidecar is ready on port {port}");
                                        }
                                        println!("sidecar: {}", String::from_utf8_lossy(&line));
                                    } else if let CommandEvent::Stderr(line) = event {
                                        println!("sidecar err: {}", String::from_utf8_lossy(&line));
                                    }
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("Failed to spawn sidecar process: {:?}", e);
                            set_backend_status(app.handle(), BackendStatus {
                                state: "failed".to_string(),
                                port: None,
                                error: Some(format!("Failed to start backend sidecar: {e}")),
                            });
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to create sidecar command: {:?}", e);
                    set_backend_status(app.handle(), BackendStatus {
                        state: "failed".to_string(),
                        port: None,
                        error: Some(format!("Failed to create backend sidecar command: {e}")),
                    });
                }
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
            move_hud_to_monitor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
