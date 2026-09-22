use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: u16,
    pub detail: String,
    pub validation: Option<Value>,
}
pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: u16, detail: impl Into<String>) -> Self {
        Self {
            status,
            detail: detail.into(),
            validation: None,
        }
    }
    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(422, detail)
    }
    pub fn conflict(detail: impl Into<String>) -> Self {
        Self::new(409, detail)
    }
    pub fn body_validation(kind: &str, message: &str, input: Value) -> Self {
        let mut error = Self::invalid(message);
        error.validation = Some(json!([{"type":kind,"loc":["body"],"msg":message,"input":input}]));
        error
    }
}
impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.detail)
    }
}
impl std::error::Error for ApiError {}
impl From<std::io::Error> for ApiError {
    fn from(err: std::io::Error) -> Self {
        let _ = err;
        Self::new(500, "Storage operation failed")
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(_: serde_json::Error) -> Self {
        Self::new(422, "Invalid JSON document")
    }
}
impl From<rusqlite::Error> for ApiError {
    fn from(err: rusqlite::Error) -> Self {
        eprintln!("database error: {err}");
        Self::new(500, "Database operation failed")
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(json!({"detail": self.validation.unwrap_or(json!(self.detail))})),
        )
            .into_response()
    }
}
