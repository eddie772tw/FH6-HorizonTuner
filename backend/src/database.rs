use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

pub struct DbState {
    pub car_db: Value,
    pub data_root: PathBuf,
}

pub type SharedDbState = Arc<RwLock<DbState>>;

pub async fn get_car_database(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    Json(state.car_db.clone())
}

pub async fn get_cars_with_params(State(state): State<SharedDbState>) -> impl IntoResponse {
    let state = state.read().await;
    let params_dir = state.data_root.join("car_params");

    let mut files = Vec::new();
    if let Ok(mut entries) = fs::read_dir(params_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(file_type) = entry.file_type().await {
                if file_type.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.ends_with(".json") {
                        let id = file_name.trim_end_matches(".json");
                        files.push(id.to_string());
                    }
                }
            }
        }
    }
    Json(files)
}

pub async fn get_car_params(
    Path(car_id): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state
        .data_root
        .join("car_params")
        .join(format!("{}.json", car_id));

    match fs::read_to_string(&file_path).await {
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
            Json(json!({"error": "Car parameters not found"})),
        )
            .into_response(),
    }
}

pub async fn update_car_params(
    Path(car_id): Path<String>,
    State(state): State<SharedDbState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let state = state.read().await;
    let params_dir = state.data_root.join("car_params");
    let _ = fs::create_dir_all(&params_dir).await;

    let file_path = params_dir.join(format!("{}.json", car_id));

    match serde_json::to_string_pretty(&payload) {
        Ok(content) => {
            if fs::write(&file_path, content).await.is_ok() {
                (
                    StatusCode::OK,
                    Json(
                        json!({"status": "success", "message": "Parameters updated successfully"}),
                    ),
                )
                    .into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to write parameter file"})),
                )
                    .into_response()
            }
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to serialize parameters"})),
        )
            .into_response(),
    }
}

pub async fn clear_dyno_curve(
    Path(car_id): Path<String>,
    State(state): State<SharedDbState>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state
        .data_root
        .join("car_params")
        .join(format!("{}.json", car_id));

    if let Ok(content) = fs::read_to_string(&file_path).await {
        if let Ok(mut json) = serde_json::from_str::<Value>(&content) {
            if let Some(obj) = json.as_object_mut() {
                obj.remove("dyno_history");
                obj.remove("power_curve");
                obj.remove("torque_curve");
            }
            if let Ok(new_content) = serde_json::to_string_pretty(&json) {
                if fs::write(&file_path, new_content).await.is_ok() {
                    return (
                        StatusCode::OK,
                        Json(json!({"status": "success", "message": "Dyno curve cleared"})),
                    )
                        .into_response();
                }
            }
        }
    }

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({"error": "Failed to clear dyno curve"})),
    )
        .into_response()
}

pub fn database_routes(state: SharedDbState) -> Router {
    Router::new()
        .route("/api/cars/database", get(get_car_database))
        .route("/api/cars/with_params", get(get_cars_with_params))
        .route(
            "/api/car_params/{car_id}",
            get(get_car_params).post(update_car_params),
        )
        .route(
            "/api/car_params/{car_id}/dyno_curve",
            delete(clear_dyno_curve),
        )
        .with_state(state)
}
