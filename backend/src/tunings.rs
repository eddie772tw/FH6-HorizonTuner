use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde_json::{Value, json};
use tokio::fs;

use crate::database::SharedDbState;

pub async fn list_tunings(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let tunings_dir = state.data_root.join("tunings");

    let mut tunings_map = serde_json::Map::new();

    if let Ok(mut dir) = fs::read_dir(&tunings_dir).await {
        while let Ok(Some(entry)) = dir.next_entry().await {
            if let Ok(file_type) = entry.file_type().await {
                if file_type.is_dir() {
                    let car_id = entry.file_name().to_string_lossy().to_string();
                    let car_dir = tunings_dir.join(&car_id);
                    let mut file_list = Vec::new();

                    if let Ok(mut sub_dir) = fs::read_dir(car_dir).await {
                        while let Ok(Some(sub_entry)) = sub_dir.next_entry().await {
                            if let Ok(sub_ft) = sub_entry.file_type().await {
                                if sub_ft.is_file() {
                                    let name = sub_entry.file_name().to_string_lossy().to_string();
                                    if name.ends_with(".json") {
                                        file_list.push(json!(name.trim_end_matches(".json")));
                                    }
                                }
                            }
                        }
                    }
                    if !file_list.is_empty() {
                        tunings_map.insert(car_id, Value::Array(file_list));
                    }
                }
            }
        }
    }

    Json(Value::Object(tunings_map))
}

pub async fn get_tuning(
    Path((car_id, save_name)): Path<(String, String)>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let tuning_file = state
        .data_root
        .join("tunings")
        .join(car_id)
        .join(format!("{}.json", save_name));

    match fs::read_to_string(&tuning_file).await {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => (StatusCode::OK, Json(json)).into_response(),
            Err(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Invalid JSON format"})),
            )
                .into_response(),
        },
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Tuning not found"})),
        )
            .into_response(),
    }
}

pub async fn save_tuning(
    Path((car_id, save_name)): Path<(String, String)>,
    State(state): State<SharedDbState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let state = state.read().await;
    let car_dir = state.data_root.join("tunings").join(car_id);
    let _ = fs::create_dir_all(&car_dir).await;

    let tuning_file = car_dir.join(format!("{}.json", save_name));

    match serde_json::to_string_pretty(&payload) {
        Ok(content) => {
            if fs::write(&tuning_file, content).await.is_ok() {
                (
                    StatusCode::OK,
                    Json(json!({"status": "success", "message": "Tuning saved successfully"})),
                )
                    .into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to write tuning file"})),
                )
                    .into_response()
            }
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to serialize tuning"})),
        )
            .into_response(),
    }
}

pub fn tunings_routes(state: SharedDbState) -> Router {
    Router::new()
        .route("/api/tunings", get(list_tunings))
        .route(
            "/api/tunings/{car_id}/{save_name}",
            get(get_tuning).post(save_tuning),
        )
        .with_state(state)
}
