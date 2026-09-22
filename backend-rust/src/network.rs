//! HTTP/WebSocket adapter with bounded delivery, independent of Tauri.
use crate::error::{ApiError, ApiResult};
use axum::{
    body::{to_bytes, Body},
    extract::{
        ws::{CloseFrame, Message, WebSocket},
        WebSocketUpgrade,
    },
    http::{HeaderMap, HeaderValue, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::{broadcast, watch};

pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub query: BTreeMap<String, String>,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
    pub upload_filename: Option<String>,
}
impl ApiRequest {
    pub fn json(&self) -> ApiResult<Value> {
        if self.body.is_empty() {
            return Ok(serde_json::json!({}));
        }
        serde_json::from_slice(&self.body).map_err(|_| ApiError::new(422, "Invalid JSON payload"))
    }
}
pub struct ApiResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub headers: Vec<(String, String)>,
}
impl ApiResponse {
    pub fn json(value: Value) -> Self {
        Self::bytes(
            200,
            serde_json::to_vec(&value).expect("JSON wire value"),
            "application/json",
        )
    }
    pub fn bytes(status: u16, body: Vec<u8>, content_type: &str) -> Self {
        Self {
            status,
            body,
            headers: vec![("content-type".into(), content_type.into())],
        }
    }
    pub fn header(mut self, key: &str, value: impl Into<String>) -> Self {
        self.headers.push((key.into(), value.into()));
        self
    }
}
impl IntoResponse for ApiResponse {
    fn into_response(self) -> Response {
        let mut response = Response::builder().status(self.status);
        for (key, value) in self.headers {
            response = response.header(key, value);
        }
        response
            .body(Body::from(self.body))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
    }
}
pub trait Backend: Send + Sync + 'static {
    fn request(&self, request: ApiRequest) -> ApiResult<ApiResponse>;
    fn telemetry(&self) -> watch::Receiver<Option<Arc<Value>>>;
    fn overlay(&self) -> broadcast::Receiver<Value>;
    fn initial_overlay(&self) -> Value;
    fn client_delta(&self, channel: &str, delta: i64);
}
pub fn router(backend: Arc<dyn Backend>) -> Router {
    // Capture the server-owned backend separately from request extractors. This
    // also keeps its data root out of CodeQL's all-handler-parameters source model.
    let json_backend = backend.clone();
    let binary_backend = backend.clone();
    let overlay_backend = backend.clone();
    Router::new()
        .route(
            "/ws/telemetry",
            get(move |headers, upgrade| ws_json(json_backend.clone(), headers, upgrade)),
        )
        .route(
            "/ws/telemetry/binary",
            get(move |headers, upgrade| ws_binary(binary_backend.clone(), headers, upgrade)),
        )
        .route(
            "/ws/overlay",
            get(move |headers, upgrade| ws_overlay(overlay_backend.clone(), headers, upgrade)),
        )
        .fallback(move |request| http_request(backend.clone(), request))
        .layer(middleware::from_fn(origin_security))
}
pub fn allowed_origin(origin: Option<&str>) -> bool {
    let Some(origin) = origin.filter(|s| !s.is_empty()) else {
        return true;
    };
    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    match url.scheme() {
        "tauri" | "app" => url.host_str().is_none_or(|h| h == "localhost"),
        "http" | "https" => matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "tauri.localhost" | "testserver")
        ),
        _ => false,
    }
}
fn cors_origin(origin: &str) -> bool {
    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    (url.scheme() == "tauri"
        && url.host_str() == Some("localhost")
        && origin == "tauri://localhost")
        || (matches!(url.scheme(), "http" | "https")
            && matches!(
                url.host_str(),
                Some("localhost" | "127.0.0.1" | "tauri.localhost")
            )
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none())
}
async fn origin_security(request: Request<Body>, next: Next) -> Response {
    let origin = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    if !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    ) && !allowed_origin(origin.as_deref())
    {
        return ApiError::new(403, "CSRF protection blocked request: Invalid Origin.")
            .into_response();
    }
    let preflight = request.method() == Method::OPTIONS
        && request
            .headers()
            .contains_key("access-control-request-method");
    let requested_headers = request
        .headers()
        .get("access-control-request-headers")
        .cloned();
    let mut response = if preflight {
        if origin.as_deref().is_some_and(cors_origin) {
            (StatusCode::OK, "OK").into_response()
        } else {
            (StatusCode::BAD_REQUEST, "Disallowed CORS origin").into_response()
        }
    } else {
        next.run(request).await
    };
    if let Some(origin) = origin.filter(|o| cors_origin(o)) {
        if let Ok(value) = HeaderValue::from_str(&origin) {
            response
                .headers_mut()
                .insert("access-control-allow-origin", value);
        }
        response.headers_mut().insert(
            "access-control-allow-credentials",
            HeaderValue::from_static("true"),
        );
        response
            .headers_mut()
            .insert("vary", HeaderValue::from_static("Origin"));
        if preflight {
            response.headers_mut().insert(
                "access-control-allow-methods",
                HeaderValue::from_static("DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT"),
            );
            response
                .headers_mut()
                .insert("access-control-max-age", HeaderValue::from_static("600"));
            if let Some(value) = requested_headers {
                response
                    .headers_mut()
                    .insert("access-control-allow-headers", value);
            }
        }
    }
    response
}
async fn http_request(backend: Arc<dyn Backend>, request: Request<Body>) -> Response {
    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, 64 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => return ApiError::new(413, "Request body too large").into_response(),
    };
    let mut upload_filename = None;
    let body = if parts.method == Method::POST && parts.uri.path() == "/api/analysis/import/motec" {
        use axum::extract::FromRequest;
        let upload = Request::from_parts(parts.clone(), Body::from(body));
        let mut multipart = match axum::extract::Multipart::from_request(upload, &()).await {
            Ok(value) => value,
            Err(_) => return ApiError::new(422, "Missing multipart file").into_response(),
        };
        let mut file = None;
        loop {
            match multipart.next_field().await {
                Ok(Some(field)) => {
                    if field.name() == Some("file") {
                        upload_filename = field.file_name().map(str::to_owned);
                        file = match field.bytes().await {
                            Ok(bytes) => Some(bytes.to_vec()),
                            Err(_) => {
                                return ApiError::new(400, "Invalid multipart file").into_response()
                            }
                        };
                        break;
                    }
                }
                Ok(None) => break,
                Err(_) => return ApiError::new(400, "Invalid multipart request").into_response(),
            }
        }
        match file {
            Some(file) => file,
            None => return ApiError::new(422, "Missing multipart file").into_response(),
        }
    } else {
        body.to_vec()
    };
    let path = match percent_encoding::percent_decode_str(parts.uri.path()).decode_utf8() {
        Ok(path) => path.into_owned(),
        Err(_) => return ApiError::new(400, "Invalid request path").into_response(),
    };
    let query = url::form_urlencoded::parse(parts.uri.query().unwrap_or("").as_bytes())
        .into_owned()
        .collect();
    let request = ApiRequest {
        method: parts.method.to_string(),
        path,
        query,
        headers: parts.headers,
        body,
        upload_filename,
    };
    match tokio::task::spawn_blocking(move || backend.request(request)).await {
        Ok(Ok(response)) => response.into_response(),
        Ok(Err(error)) => error.into_response(),
        Err(error) => {
            eprintln!("request worker failed: {error}");
            ApiError::new(500, "Internal Server Error").into_response()
        }
    }
}
async fn ws_json(
    backend: Arc<dyn Backend>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    ws_start(backend, headers, upgrade, "json")
}
async fn ws_binary(
    backend: Arc<dyn Backend>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    ws_start(backend, headers, upgrade, "binary")
}
async fn ws_overlay(
    backend: Arc<dyn Backend>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    ws_start(backend, headers, upgrade, "overlay")
}
fn ws_start(
    backend: Arc<dyn Backend>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
    channel: &'static str,
) -> Response {
    if !allowed_origin(headers.get("origin").and_then(|v| v.to_str().ok())) {
        return StatusCode::FORBIDDEN.into_response();
    }
    upgrade.on_upgrade(move |socket| socket_loop(socket, backend, channel))
}
struct ClientGuard {
    backend: Arc<dyn Backend>,
    channel: &'static str,
}
impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.backend.client_delta(self.channel, -1);
    }
}
async fn send(socket: &mut WebSocket, message: Message) -> bool {
    matches!(
        tokio::time::timeout(Duration::from_millis(750), socket.send(message)).await,
        Ok(Ok(()))
    )
}
async fn socket_loop(mut socket: WebSocket, backend: Arc<dyn Backend>, channel: &'static str) {
    backend.client_delta(channel, 1);
    let _guard = ClientGuard {
        backend: backend.clone(),
        channel,
    };
    if channel == "overlay" {
        let mut receiver = backend.overlay();
        if !send(
            &mut socket,
            Message::Text(backend.initial_overlay().to_string().into()),
        )
        .await
        {
            return;
        }
        loop {
            tokio::select! {
                incoming=socket.recv()=>{if matches!(incoming,None|Some(Err(_))|Some(Ok(Message::Close(_)))){break;}}
                outgoing=receiver.recv()=>{match outgoing{Ok(value)=>if !send(&mut socket,Message::Text(value.to_string().into())).await{break;},Err(broadcast::error::RecvError::Lagged(_))=>{let _=send(&mut socket,Message::Close(Some(CloseFrame{code:1013,reason:"Slow consumer".into()}))).await;break;},Err(_)=>break}}
            }
        }
    } else {
        let mut receiver = backend.telemetry();
        loop {
            tokio::select! {
                incoming=socket.recv()=>{if matches!(incoming,None|Some(Err(_))|Some(Ok(Message::Close(_)))){break;}}
                changed=receiver.changed()=>{if changed.is_err(){break;}let value=receiver.borrow_and_update().clone();if let Some(value)=value {let message=if channel=="binary"{Message::Binary(crate::telemetry::pack_binary(&value).into())}else{Message::Text(value.to_string().into())};if !send(&mut socket,message).await{break;}}}
            }
        }
    }
}
