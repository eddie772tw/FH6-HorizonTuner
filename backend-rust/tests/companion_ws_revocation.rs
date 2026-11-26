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
