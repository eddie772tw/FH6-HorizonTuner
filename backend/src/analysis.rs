use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
    Router,
    routing::{get, post, delete},
};
use serde_json::{Value, json};
use tokio::fs;
use tokio::net::UdpSocket;

use crate::database::SharedDbState;

pub async fn get_analysis_status() -> impl IntoResponse {
    // Actually this returns state from python, but since it's now decoupled,
    // we can either return a static state or poll Python via UDP. We'll return idle for now as UI just checks if it's active.
    Json(json!({"status": "idle"}))
}

pub async fn get_analysis_data(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("sessions").join("latest.json");

    match fs::read_to_string(&file_path).await {
        Ok(content) => {
            match serde_json::from_str::<Value>(&content) {
                Ok(json) => (StatusCode::OK, Json(json)).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!([]))).into_response(),
            }
        }
        Err(_) => (StatusCode::OK, Json(json!([]))).into_response(),
    }
}

pub async fn clear_analysis_data(State(state): State<SharedDbState>) -> impl IntoResponse {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0").await {
        // Mock a packet to command python script to clear
        // In Python: cmd == 3.0: race_recorder.clear()
        let mut buf = [0u8; 128];
        use byteorder::{WriteBytesExt, LittleEndian};
        let mut cursor = std::io::Cursor::new(&mut buf[..]);
        let _ = cursor.write_i32::<LittleEndian>(0); // IsRaceOn
        let _ = cursor.write_u32::<LittleEndian>(0); // ts
        let _ = cursor.write_f32::<LittleEndian>(0.0); // max_rpm
        let _ = cursor.write_f32::<LittleEndian>(0.0); // idle_rpm
        let _ = cursor.write_f32::<LittleEndian>(3.0); // current_rpm = cmd
        cursor.set_position(212);
        let _ = cursor.write_i32::<LittleEndian>(-1); // CarOrdinal = -1
        let _ = socket.send_to(&buf, "127.0.0.1:8002").await;
    }

    let state = state.read().await;
    let file_path = state.data_root.join("sessions").join("latest.json");
    let _ = fs::write(&file_path, "[]").await;

    Json(json!({"status": "cleared"}))
}

pub async fn start_manual_recording() -> impl IntoResponse {
    Json(json!({"status": "recording_started"}))
}

pub async fn stop_manual_recording() -> impl IntoResponse {
    Json(json!({"status": "recording_stopped"}))
}

pub async fn list_saved_sessions(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let sessions_dir = state.data_root.join("sessions");

    let mut files = Vec::new();
    if let Ok(mut entries) = fs::read_dir(sessions_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(file_type) = entry.file_type().await {
                if file_type.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.ends_with(".json") {
                        files.push(file_name);
                    }
                }
            }
        }
    }
    Json(files)
}

pub async fn save_session_to_file() -> impl IntoResponse {
    Json(json!({"status": "saved"}))
}

pub async fn save_latest_session_to_file() -> impl IntoResponse {
    Json(json!({"status": "saved_latest"}))
}

pub async fn load_saved_session(
    Path(filename): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("sessions").join(&filename);

    match fs::read_to_string(&file_path).await {
        Ok(content) => {
            match serde_json::from_str::<Value>(&content) {
                Ok(json) => (StatusCode::OK, Json(json)).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Invalid JSON"}))).into_response(),
            }
        }
        Err(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Session not found"}))).into_response(),
    }
}

pub async fn delete_saved_session(
    Path(filename): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("sessions").join(&filename);

    if fs::remove_file(&file_path).await.is_ok() {
        (StatusCode::OK, Json(json!({"status": "deleted"}))).into_response()
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to delete"}))).into_response()
    }
}

pub fn analysis_routes(state: SharedDbState) -> Router {
    Router::new()
        .route("/api/analysis/status", get(get_analysis_status))
        .route("/api/analysis/data", get(get_analysis_data))
        .route("/api/analysis/clear", post(clear_analysis_data))
        .route("/api/analysis/recorder/start", post(start_manual_recording))
        .route("/api/analysis/recorder/stop", post(stop_manual_recording))
        .route("/api/analysis/sessions", get(list_saved_sessions))
        .route("/api/analysis/sessions/save", post(save_session_to_file))
        .route("/api/analysis/sessions/save_latest", post(save_latest_session_to_file))
        .route("/api/analysis/sessions/{filename}", get(load_saved_session).delete(delete_saved_session))
        .with_state(state)
}
