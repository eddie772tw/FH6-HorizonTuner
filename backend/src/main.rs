mod analysis;
mod database;
mod drag;
mod settings;
mod telemetry;
mod tunings;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use database::{DbState, SharedDbState};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use telemetry::{pack_telemetry_binary, TelemetryData};
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
struct AppState {
    telemetry_tx: broadcast::Sender<TelemetryData>,
}

async fn ws_telemetry_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.telemetry_tx, false))
}

async fn ws_telemetry_binary_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.telemetry_tx, true))
}

async fn handle_socket(mut socket: WebSocket, tx: broadcast::Sender<TelemetryData>, binary: bool) {
    let mut rx = tx.subscribe();
    loop {
        match rx.recv().await {
            Ok(data) => {
                let msg = if binary {
                    let bin_data = pack_telemetry_binary(&data);
                    Message::Binary(bin_data.to_vec().into())
                } else {
                    match serde_json::to_string(&data) {
                        Ok(json_str) => Message::Text(json_str.into()),
                        Err(_) => continue,
                    }
                };

                if socket.send(msg).await.is_err() {
                    break;
                }
            }
            Err(_) => {
                break;
            }
        }
    }
}

async fn list_languages() -> impl IntoResponse {
    axum::Json(json!([]))
}
async fn get_language() -> impl IntoResponse {
    axum::Json(json!({}))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap().to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));

    // Check if running in a "frozen" / bundled state (if frontend.exe exists nearby)
    let is_frozen = exe_dir.join("FH6-HorizonTuner.exe").exists() || exe_dir.join("frontend.exe").exists();

    let data_root = if is_frozen {
        exe_dir.clone()
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    };

    let _ = tokio::fs::create_dir_all(data_root.join("car_params")).await;
    let _ = tokio::fs::create_dir_all(data_root.join("tunings")).await;
    let _ = tokio::fs::create_dir_all(data_root.join("sessions")).await;
    let _ = tokio::fs::create_dir_all(data_root.join("drag_sessions")).await;
    let _ = tokio::fs::create_dir_all(data_root.join("logs")).await;

    let mut car_db = json!({});
    if let Ok(content) = tokio::fs::read_to_string(data_root.join("car_database.json")).await {
        if let Ok(db) = serde_json::from_str::<Value>(&content) {
            car_db = db;
        }
    }

    let db_state = Arc::new(RwLock::new(DbState {
        car_db,
        data_root: data_root.clone(),
    }));

    let (telemetry_tx, _) = broadcast::channel(100);

    let listener_tx = telemetry_tx.clone();
    tokio::spawn(async move {
        telemetry::start_udp_listener("0.0.0.0".to_string(), 8000, listener_tx).await;
    });

    let app_state = AppState { telemetry_tx };

    let router = Router::new()
        .merge(database::database_routes(db_state.clone()))
        .merge(settings::settings_routes(db_state.clone()))
        .merge(tunings::tunings_routes(db_state.clone()))
        .merge(analysis::analysis_routes(db_state.clone()))
        .merge(drag::drag_and_other_routes(db_state.clone()))
        .merge(
            Router::new()
                .route("/ws/telemetry", get(ws_telemetry_handler))
                .route("/ws/telemetry/binary", get(ws_telemetry_binary_handler))
                .with_state(app_state),
        )
        .route("/api/languages", get(list_languages))
        .route("/api/languages/{code}", get(get_language))
        .layer(tower_http::cors::CorsLayer::permissive());

    // Spawn Python subprocess safely
    let exe_dir_for_python = exe_dir.clone();
    tokio::spawn(async move {
        let mut python_exe = "python";
        if std::path::Path::new("python3").exists() {
            python_exe = "python3";
        }
        if std::path::Path::new("../.venv/Scripts/python.exe").exists() {
            python_exe = "../.venv/Scripts/python.exe";
        } else if std::path::Path::new(".venv/Scripts/python.exe").exists() {
            python_exe = ".venv/Scripts/python.exe";
        }

        let py_script = if is_frozen {
            exe_dir_for_python.join("analysis_worker.py").to_string_lossy().to_string()
        } else {
            "analysis_worker.py".to_string()
        };

        if std::path::Path::new(&py_script).exists() {
            let child_res = tokio::process::Command::new(python_exe)
                .arg(&py_script)
                .spawn();
            if let Ok(mut child) = child_res {
                let _ = child.wait().await;
            } else {
                tracing::error!("Failed to spawn python analysis_worker");
            }
        }
    });

    // Production Launch behavior: if frozen, launch the frontend
    if is_frozen {
        let frontend_exe = if exe_dir.join("FH6-HorizonTuner.exe").exists() {
            exe_dir.join("FH6-HorizonTuner.exe")
        } else {
            exe_dir.join("frontend.exe")
        };

        tokio::spawn(async move {
            let _ = tokio::process::Command::new(frontend_exe)
                .arg("--no-sidecar")
                .spawn();
        });
    }

    let port: u16 = 8001;
    let _ = tokio::fs::write(data_root.join("logs").join("web_port.txt"), port.to_string()).await;

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .unwrap();
    tracing::info!("Server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, router).await.unwrap();
}
