use axum::{body::to_bytes, response::IntoResponse};
use fh6_backend::error::ApiError;
use serde_json::{json, Value};

#[tokio::test]
async fn operational_errors_hide_native_details_and_keep_status_codes() {
    let private = r"C:\Users\private\tools\adb.exe: device secret-serial failed";
    for (error, status, message) in [
        (
            ApiError::unavailable("USB list devices", private),
            503,
            "Service Unavailable",
        ),
        (
            ApiError::unavailable("USB connect", private),
            503,
            "Service Unavailable",
        ),
        (
            ApiError::internal("Audio device selection", private),
            500,
            "Internal Server Error",
        ),
        (
            ApiError::internal("MoTeC CSV export", private),
            500,
            "Internal Server Error",
        ),
    ] {
        let response = error.into_response();
        assert_eq!(response.status().as_u16(), status);
        let body = to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"detail": message})
        );
    }
    // Intentional validation guidance must remain actionable.
    let response = ApiError::invalid("Missing serial").into_response();
    assert_eq!(response.status().as_u16(), 422);
    let body = to_bytes(response.into_body(), 1024).await.unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap(),
        json!({"detail":"Missing serial"})
    );
}
