// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_backend_port() -> Result<u16, String> {
    if let Ok(port_str) = std::env::var("BACKEND_PORT") {
        if let Ok(port) = port_str.parse::<u16>() {
            return Ok(port);
        }
    }

    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap().to_path_buf())
        .ok();
    
    let cwd_dir = std::env::current_dir().ok();

    let mut search_dirs = Vec::new();
    if let Some(ref d) = exe_dir {
        search_dirs.push(d.clone());
    }
    if let Some(ref d) = cwd_dir {
        search_dirs.push(d.clone());
    }

    search_dirs.push(PathBuf::from("."));
    search_dirs.push(PathBuf::from(".."));
    search_dirs.push(PathBuf::from("../.."));

    for base_dir in search_dirs {
        let mut curr = Some(base_dir.as_path());
        while let Some(dir) = curr {
            let p1 = dir.join("logs").join("web_port.txt");
            if p1.exists() {
                return read_port_from_file(&p1);
            }
            let p2 = dir.join("backend").join("logs").join("web_port.txt");
            if p2.exists() {
                return read_port_from_file(&p2);
            }
            curr = dir.parent();
        }
    }

    Err("Could not find web_port.txt in any searched paths".to_string())
}

fn read_port_from_file(path: &std::path::Path) -> Result<u16, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            let port_str = content.trim();
            port_str.parse::<u16>().map_err(|e| format!("Failed to parse port '{}' from {:?}: {}", port_str, path, e))
        }
        Err(e) => Err(format!("Failed to read port file at {:?}: {}", path, e))
    }
}

use tauri::Manager;

#[tauri::command]
fn set_hud_click_through(app_handle: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn toggle_hud_window(app_handle: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        if visible {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
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
        let name = m.name().cloned().unwrap_or_else(|| format!("Display {}", idx + 1));
        let size = m.size();
        let pos = m.position();
        let is_primary = primary.as_ref().map(|p| p.name() == m.name()).unwrap_or(idx == 0);

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
fn move_hud_to_monitor(app_handle: tauri::AppHandle, monitor_x: i32, monitor_y: i32, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window.set_position(tauri::PhysicalPosition::new(monitor_x, monitor_y)).map_err(|e| e.to_string())?;
        window.set_size(tauri::PhysicalSize::new(width, height)).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--no-sidecar".to_string()) || std::env::var("FH6_NO_SIDECAR").is_ok() {
                println!("Skipping sidecar startup as --no-sidecar was passed or FH6_NO_SIDECAR env var is set.");
                return Ok(());
            }

            if let Ok(sidecar_command) = app.shell().sidecar("server-sidecar") {
                if let Ok((mut rx, child)) = sidecar_command.spawn() {
                    tauri::async_runtime::spawn(async move {
                        let _child_handle = child;
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Stdout(line) = event {
                                println!("sidecar: {}", String::from_utf8_lossy(&line));
                            } else if let CommandEvent::Stderr(line) = event {
                                println!("sidecar err: {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                } else {
                    println!("Failed to spawn sidecar, continuing without it.");
                }
            } else {
                println!("Sidecar configuration not found, continuing without it.");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_backend_port, 
            set_hud_click_through, 
            toggle_hud_window,
            get_available_monitors,
            move_hud_to_monitor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
