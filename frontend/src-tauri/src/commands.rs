use crate::storage;
use serde_json::Value;

#[tauri::command]
pub fn get_car_database() -> Result<Value, String> {
    storage::read_car_database()
}

#[tauri::command]
pub fn get_car_params(car_id: String) -> Result<Value, String> {
    let filename = format!("{}.json", car_id);
    storage::read_json_file("car_params", &filename)
}

#[tauri::command]
pub fn save_car_params(car_id: String, params: Value) -> Result<(), String> {
    let filename = format!("{}.json", car_id);
    storage::write_json_file("car_params", &filename, &params)
}

#[tauri::command]
pub fn delete_dyno_curve(car_id: String) -> Result<(), String> {
    let filename = format!("{}.json", car_id);
    let mut params = storage::read_json_file("car_params", &filename)?;
    if let Some(obj) = params.as_object_mut() {
        obj.remove("dyno_curve");
        storage::write_json_file("car_params", &filename, &params)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings() -> Result<Value, String> {
    storage::read_json_file("", "settings.json")
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Result<(), String> {
    storage::write_json_file("", "settings.json", &settings)
}

#[tauri::command]
pub fn get_tunings() -> Result<Vec<String>, String> {
    storage::list_json_files("tunings")
}

#[tauri::command]
pub fn get_tuning_record(car_id: String, save_name: String) -> Result<Value, String> {
    let filename = format!("{}_{}.json", car_id, save_name);
    storage::read_json_file("tunings", &filename)
}

#[tauri::command]
pub fn save_tuning_record(car_id: String, save_name: String, data: Value) -> Result<(), String> {
    let filename = format!("{}_{}.json", car_id, save_name);
    storage::write_json_file("tunings", &filename, &data)
}

#[tauri::command]
pub fn get_analysis_sessions() -> Result<Vec<String>, String> {
    storage::list_json_files("sessions")
}

#[tauri::command]
pub fn get_analysis_session(filename: String) -> Result<Value, String> {
    storage::read_json_file("sessions", &filename)
}

#[tauri::command]
pub fn save_analysis_session(filename: String, data: Value) -> Result<(), String> {
    storage::write_json_file("sessions", &filename, &data)
}

#[tauri::command]
pub fn delete_analysis_session(filename: String) -> Result<(), String> {
    storage::delete_json_file("sessions", &filename)
}

#[tauri::command]
pub fn get_drag_sessions() -> Result<Vec<String>, String> {
    storage::list_json_files("drag_sessions")
}

#[tauri::command]
pub fn get_drag_session(filename: String) -> Result<Value, String> {
    storage::read_json_file("drag_sessions", &filename)
}

#[tauri::command]
pub fn save_drag_session(filename: String, data: Value) -> Result<(), String> {
    storage::write_json_file("drag_sessions", &filename, &data)
}

#[tauri::command]
pub fn delete_drag_session(filename: String) -> Result<(), String> {
    storage::delete_json_file("drag_sessions", &filename)
}

#[tauri::command]
pub fn get_overlay_config() -> Result<Value, String> {
    storage::read_json_file("", "hud_config.json")
}

#[tauri::command]
pub fn save_overlay_config(config: Value) -> Result<(), String> {
    storage::write_json_file("", "hud_config.json", &config)
}

#[tauri::command]
pub fn get_overlay_layout() -> Result<Value, String> {
    storage::read_json_file("", "layout.json")
}

#[tauri::command]
pub fn save_overlay_layout(layout: Value) -> Result<(), String> {
    storage::write_json_file("", "layout.json", &layout)
}
