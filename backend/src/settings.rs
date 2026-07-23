use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde_json::{Value, json};
use tokio::fs;

use crate::database::SharedDbState;

pub async fn get_settings(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let settings_file = state.data_root.join("settings.json");

    match fs::read_to_string(&settings_file).await {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => (StatusCode::OK, Json(json)).into_response(),
            Err(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Invalid JSON format in settings"})),
            )
                .into_response(),
        },
        Err(_) => (StatusCode::OK, Json(json!({}))).into_response(),
    }
}

pub async fn update_settings(
    State(state): State<SharedDbState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let state = state.read().await;
    let settings_file = state.data_root.join("settings.json");

    match serde_json::to_string_pretty(&payload) {
        Ok(content) => {
            if fs::write(&settings_file, content).await.is_ok() {
                (StatusCode::OK, Json(json!({"status": "success"}))).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to write settings file"})),
                )
                    .into_response()
            }
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to serialize settings"})),
        )
            .into_response(),
    }
}

pub fn settings_routes(state: SharedDbState) -> Router {
    Router::new()
        .route("/api/settings", get(get_settings).post(update_settings))
        .with_state(state)
}
