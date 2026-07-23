pub mod commands;
pub mod storage;
pub mod telemetry;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!(
        "Hello, {}! You've been greeted from Pure Rust Tauri Backend!",
        name
    )
}

#[tauri::command]
fn set_hud_click_through(
    app_handle: tauri::AppHandle,
    ignore: bool,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn toggle_hud_window(
    app_handle: tauri::AppHandle,
    visible: bool,
) -> Result<(), String> {
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
fn get_available_monitors(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MonitorInfo>, String> {
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                println!("Main window CloseRequested — terminating application.");
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            println!("[Pure Rust] Initializing HorizonTuner Pure Rust Backend...");
            telemetry::spawn_telemetry_listener(app.handle().clone(), 8000);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            set_hud_click_through,
            toggle_hud_window,
            get_available_monitors,
            move_hud_to_monitor,
            // Storage Commands
            commands::get_car_database,
            commands::get_languages,
            commands::get_language,
            commands::get_car_params,
            commands::save_car_params,
            commands::delete_dyno_curve,
            commands::get_settings,
            commands::save_settings,
            commands::get_tunings,
            commands::get_tuning_record,
            commands::save_tuning_record,
            commands::get_analysis_sessions,
            commands::get_analysis_session,
            commands::save_analysis_session,
            commands::delete_analysis_session,
            commands::get_drag_sessions,
            commands::get_drag_session,
            commands::save_drag_session,
            commands::delete_drag_session,
            commands::get_overlay_config,
            commands::save_overlay_config,
            commands::get_overlay_layout,
            commands::save_overlay_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
