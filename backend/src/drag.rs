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

pub async fn drag_prepare() -> impl IntoResponse {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0").await {
        // Mock a packet to command python script to prepare drag
        // In Python: cmd == 1.0: drag_recorder.prepare()
        let mut buf = [0u8; 128];
        use byteorder::{WriteBytesExt, LittleEndian};
        let mut cursor = std::io::Cursor::new(&mut buf[..]);
        let _ = cursor.write_i32::<LittleEndian>(0); // IsRaceOn
        let _ = cursor.write_u32::<LittleEndian>(0); // ts
        let _ = cursor.write_f32::<LittleEndian>(0.0); // max_rpm
        let _ = cursor.write_f32::<LittleEndian>(0.0); // idle_rpm
        let _ = cursor.write_f32::<LittleEndian>(1.0); // current_rpm = cmd
        cursor.set_position(212);
        let _ = cursor.write_i32::<LittleEndian>(-1); // CarOrdinal = -1
        let _ = socket.send_to(&buf, "127.0.0.1:8002").await;
    }
    Json(json!({"status": "prepared"}))
}

pub async fn drag_status() -> impl IntoResponse { Json(json!({"status": "idle"})) }

pub async fn drag_data(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("drag_sessions").join("latest.json");

    match fs::read_to_string(&file_path).await {
        Ok(content) => {
            match serde_json::from_str::<Value>(&content) {
                Ok(json) => (StatusCode::OK, Json(json.get("session").cloned().unwrap_or(json!([])))).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!([]))).into_response(),
            }
        }
        Err(_) => (StatusCode::OK, Json(json!([]))).into_response(),
    }
}

pub async fn drag_analysis(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("drag_sessions").join("latest.json");

    match fs::read_to_string(&file_path).await {
        Ok(content) => {
            match serde_json::from_str::<Value>(&content) {
                Ok(json) => (StatusCode::OK, Json(json.get("analysis").cloned().unwrap_or(json!({})))).into_response(),
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({}))).into_response(),
            }
        }
        Err(_) => (StatusCode::OK, Json(json!({}))).into_response(),
    }
}

pub async fn drag_clear(State(state): State<SharedDbState>) -> impl IntoResponse {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0").await {
        // Mock a packet to command python script to clear drag
        // In Python: cmd == 2.0: drag_recorder.clear()
        let mut buf = [0u8; 128];
        use byteorder::{WriteBytesExt, LittleEndian};
        let mut cursor = std::io::Cursor::new(&mut buf[..]);
        let _ = cursor.write_i32::<LittleEndian>(0); // IsRaceOn
        let _ = cursor.write_u32::<LittleEndian>(0); // ts
        let _ = cursor.write_f32::<LittleEndian>(0.0); // max_rpm
        let _ = cursor.write_f32::<LittleEndian>(0.0); // idle_rpm
        let _ = cursor.write_f32::<LittleEndian>(2.0); // current_rpm = cmd
        cursor.set_position(212);
        let _ = cursor.write_i32::<LittleEndian>(-1); // CarOrdinal = -1
        let _ = socket.send_to(&buf, "127.0.0.1:8002").await;
    }

    let state = state.read().await;
    let file_path = state.data_root.join("drag_sessions").join("latest.json");
    let _ = fs::remove_file(&file_path).await;

    Json(json!({"status": "cleared"}))
}

pub async fn drag_save_session() -> impl IntoResponse { Json(json!({"status": "saved"})) }

pub async fn list_drag_sessions(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let sessions_dir = state.data_root.join("drag_sessions");

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

pub async fn get_drag_session(
    Path(filename): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("drag_sessions").join(&filename);

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

pub async fn delete_drag_session(
    Path(filename): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.data_root.join("drag_sessions").join(&filename);

    if fs::remove_file(&file_path).await.is_ok() {
        (StatusCode::OK, Json(json!({"status": "deleted"}))).into_response()
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to delete"}))).into_response()
    }
}

pub async fn get_logs() -> impl IntoResponse { Json(json!([])) }
pub async fn clear_logs() -> impl IntoResponse { Json(json!({"status": "cleared"})) }

pub async fn get_overlay_config() -> impl IntoResponse { Json(json!({})) }
pub async fn save_overlay_config() -> impl IntoResponse { Json(json!({"status": "saved"})) }
pub async fn get_overlay_layout() -> impl IntoResponse { Json(json!({})) }
pub async fn save_overlay_layout() -> impl IntoResponse { Json(json!({"status": "saved"})) }
pub async fn get_car_learning() -> impl IntoResponse { Json(json!({})) }
pub async fn save_car_learning() -> impl IntoResponse { Json(json!({"status": "saved"})) }


pub fn drag_and_other_routes(state: SharedDbState) -> Router {
    Router::new()
        .route("/api/drag/prepare", post(drag_prepare))
        .route("/api/drag/status", get(drag_status))
        .route("/api/drag/data", get(drag_data))
        .route("/api/drag/analysis", get(drag_analysis))
        .route("/api/drag/clear", post(drag_clear))
        .route("/api/drag/sessions/save", post(drag_save_session))
        .route("/api/drag/sessions", get(list_drag_sessions))
        .route("/api/drag/sessions/{filename}", get(get_drag_session).delete(delete_drag_session))

        .route("/api/logs", get(get_logs).delete(clear_logs))

        .route("/api/overlay/config", get(get_overlay_config).post(save_overlay_config))
        .route("/api/overlay/layout", get(get_overlay_layout).post(save_overlay_layout))
        .route("/api/overlay/car_learning", get(get_car_learning).post(save_car_learning))
        .with_state(state)
}
