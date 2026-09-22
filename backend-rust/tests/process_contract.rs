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
    let mut overlay = run.ws("/ws/overlay");
    let initial: Value = serde_json::from_str(overlay.read().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(initial["type"], "hud:config");
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
    assert!(
        run.request("GET", "/hud/s650_hmi/index.html", &[], "")
            .1
            .len()
            > 100
    );
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
