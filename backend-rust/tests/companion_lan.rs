use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
};
use fh6_backend::{app::App, network};
use serde_json::{json, Value};
use tower::ServiceExt;

fn request(
    method: Method,
    path: &str,
    cookie: Option<&str>,
    origin: Option<&str>,
    body: Body,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1:8002");
    if let Some(cookie) = cookie {
        builder = builder.header("cookie", format!("companion_session={cookie}"));
    }
    if let Some(origin) = origin {
        builder = builder.header("origin", origin);
    }
    builder.body(body).unwrap()
}

#[tokio::test]
async fn lan_pairing_limits_routes_and_revokes_session() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    app.companion.set_lan_port(Some(8002));
    let router = network::lan_router(app.clone(), app.companion.clone());
    let code = app.companion.generate_qr_payload(Some(8002)).token;
    let pair_body =
        json!({"token": code, "device_name":"Test tablet", "device_id":"tablet-1"}).to_string();

    let cross_origin = router
        .clone()
        .oneshot(request(
            Method::POST,
            "/api/companion/pair",
            None,
            Some("http://attacker.example"),
            Body::from(pair_body.clone()),
        ))
        .await
        .unwrap();
    assert_eq!(cross_origin.status(), StatusCode::FORBIDDEN);

    let pair = router
        .clone()
        .oneshot(request(
            Method::POST,
            "/api/companion/pair",
            None,
            None,
            Body::from(pair_body),
        ))
        .await
        .unwrap();
    assert_eq!(pair.status(), StatusCode::OK);
    let body = to_bytes(pair.into_body(), 8192).await.unwrap();
    let result: Value = serde_json::from_slice(&body).unwrap();
    let session = result["session_token"].as_str().unwrap();
    assert!(!session.is_empty());
    assert!(result["device"].get("session_token").is_none());

    let no_cookie = router
        .clone()
        .oneshot(request(
            Method::GET,
            "/api/companion/workflow",
            None,
            None,
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(no_cookie.status(), StatusCode::UNAUTHORIZED);

    let workflow = router
        .clone()
        .oneshot(request(
            Method::GET,
            "/api/companion/workflow",
            Some(session),
            Some("http://127.0.0.1:8002"),
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(workflow.status(), StatusCode::OK);

    let host_control = router
        .clone()
        .oneshot(request(
            Method::POST,
            "/api/companion/host",
            Some(session),
            None,
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(host_control.status(), StatusCode::NOT_FOUND);

    let general_api = router
        .clone()
        .oneshot(request(
            Method::GET,
            "/api/health",
            Some(session),
            None,
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(general_api.status(), StatusCode::NOT_FOUND);

    assert!(app.companion.remove_device("tablet-1"));
    let revoked = router
        .oneshot(request(
            Method::GET,
            "/api/companion/workflow",
            Some(session),
            None,
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
}
