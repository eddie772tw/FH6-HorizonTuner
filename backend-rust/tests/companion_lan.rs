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
    let initial: Value =
        serde_json::from_slice(&to_bytes(workflow.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(initial["visualTheme"]["schemaVersion"], 1);
    assert_eq!(initial["visualTheme"].as_object().unwrap().len(), 6);
    assert_eq!(initial["hostOnline"], false);
    for core in [
        "default",
        "modern",
        "elegant",
        "swiss",
        "swiss-editorial",
        "swiss-contrast",
        "rhine-lab",
    ] {
        for mode in ["light", "dark"] {
            app.config.handle("POST", "/api/settings", &json!({"theme":{"mode":mode,"halfmoonCore":core,"primaryColor":"#123456","secondaryColor":"#abcdef","accentColor":"#987654","customCSS":"body{background:url(secret)}"}})).unwrap().unwrap();
            let response = router
                .clone()
                .oneshot(request(
                    Method::GET,
                    "/api/companion/workflow",
                    Some(session),
                    None,
                    Body::empty(),
                ))
                .await
                .unwrap();
            let next: Value =
                serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap())
                    .unwrap();
            assert_eq!(next["revision"], initial["revision"]);
            assert_eq!(next["snapshot"], initial["snapshot"]);
            assert_eq!(next["hostOnline"], false);
            assert_eq!(next["visualTheme"]["mode"], mode);
            assert_eq!(next["visualTheme"]["halfmoonCore"], core);
            assert_eq!(next["visualTheme"].as_object().unwrap().len(), 6);
            assert!(!next.to_string().contains("secret"));
        }
    }
    for (method, path) in [
        (Method::GET, "/api/settings"),
        (Method::POST, "/api/settings"),
        (Method::POST, "/api/companion/lan/pairing"),
        (Method::DELETE, "/api/companion/devices/tablet-1"),
    ] {
        let response = router
            .clone()
            .oneshot(request(method, path, Some(session), None, Body::empty()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    let wrong_origin = router
        .clone()
        .oneshot(request(
            Method::GET,
            "/api/companion/workflow",
            Some(session),
            Some("http://attacker.example"),
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(wrong_origin.status(), StatusCode::FORBIDDEN);

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

#[tokio::test]
async fn http_responses_enforce_defense_in_depth_security_headers() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    app.companion.set_lan_port(Some(8002));
    let lan_router = network::lan_router(app.clone(), app.companion.clone());
    let general_router = network::router(app.clone());

    // 1. LAN router enforces security headers on 401 Unauthorized
    let unauth = lan_router
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
    assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        unauth.headers().get("x-content-type-options").unwrap(),
        "nosniff"
    );
    assert_eq!(
        unauth.headers().get("x-frame-options").unwrap(),
        "SAMEORIGIN"
    );
    assert_eq!(
        unauth.headers().get("referrer-policy").unwrap(),
        "strict-origin-when-cross-origin"
    );

    // The registered WebSocket route can reject HTTP before the LAN fallback runs.
    let rejected = lan_router
        .oneshot(request(
            Method::POST,
            "/ws/telemetry",
            None,
            None,
            Body::empty(),
        ))
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(rejected.headers()["x-content-type-options"], "nosniff");
    assert_eq!(rejected.headers()["x-frame-options"], "SAMEORIGIN");
    assert_eq!(
        rejected.headers()["referrer-policy"],
        "strict-origin-when-cross-origin"
    );

    // 2. General router enforces security headers on standard API GET
    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/health")
        .header("host", "127.0.0.1:8001")
        .body(Body::empty())
        .unwrap();
    let res = general_router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers().get("x-content-type-options").unwrap(),
        "nosniff"
    );
    assert_eq!(res.headers().get("x-frame-options").unwrap(), "SAMEORIGIN");
    assert_eq!(
        res.headers().get("referrer-policy").unwrap(),
        "strict-origin-when-cross-origin"
    );

    // 3. General router enforces security headers on CSRF 403 blocked requests
    let csrf_req = Request::builder()
        .method(Method::POST)
        .uri("/api/settings")
        .header("host", "127.0.0.1:8001")
        .header("origin", "http://evil-attacker.com")
        .body(Body::from("{}"))
        .unwrap();
    let csrf_res = general_router.oneshot(csrf_req).await.unwrap();
    assert_eq!(csrf_res.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        csrf_res.headers().get("x-content-type-options").unwrap(),
        "nosniff"
    );
    assert_eq!(
        csrf_res.headers().get("x-frame-options").unwrap(),
        "SAMEORIGIN"
    );
    assert_eq!(
        csrf_res.headers().get("referrer-policy").unwrap(),
        "strict-origin-when-cross-origin"
    );
}

#[tokio::test]
async fn general_router_enforces_host_validation_against_dns_rebinding() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let router = network::router(app.clone());

    // 1. Valid local hosts are permitted on the loopback router
    for valid_host in [
        "127.0.0.1:8001",
        "localhost:8001",
        "LOCALHOST:8001",
        "[::1]:8001",
        "tauri.localhost",
    ] {
        let req = Request::builder()
            .method(Method::GET)
            .uri("/api/health")
            .header("host", valid_host)
            .body(Body::empty())
            .unwrap();
        let res = router.clone().oneshot(req).await.unwrap();
        assert_eq!(
            res.status(),
            StatusCode::OK,
            "Host {valid_host} must be accepted"
        );
    }

    // 2. Untrusted / DNS rebinding domains are rejected with 403 Forbidden
    for rebinding_host in [
        "attacker.example:8001",
        "evil-rebind.net",
        "localhost.attacker.com",
        "localhost:8001@attacker.com",
    ] {
        let req = Request::builder()
            .method(Method::GET)
            .uri("/api/health")
            .header("host", rebinding_host)
            .body(Body::empty())
            .unwrap();
        let res = router.clone().oneshot(req).await.unwrap();
        assert_eq!(
            res.status(),
            StatusCode::FORBIDDEN,
            "Rebinding host {rebinding_host} must be rejected"
        );
        assert_eq!(
            res.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        assert_eq!(res.headers().get("x-frame-options").unwrap(), "SAMEORIGIN");
    }

    // 3. Missing host header is rejected
    let no_host = Request::builder()
        .method(Method::GET)
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let res = router.oneshot(no_host).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn companion_setting_gates_block_disabled_subsystems() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let router = network::router(app.clone());

    // 1. By default, companion_usb_enabled is false -> /api/companion/usb/devices must return 403
    let usb_req = Request::builder()
        .method(Method::GET)
        .uri("/api/companion/usb/devices")
        .header("host", "127.0.0.1:8001")
        .body(Body::empty())
        .unwrap();
    let res = router.clone().oneshot(usb_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 2. /api/companion/status reports enabled: true by default
    let status_req = Request::builder()
        .method(Method::GET)
        .uri("/api/companion/status")
        .header("host", "127.0.0.1:8001")
        .body(Body::empty())
        .unwrap();
    let res = router.clone().oneshot(status_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = to_bytes(res.into_body(), 8192).await.unwrap();
    let status: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(status["enabled"], true);

    // 3. Disable companion_enabled in settings
    let update_req = Request::builder()
        .method(Method::POST)
        .uri("/api/settings")
        .header("host", "127.0.0.1:8001")
        .body(Body::from(json!({"companion_enabled": false}).to_string()))
        .unwrap();
    let res = router.clone().oneshot(update_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 4. Now /api/companion/lan/pairing returns 403
    let pair_req = Request::builder()
        .method(Method::POST)
        .uri("/api/companion/lan/pairing")
        .header("host", "127.0.0.1:8001")
        .body(Body::empty())
        .unwrap();
    let res = router.clone().oneshot(pair_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 5. /api/companion/status reports enabled: false
    let status_req2 = Request::builder()
        .method(Method::GET)
        .uri("/api/companion/status")
        .header("host", "127.0.0.1:8001")
        .body(Body::empty())
        .unwrap();
    let res = router.oneshot(status_req2).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body2 = to_bytes(res.into_body(), 8192).await.unwrap();
    let status2: Value = serde_json::from_slice(&body2).unwrap();
    assert_eq!(status2["enabled"], false);
}
