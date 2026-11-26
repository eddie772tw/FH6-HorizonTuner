use fh6_backend::{app::App, network};
use serde_json::json;
use std::time::Duration;
use tungstenite::error::ProtocolError::ResetWithoutClosingHandshake;
use tungstenite::{client::IntoClientRequest, stream::MaybeTlsStream, Error as WsErr, Message};

type Ws = tungstenite::WebSocket<MaybeTlsStream<std::net::TcpStream>>;

fn dial(port: u16, session: &str) -> Result<Ws, WsErr> {
    let url = format!("ws://127.0.0.1:{port}/ws/telemetry");
    let mut req = url.into_client_request().unwrap();
    let cookie = format!("companion_session={session}").parse().unwrap();
    req.headers_mut().insert("cookie", cookie);
    let (mut ws, _) = tungstenite::connect(req)?;
    if let MaybeTlsStream::Plain(tcp) = ws.get_mut() {
        tcp.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    }
    Ok(ws)
}

fn assert_closed(mut ws: Ws) {
    let res = ws.read();
    let gone = matches!(
        res,
        Ok(Message::Close(_))
            | Err(WsErr::ConnectionClosed | WsErr::Protocol(ResetWithoutClosingHandshake))
    );
    assert!(gone, "Revoked LAN WebSocket remained open: {res:?}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unpairing_or_rotating_device_closes_only_revoked_lan_websocket() {
    let root = tempfile::tempdir().unwrap();
    fh6_backend::storage::save_settings(root.path(), &json!({"companion_enabled": true})).unwrap();
    let app = App::new(root.path()).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    app.companion.set_lan_port(Some(port));
    let lan = network::lan_router(app.clone(), app.companion.clone());
    let srv = tokio::spawn(async move { axum::serve(listener, lan).await.unwrap() });
    tokio::task::spawn_blocking(move || {
        let pair = |id| {
            let token = app.companion.generate_qr_payload(Some(port)).token;
            app.companion.pair(&token, id, id).unwrap().1
        };
        let (sa, sb) = (pair("tablet-a"), pair("tablet-b"));
        let (wa, mut wb) = (dial(port, &sa).unwrap(), dial(port, &sb).unwrap());
        assert!(app.companion.remove_device("tablet-a"));
        assert_closed(wa);
        assert!(matches!(dial(port, &sa), Err(WsErr::Http(r)) if r.status().as_u16() == 401));
        app.process(json!({"IsRaceOn": 1, "SpeedMetersPerSecond": 42.0}));
        assert!(matches!(wb.read(), Ok(Message::Text(_))));
        let sb2 = pair("tablet-b");
        assert_closed(wb);
        assert!(dial(port, &sb2).is_ok());
    })
    .await
    .unwrap();
    srv.abort();
}

#[tokio::test(flavor = "multi_thread")]
async fn disabling_companion_closes_usb_without_stopping_desktop_telemetry() {
    let root = tempfile::tempdir().unwrap();
    fh6_backend::storage::save_settings(
        root.path(),
        &json!({
            "companion_enabled": true,
            "companion_usb_enabled": true
        }),
    )
    .unwrap();
    let app = App::new(root.path()).unwrap();
    let desktop = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let usb = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let desktop_port = desktop.local_addr().unwrap().port();
    let usb_port = usb.local_addr().unwrap().port();
    app.companion.set_usb_port(Some(usb_port));
    let desktop_router = network::desktop_router(app.clone());
    let usb_router = network::usb_companion_router(app.clone(), app.companion.clone());
    let desktop_task =
        tokio::spawn(async move { axum::serve(desktop, desktop_router).await.unwrap() });
    let usb_task = tokio::spawn(async move { axum::serve(usb, usb_router).await.unwrap() });

    let (desktop_ws, usb_ws) = tokio::task::spawn_blocking(move || {
        (dial(desktop_port, "").unwrap(), dial(usb_port, "").unwrap())
    })
    .await
    .unwrap();
    let app_requests = app.clone();
    tokio::task::spawn_blocking(move || {
        let backend = app_requests.as_ref() as &dyn network::Backend;
        backend
            .request(network::ApiRequest {
                method: "POST".into(),
                path: "/api/settings".into(),
                query: Default::default(),
                headers: Default::default(),
                upload_filename: None,
                body: serde_json::to_vec(&json!({ "companion_enabled": false })).unwrap(),
            })
            .unwrap();
        assert_closed(usb_ws);
        assert!(matches!(dial(usb_port, ""), Err(WsErr::Http(_))));
        let mut desktop_ws = desktop_ws;
        desktop_ws.send(Message::Ping(vec![1].into())).unwrap();
        assert!(matches!(desktop_ws.read(), Ok(Message::Pong(_))));
    })
    .await
    .unwrap();
    desktop_task.abort();
    usb_task.abort();
}

#[tokio::test(flavor = "multi_thread")]
async fn usb_ws_rejects_foreign_malformed_and_duplicate_origins() {
    let root = tempfile::tempdir().unwrap();
    fh6_backend::storage::save_settings(root.path(), &json!({"companion_enabled": true, "companion_usb_enabled": true})).unwrap();
    let app = App::new(root.path()).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    app.companion.set_usb_port(Some(port));
    let router = network::usb_companion_router(app.clone(), app.companion.clone());
    let srv = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    tokio::task::spawn_blocking(move || {
        for path in ["/ws/telemetry", "/ws/telemetry/binary"] {
            for bad in ["https://evil.example", "null", "app:evil.example", ""] {
                let mut req = format!("ws://127.0.0.1:{port}{path}").into_client_request().unwrap();
                req.headers_mut().insert("origin", bad.parse().unwrap());
                assert!(matches!(tungstenite::connect(req), Err(WsErr::Http(r)) if r.status().as_u16() == 403));
            }
            let mut dup = format!("ws://127.0.0.1:{port}{path}").into_client_request().unwrap();
            dup.headers_mut().append("origin", "http://127.0.0.1:8001".parse().unwrap());
            dup.headers_mut().append("origin", "https://evil.example".parse().unwrap());
            assert!(matches!(tungstenite::connect(dup), Err(WsErr::Http(r)) if r.status().as_u16() == 403));
            let mut local = format!("ws://127.0.0.1:{port}{path}").into_client_request().unwrap();
            local.headers_mut().insert("origin", format!("http://127.0.0.1:{port}").parse().unwrap());
            assert!(tungstenite::connect(local).is_ok());
            assert!(tungstenite::connect(format!("ws://127.0.0.1:{port}{path}")).is_ok());
        }
    }).await.unwrap();
    srv.abort();
}

#[tokio::test]
async fn desktop_router_blocks_encoded_companion_paths_and_malformed_origins() {
    use axum::{body::Body, http::{HeaderValue, Method, Request, StatusCode}};
    use tower::ServiceExt;
    let root = tempfile::tempdir().unwrap();
    fh6_backend::storage::save_settings(root.path(), &json!({"companion_enabled": true})).unwrap();
    let router = network::desktop_router(App::new(root.path()).unwrap());
    for path in ["/companion/hud/catalog.json", "/%63ompanion/hud/catalog.json", "/companion%2findex.html", "/%63ompanion"] {
        let res = router.clone().oneshot(Request::builder().method(Method::GET).uri(path).header("host", "127.0.0.1:8001").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND, "path {path}");
        assert_eq!(res.headers()["x-content-type-options"], "nosniff");
        assert_eq!(res.headers()["x-frame-options"], "SAMEORIGIN");
        assert_eq!(res.headers()["referrer-policy"], "strict-origin-when-cross-origin");
    }
    let bad_host = router.clone().oneshot(Request::builder().method(Method::GET).uri("/companion/index.html").header("host", "attacker.example").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(bad_host.status(), StatusCode::FORBIDDEN);
    assert_eq!(bad_host.headers()["x-content-type-options"], "nosniff");
    for origin in [HeaderValue::from_static(""), HeaderValue::from_bytes(b"\xff").unwrap(), HeaderValue::from_static("http://user@localhost"), HeaderValue::from_static("app:evil.example")] {
        let res = router.clone().oneshot(Request::builder().method(Method::POST).uri("/api/settings").header("host", "127.0.0.1:8001").header("origin", origin).body(Body::from("{}")).unwrap()).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }
    let dup = router.oneshot(Request::builder().method(Method::POST).uri("/api/settings").header("host", "127.0.0.1:8001").header("origin", "http://127.0.0.1:8001").header("origin", "https://evil.example").body(Body::from("{}")).unwrap()).await.unwrap();
    assert_eq!(dup.status(), StatusCode::FORBIDDEN);
}
