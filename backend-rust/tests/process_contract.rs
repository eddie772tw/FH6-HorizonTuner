//! Black-box product boundary: launch the sidecar, send real UDP, receive HTTP
//! and WebSocket output. No game, GUI, Python runtime or audio hardware required.
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, UdpSocket},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tungstenite::{client, WebSocket};

struct Running {
    child: Child,
    root: tempfile::TempDir,
    port: u16,
    udp: u16,
}
impl Running {
    fn start(port: u16) -> Self {
        let root = tempfile::tempdir().unwrap();
        let probe = UdpSocket::bind("127.0.0.1:0").unwrap();
        let udp = probe.local_addr().unwrap().port();
        drop(probe);
        let executable = std::env::var_os("FH6_TEST_BACKEND_EXE")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_server-sidecar").into());
        let child = Command::new(executable)
            .args(["--port", &port.to_string(), "--data-dir"])
            .arg(root.path())
            .env("TELEMETRY_PORT", udp.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let mut run = Self {
            child,
            root,
            port: 0,
            udp,
        };
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Ok(text) = std::fs::read_to_string(run.root.path().join("logs/web_port.txt")) {
                if let Ok(port) = text.parse() {
                    run.port = port;
                    break;
                }
            }
            assert!(
                run.child.try_wait().unwrap().is_none(),
                "backend exited before readiness"
            );
            assert!(Instant::now() < deadline, "backend readiness timeout");
            thread::sleep(Duration::from_millis(20));
        }
        run
    }
    fn request(&self, method: &str, path: &str, body: &[u8], headers: &str) -> (u16, Vec<u8>) {
        let mut socket = TcpStream::connect(("127.0.0.1", self.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        write!(socket,"{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n",self.port,body.len()).unwrap();
        socket.write_all(body).unwrap();
        let mut bytes = Vec::new();
        socket.read_to_end(&mut bytes).unwrap();
        let separator = bytes.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        let head = std::str::from_utf8(&bytes[..separator]).unwrap();
        let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, bytes[separator + 4..].to_vec())
    }
    fn json(&self, method: &str, path: &str, value: Value) -> Value {
        let bytes = if method == "GET" {
            vec![]
        } else {
            serde_json::to_vec(&value).unwrap()
        };
        let (status, body) =
            self.request(method, path, &bytes, "Content-Type: application/json\r\n");
        assert_eq!(status, 200, "{path}: {}", String::from_utf8_lossy(&body));
        serde_json::from_slice(&body).unwrap()
    }
    fn ws(&self, path: &str) -> WebSocket<TcpStream> {
        let socket = TcpStream::connect(("127.0.0.1", self.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        client(format!("ws://127.0.0.1:{}{path}", self.port), socket)
            .unwrap()
            .0
    }
    fn stop(&mut self) {
        drop(self.child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(8);
        while self.child.try_wait().unwrap().is_none() {
            if Instant::now() >= deadline {
                let _ = self.child.kill();
                let _ = self.child.wait();
                panic!("stdin EOF did not stop backend");
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(self.child.wait().unwrap().success());
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}
fn packet() -> Vec<u8> {
    let mut bytes = vec![0; 324];
    bytes[..4].copy_from_slice(&1i32.to_le_bytes());
    bytes[4..8].copy_from_slice(&1234u32.to_le_bytes());
    for (index, value) in [(2, 8000f32), (4, 4200.0), (64, 20.0), (65, 120000.0)] {
        bytes[index * 4..index * 4 + 4].copy_from_slice(&value.to_le_bytes());
    }
    bytes[212..216].copy_from_slice(&42i32.to_le_bytes());
    bytes[315] = 255;
    bytes[319] = 3;
    bytes
}
#[test]
fn process_http_udp_websocket_persistence_and_shutdown_contract() {
    let mut run = Running::start(0);
    assert_eq!(
        run.json("GET", "/api/settings", Value::Null)["settings_schema_version"],
        2
    );
    let saved = run.json(
        "POST",
        "/api/settings",
        json!({"language":"en-us","units":{"speed":"mph"}}),
    );
    assert_eq!(saved["units"]["temperature"], "F");
    for path in ["/ws/telemetry", "/ws/telemetry/binary", "/ws/overlay"] {
        use tungstenite::client::IntoClientRequest;
        let mut request = format!("ws://127.0.0.1:{}{path}", run.port)
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("origin", "https://remote.invalid".parse().unwrap());
        let socket = TcpStream::connect(("127.0.0.1", run.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        match client(request, socket) {
            Err(tungstenite::HandshakeError::Failure(tungstenite::Error::Http(response))) => {
                assert_eq!(response.status(), 403, "origin check for {path}");
            }
            _ => panic!("foreign origin accepted for {path}"),
        }
    }
    let overlay = if fh6_backend::platform::HUD_ENABLED {
        let mut overlay = run.ws("/ws/overlay");
        let initial: Value =
            serde_json::from_str(overlay.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(initial["type"], "hud:config");
        for expected in ["hud:audio", "hud:media"] {
            let snapshot: Value =
                serde_json::from_str(overlay.read().unwrap().to_text().unwrap()).unwrap();
            assert_eq!(snapshot["type"], expected);
            assert_eq!(snapshot["data"]["success"], true);
        }
        Some(overlay)
    } else {
        None
    };
    let mut json_ws = run.ws("/ws/telemetry");
    let mut binary_ws = run.ws("/ws/telemetry/binary");
    let bytes = packet();
    let expected = fh6_backend::telemetry::parse_packet(&bytes).unwrap();
    let sender = UdpSocket::bind("127.0.0.1:0").unwrap();
    for _ in 0..3 {
        sender.send_to(&bytes, ("127.0.0.1", run.udp)).unwrap();
        thread::sleep(Duration::from_millis(30));
    }
    let received: Value = serde_json::from_str(json_ws.read().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(received, expected);
    assert_eq!(
        binary_ws.read().unwrap().into_data().as_ref(),
        fh6_backend::telemetry::pack_binary(&expected)
    );
    assert!(
        run.json("GET", "/api/diagnostics/telemetry-pipeline", Value::Null)["framesProcessed"]
            .as_u64()
            .unwrap()
            > 0
    );
    let started = run.json("POST", "/api/analysis/recorder/start", json!({}));
    let session = started["sessionId"].as_str().unwrap();
    for index in 0..5 {
        let mut sample = bytes.clone();
        sample[4..8].copy_from_slice(&(2000u32 + index * 120).to_le_bytes());
        sender.send_to(&sample, ("127.0.0.1", run.udp)).unwrap();
        thread::sleep(Duration::from_millis(30));
    }
    run.json("POST", "/api/analysis/recorder/stop", json!({}));
    let recorded = run.json(
        "GET",
        &format!("/api/analysis/sessions/{session}"),
        Value::Null,
    );
    assert!(
        !recorded.as_array().unwrap().is_empty(),
        "manual recording lost accepted UDP points"
    );
    assert_eq!(
        run.request(
            "POST",
            "/api/settings",
            b"[]",
            "Content-Type: application/json\r\n"
        )
        .0,
        422
    );
    let (_, forbidden) = run.request(
        "POST",
        "/api/settings",
        b"{}",
        "Content-Type: application/json\r\nOrigin: https://remote.invalid\r\n",
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&forbidden).unwrap()["detail"],
        "CSRF protection blocked request: Invalid Origin."
    );
    let boundary = "fh6-contract-boundary";
    let mut upload=format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\nContent-Type: text/csv\r\n\r\n").into_bytes();
    upload.extend_from_slice(include_bytes!("fixtures/motec.csv"));
    upload.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let (status, body) = run.request(
        "POST",
        "/api/analysis/import/motec",
        &upload,
        &format!("Content-Type: multipart/form-data; boundary={boundary}\r\n"),
    );
    assert_eq!(status, 200);
    let imported: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(imported["metadata"]["filename"], "test.csv");
    assert_eq!(imported["data"].as_array().unwrap().len(), 3);
    let (hud_status, hud_body) = run.request("GET", "/hud/s650_hmi/index.html", &[], "");
    if fh6_backend::platform::HUD_ENABLED {
        assert_eq!(hud_status, 200);
        assert!(hud_body.len() > 100);
    } else {
        assert_eq!(hud_status, 404);
        for path in [
            "/api/overlay/config",
            "/api/audio/devices",
            "/api/overlay/system_media",
        ] {
            assert_eq!(
                run.request("GET", path, &[], "").0,
                501,
                "unsupported HUD endpoint {path}"
            );
        }
        let socket = TcpStream::connect(("127.0.0.1", run.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        match client(format!("ws://127.0.0.1:{}/ws/overlay", run.port), socket) {
            Err(tungstenite::HandshakeError::Failure(tungstenite::Error::Http(response))) => {
                assert_eq!(response.status(), 501)
            }
            _ => panic!("HUD WebSocket must be unsupported in LAN builds"),
        }
        assert!(!run.root.path().join("hud_overlay").exists());
    }
    assert_eq!(
        run.json("GET", "/api/health", Value::Null)["status"],
        "ready"
    );
    let runtime = run.json("GET", "/api/runtime", Value::Null);
    assert_eq!(
        runtime["capabilities"]["hudOverlay"],
        fh6_backend::platform::HUD_ENABLED
    );
    assert_eq!(runtime["telemetry"]["port"], run.udp);
    assert!(runtime["telemetry"]["listenAddresses"]
        .as_array()
        .unwrap()
        .contains(&json!("127.0.0.1")));
    // The owning host can exit while the frontend still has WebSockets open.
    run.stop();
    drop((json_ws, binary_ws, overlay));
    assert!(UdpSocket::bind(("127.0.0.1", run.udp)).is_ok());
    let stored: Value =
        serde_json::from_slice(&std::fs::read(run.root.path().join("settings.json")).unwrap())
            .unwrap();
    assert_eq!(stored["language"], "en-us");
    let mut output = String::new();
    run.child
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert!(output.contains(&format!("\"port\":{}", run.port)));
}
#[test]
fn occupied_http_port_falls_back_to_a_reported_port() {
    let occupied = TcpListener::bind("127.0.0.1:0").unwrap();
    let preferred = occupied.local_addr().unwrap().port();
    let mut run = Running::start(preferred);
    assert_ne!(run.port, preferred);
    assert!(run.json("GET", "/api/settings", Value::Null).is_object());
    run.stop();
}

#[test]
fn every_legacy_http_endpoint_has_a_typed_response() {
    let mut run = Running::start(0);
    let inventory: Value =
        serde_json::from_str(include_str!("fixtures/http_inventory.json")).unwrap();
    let mut count = 0;
    for case in inventory["routes"].as_array().unwrap() {
        let method = case["method"].as_str().unwrap();
        let path = case["path"].as_str().unwrap();
        let body = if method == "POST" {
            serde_json::to_vec(&case["body"]).unwrap()
        } else {
            vec![]
        };
        let (status, bytes) = if path == "/api/analysis/import/motec" {
            let mut upload = b"--parity\r\nContent-Disposition: form-data; name=\"file\"; filename=\"parity.csv\"\r\nContent-Type: text/csv\r\n\r\n".to_vec();
            upload.extend_from_slice(include_bytes!("fixtures/motec.csv"));
            upload.extend_from_slice(b"\r\n--parity--\r\n");
            run.request(
                method,
                path,
                &upload,
                "Content-Type: multipart/form-data; boundary=parity\r\n",
            )
        } else {
            run.request(method, path, &body, "Content-Type: application/json\r\n")
        };
        count += 1;
        if !fh6_backend::platform::HUD_ENABLED
            && (path.starts_with("/api/overlay/")
                || path.starts_with("/api/audio/")
                || path.starts_with("/api/hud/")
                || path == "/api/diagnostics/overlay")
        {
            assert_eq!(
                status, 501,
                "{method} {path} must report unsupported without HUD"
            );
            continue;
        }
        if path == "/api/overlay/media/thumbnail" {
            assert!([200, 404].contains(&status), "{method} {path}: {status}");
            continue; // Hardware/artwork contents have a separate opt-in host test.
        }
        assert_eq!(
            u64::from(status),
            case["status"].as_u64().unwrap(),
            "{method} {path}: {}",
            String::from_utf8_lossy(&bytes)
        );
        if case["shape"] == "binary" {
            assert!(!bytes.is_empty(), "{method} {path}");
            continue;
        }
        let result: Value =
            serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("{method} {path}: {e}"));
        match case["shape"].as_str().unwrap() {
            "object" => {
                assert!(result.is_object(), "{method} {path}: {result}");
                for key in case["keys"].as_array().unwrap() {
                    assert!(
                        result.get(key.as_str().unwrap()).is_some(),
                        "{method} {path} missing {key}: {result}"
                    );
                }
            }
            "array" => assert!(result.is_array(), "{method} {path}: {result}"),
            _ => panic!("Unreviewed response shape for {path}"),
        }
    }
    println!("Validated {count} inherited HTTP method/path contracts");
    run.stop();
}

#[test]
fn mcp_http_uses_shared_persistence_and_honors_access_settings() {
    let mut run = Running::start(0);
    let rpc = |method: &str, params: Value| json!({"jsonrpc":"2.0","id":1,"method":method,"params":params});
    let initialized = run.json(
        "POST",
        "/mcp",
        rpc("initialize", json!({"protocolVersion":"2024-11-05"})),
    );
    assert_eq!(initialized["result"]["protocolVersion"], "2024-11-05");
    let notification =
        serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"notifications/initialized"})).unwrap();
    assert_eq!(
        run.request(
            "POST",
            "/mcp",
            &notification,
            "Content-Type: application/json\r\n"
        )
        .0,
        202
    );
    let tools = run.json("POST", "/mcp", rpc("tools/list", json!({})));
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 26);
    let preset = json!({"schemaVersion":"tuning-preset/v1","parameters":{"arb_front":3.0}});
    run.json("POST", "/api/tunings/247/road-test", preset.clone());
    let response = run.json("POST", "/mcp", rpc("tools/call", json!({"name":"get_tuning_preset","arguments":{"car_id":"247","save_name":"road-test"}})));
    let read: Value =
        serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(read, preset);
    let response = run.json(
        "POST",
        "/mcp",
        rpc(
            "resources/read",
            json!({"uri":"fh6://tuning/247/road-test"}),
        ),
    );
    let read: Value =
        serde_json::from_str(response["result"]["contents"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(read, preset);
    let sender = UdpSocket::bind("127.0.0.1:0").unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        sender.send_to(&packet(), ("127.0.0.1", run.udp)).unwrap();
        let response = run.json(
            "POST",
            "/mcp",
            rpc(
                "tools/call",
                json!({"name":"get_live_telemetry_snapshot","arguments":{}}),
            ),
        );
        let snapshot: Value =
            serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        if snapshot["source"] == "udp_memory_stream" {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "No live telemetry before checking access restriction"
        );
        thread::sleep(Duration::from_millis(20));
    }
    run.json("POST", "/api/settings", json!({"mcp_allow_live":false}));
    let response = run.json(
        "POST",
        "/mcp",
        rpc(
            "tools/call",
            json!({"name":"get_live_telemetry_snapshot","arguments":{}}),
        ),
    );
    let snapshot: Value =
        serde_json::from_str(response["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_ne!(snapshot["source"], "udp_memory_stream");
    assert_ne!(snapshot["status"], "live");
    run.json("POST", "/api/settings", json!({"mcp_enabled":false}));
    assert_eq!(
        run.json("GET", "/api/mcp/status", Value::Null)["enabled"],
        false
    );
    let ping = serde_json::to_vec(&rpc("ping", json!({}))).unwrap();
    assert_eq!(
        run.request("POST", "/mcp", &ping, "Content-Type: application/json\r\n")
            .0,
        403
    );
    run.stop();
}

#[test]
fn rust_agent_cli_discovers_backend_and_reads_live_data() {
    let mut run = Running::start(0);
    let cli = |args: &[&str]| -> Value {
        let executable = std::env::var_os("FH6_TEST_AGENT_EXE")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_fh6-agent").into());
        let output = Command::new(executable)
            .args(args)
            .args(["--json", "--data-dir"])
            .arg(run.root.path())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
        serde_json::from_slice(&output.stdout).unwrap()
    };
    let sender = UdpSocket::bind("127.0.0.1:0").unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        sender.send_to(&packet(), ("127.0.0.1", run.udp)).unwrap();
        let status = cli(&["status"]);
        if status["telemetry_receiving"] == true {
            assert_eq!(status["current_speed_kmh"], 72.0);
            assert_eq!(status["is_race_on"], true);
            assert_eq!(status["mcp_enabled"], true);
            assert_eq!(status["telemetry_udp_port"], run.udp);
            assert_eq!(
                status["backend_url"],
                format!("http://127.0.0.1:{}", run.port)
            );
            break;
        }
        assert!(
            Instant::now() < deadline,
            "CLI did not observe live UDP: {status}"
        );
    }
    assert_eq!(
        cli(&["telemetry", "snapshot"])["source"],
        "udp_memory_stream"
    );
    assert!(cli(&["telemetry", "diagnose"])
        .get("front_avg_temp_c")
        .is_some());
    assert_eq!(
        cli(&["solve", "full", "--car-id", "247", "--save", "cli-api"])["synced_to_backend"],
        true
    );
    let preset = run.json("GET", "/api/tunings/247/cli-api", Value::Null);
    assert_eq!(preset["schemaVersion"], "tuning-preset/v1");
    let response = cli(&[
        "mcp-call",
        "get_tuning_preset",
        "--args",
        r#"{"car_id":"247","save_name":"cli-api"}"#,
    ]);
    assert_eq!(response["status"], "ok");
    assert_eq!(response["result"], preset);
    run.stop();
}

/// Opt-in host acceptance. Requires an audible playback stream and a GSMTC
/// player with album artwork (e.g. Spotify). Never starts a GUI or controls music.
#[test]
#[cfg(all(windows, feature = "hud"))]
#[ignore = "requires active Windows audio and a GSMTC media session with artwork"]
fn windows_native_audio_media_and_removed_device_recovery() {
    let mut run = Running::start(0);
    let mut overlay = run.ws("/ws/overlay");
    let mut live_audio = 0;
    let mut live_media = None;
    let deadline = Instant::now() + Duration::from_secs(12);
    while (live_audio < 3 || live_media.is_none()) && Instant::now() < deadline {
        let message = match overlay.read() {
            Ok(message) => message,
            Err(tungstenite::Error::Io(error))
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                break
            }
            Err(error) => panic!("Native host WebSocket failed: {error}"),
        };
        let message: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
        if message["type"] == "hud:audio" && message["data"]["has_audio"] == true {
            let data = &message["data"];
            assert_eq!(data["source"], "wasapi");
            assert_eq!(data["spectrum"].as_array().unwrap().len(), 32);
            assert!(data["spectrum"]
                .as_array()
                .unwrap()
                .iter()
                .any(|n| n.as_f64().unwrap() > 0.0));
            live_audio += 1;
        }
        if message["type"] == "hud:media" && message["data"]["has_media"] == true {
            live_media = Some(message["data"].clone());
        }
    }
    assert!(
        live_audio >= 3,
        "No live WASAPI stream; start audio playback before this host test. Playback status: {}; native diagnostics: {}",
        live_media.as_ref().map(|v|&v["status"]).unwrap_or(&Value::Null),
        run.json("GET", "/api/diagnostics/overlay", Value::Null)["native"]
    );
    let media = live_media.expect("No GSMTC session; start Spotify before this host test");
    assert_eq!(media["source"], "winrt");
    assert!(!media["title"].as_str().unwrap().is_empty());
    assert!(!media["album_title"].as_str().unwrap().is_empty());
    let thumbnail = media["thumbnail_url"]
        .as_str()
        .expect("Expected artwork from the host player");
    let (status, bytes) = run.request("GET", thumbnail, &[], "");
    assert_eq!(status, 200);
    assert!(bytes.len() > 100);
    let hash = thumbnail.split("?v=").nth(1).unwrap();
    assert_eq!(
        run.request(
            "GET",
            thumbnail,
            &[],
            &format!("If-None-Match: \"{hash}\"\r\n")
        )
        .0,
        304
    );
    assert_eq!(
        run.request("GET", "/api/overlay/media/thumbnail?v=expired", &[], "")
            .0,
        404
    );

    run.json(
        "POST",
        "/api/audio/device",
        json!({"device_id":"removed-device-from-python-settings"}),
    );
    let deadline = Instant::now() + Duration::from_secs(6);
    let (mut recovered, mut diagnostics) = (false, Value::Null);
    while Instant::now() < deadline {
        diagnostics = run.json("GET", "/api/diagnostics/overlay", Value::Null);
        let spectrum = run.json("GET", "/api/overlay/audio_spectrum", Value::Null);
        if diagnostics["native"]["audio"]["usingDefaultFallback"] == true
            && spectrum["has_audio"] == true
        {
            recovered = true;
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    assert!(
        recovered,
        "Removed device did not recover through the default endpoint: {diagnostics}"
    );
    assert_eq!(diagnostics["native"]["audio"]["error"], Value::Null);
    println!("Windows acceptance: live WASAPI + GSMTC album metadata + {} artwork bytes; removed device recovered", bytes.len());
    drop(overlay);
    run.stop();
}
