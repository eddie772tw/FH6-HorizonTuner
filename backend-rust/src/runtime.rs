use crate::{app::App, config_service::lock, network, telemetry};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    io::Read,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tokio::{
    net::{TcpListener, UdpSocket},
    sync::watch,
};

#[derive(Debug)]
pub struct Options {
    pub data_dir: PathBuf,
    pub owned: bool,
    pub development: bool,
    pub port: u16,
}
impl Options {
    pub fn parse() -> Result<Self, String> {
        let mut arguments = std::env::args().skip(1);
        let mut development = false;
        let mut data_dir = None;
        let mut port = 8001;
        while let Some(argument) = arguments.next() {
            match argument.as_str() {
                "--dev" => development = true,
                "--data-dir" => {
                    data_dir = Some(PathBuf::from(
                        arguments.next().ok_or("--data-dir requires a path")?,
                    ))
                }
                "--port" => {
                    port = arguments
                        .next()
                        .ok_or("--port requires a number")?
                        .parse()
                        .map_err(|_| "Invalid HTTP port")?
                }
                _ => return Err(format!("Unknown argument: {argument}")),
            }
        }
        let owned = data_dir.is_some();
        let data_dir = data_dir.unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend")
            } else {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_owned()))
                    .unwrap_or_else(|| PathBuf::from("."))
            }
        });
        Ok(Self {
            data_dir,
            owned,
            development,
            port: if development { 8001 } else { port },
        })
    }
}
pub async fn bind_http(port: u16, fallback: bool) -> std::io::Result<TcpListener> {
    match TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await {
        Ok(listener) => Ok(listener),
        Err(_) if fallback => TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await,
        Err(error) => Err(error),
    }
}

pub async fn bind_companion_lan(port: u16) -> std::io::Result<TcpListener> {
    match TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
        Ok(listener) => Ok(listener),
        Err(_) => TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).await,
    }
}
pub fn local_addresses() -> BTreeSet<Ipv4Addr> {
    let mut addresses = BTreeSet::from([Ipv4Addr::LOCALHOST]);
    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for interface in interfaces {
            if let IpAddr::V4(ip) = interface.ip() {
                if !ip.is_unspecified() && !ip.is_broadcast() && !ip.is_link_local() {
                    addresses.insert(ip);
                }
            }
        }
    }
    if let Ok(ip) = std::env::var("TELEMETRY_IP")
        .unwrap_or_default()
        .parse::<Ipv4Addr>()
    {
        if !ip.is_unspecified() {
            addresses.insert(ip);
        }
    }
    addresses
}
fn bind_udp(port: u16) -> Result<Vec<UdpSocket>, String> {
    let mut sockets = Vec::new();
    let mut errors = Vec::new();
    for ip in local_addresses() {
        let result = (|| -> std::io::Result<UdpSocket> {
            let socket = socket2::Socket::new(
                socket2::Domain::IPV4,
                socket2::Type::DGRAM,
                Some(socket2::Protocol::UDP),
            )?;
            socket.set_reuse_address(true)?;
            socket.set_recv_buffer_size(2 * 1024 * 1024)?;
            #[cfg(windows)]
            {
                use std::os::windows::io::AsRawSocket;
                use windows::Win32::Networking::WinSock::{WSAIoctl, SIO_UDP_CONNRESET, SOCKET};
                let disabled = 0u32;
                let mut returned = 0u32;
                // A transient ICMP port-unreachable must not invalidate UDP input.
                unsafe {
                    WSAIoctl(
                        SOCKET(socket.as_raw_socket() as usize),
                        SIO_UDP_CONNRESET,
                        Some((&disabled as *const u32).cast()),
                        4,
                        None,
                        0,
                        &mut returned,
                        None,
                        None,
                    );
                }
            }
            socket.set_nonblocking(true)?;
            socket.bind(&SocketAddr::from((ip, port)).into())?;
            UdpSocket::from_std(socket.into())
        })();
        match result {
            Ok(socket) => sockets.push(socket),
            Err(error) => errors.push(format!("{ip}:{port}: {error}")),
        }
    }
    if sockets.is_empty() {
        Err(format!(
            "Unable to bind telemetry UDP: {}",
            errors.join(", ")
        ))
    } else {
        Ok(sockets)
    }
}
async fn receive_udp(
    socket: UdpSocket,
    app: Arc<App>,
    sender: mpsc::SyncSender<Value>,
    mut settings: watch::Receiver<Value>,
    mut stop: watch::Receiver<bool>,
) {
    let forwarding = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.ok();
    let mut bytes = vec![0; 65536];
    loop {
        tokio::select! {
            _=stop.changed()=>break,
            received=socket.recv_from(&mut bytes)=>{
                let (length,source)=match received{Ok(value)=>value,Err(_)=>{lock(&app.metrics).reject("socket_error");continue;}};
                lock(&app.metrics).datagram(length);
                let settings=settings.borrow_and_update().clone();
                if settings["forward_telemetry_enabled"]==true{
                    let host=settings["forward_telemetry_host"].as_str().unwrap_or("127.0.0.1");let port=settings["forward_telemetry_port"].as_u64().and_then(|p|u16::try_from(p).ok()).unwrap_or(5300);
                    // Existing forwarding deliberately permits localhost destinations only.
                    if matches!(host,"localhost"|"127.0.0.1")&&socket.local_addr().ok().is_none_or(|addr|addr.port()!=port){if let Some(forwarding)=&forwarding{let _=forwarding.try_send_to(&bytes[..length],SocketAddr::from((Ipv4Addr::LOCALHOST,port)));}}
                }
                match telemetry::parse_packet(&bytes[..length]){Ok(frame)=>{
                    let mut metrics=lock(&app.metrics);metrics.parsed(&frame,source.to_string());
                    if sender.try_send(frame).is_err(){metrics.dropped(1,"input_queue_full");}else{metrics.queue_depth+=1;metrics.queue_peak=metrics.queue_peak.max(metrics.queue_depth);}
                },Err(reason)=>lock(&app.metrics).reject(&reason)}
            }
        }
    }
}
fn overlay_worker(app: Arc<App>, stop: Arc<AtomicBool>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut last_audio = Value::Null;
        let mut last_media = Value::Null;
        let mut media_at = Instant::now() - Duration::from_secs(2);
        while !stop.load(Ordering::Acquire) {
            if app.config.overlay.receiver_count() > 0 {
                let started = Instant::now();
                let audio = app.native.audio_spectrum();
                let publish = audio["sequence"] != last_audio["sequence"]
                    || audio["state"] != last_audio["state"];
                {
                    let mut metrics = lock(&app.metrics);
                    *metrics
                        .overlay_counters
                        .entry("audioPolls".into())
                        .or_default() += 1;
                    *metrics
                        .overlay_counters
                        .entry(
                            if publish {
                                "audioPublishes"
                            } else {
                                "audioDuplicates"
                            }
                            .into(),
                        )
                        .or_default() += 1;
                    metrics.overlay_duration(
                        "audioSnapshot",
                        started.elapsed().as_secs_f64() * 1000.0,
                    );
                }
                if publish {
                    let _ = app
                        .config
                        .overlay
                        .send(json!({"type":"hud:audio","data":audio}));
                    last_audio = audio;
                }
                if media_at.elapsed() >= Duration::from_secs(1) {
                    let started = Instant::now();
                    let media = app.native.system_media();
                    let publish = media != last_media;
                    {
                        let mut metrics = lock(&app.metrics);
                        *metrics
                            .overlay_counters
                            .entry("mediaPolls".into())
                            .or_default() += 1;
                        *metrics
                            .overlay_counters
                            .entry(
                                if publish {
                                    "mediaPublishes"
                                } else {
                                    "mediaDuplicates"
                                }
                                .into(),
                            )
                            .or_default() += 1;
                        metrics.overlay_duration(
                            "mediaSnapshot",
                            started.elapsed().as_secs_f64() * 1000.0,
                        );
                    }
                    if publish {
                        let _ = app
                            .config
                            .overlay
                            .send(json!({"type":"hud:media","data":media}));
                        last_media = media;
                    }
                    media_at = Instant::now();
                }
            } else {
                if !last_audio.is_null() {
                    app.native.stop_audio_spectrum();
                }
                last_audio = Value::Null;
                last_media = Value::Null;
            }
            thread::sleep(Duration::from_millis(33));
        }
    })
}
pub async fn run(options: Options) -> Result<(), String> {
    let listener = bind_http(options.port, !options.development)
        .await
        .map_err(|e| format!("HTTP {} is unavailable: {e}", options.port))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let app = App::new(&options.data_dir).map_err(|e| e.to_string())?;
    app.companion.set_port(port);
    let companion_port = std::env::var("COMPANION_LAN_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8002);
    let companion_listener = match bind_companion_lan(companion_port).await {
        Ok(listener) => {
            if let Ok(address) = listener.local_addr() {
                app.companion.set_lan_port(Some(address.port()));
            }
            Some(listener)
        }
        Err(error) => {
            crate::diagnostics::write_log(
                &options.data_dir,
                "ERROR",
                &format!("Companion LAN listener unavailable: {error}"),
            );
            None
        }
    };
    let settings = app.config.settings();
    let udp_port = std::env::var("TELEMETRY_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .or_else(|| {
            settings["telemetry_port"]
                .as_u64()
                .and_then(|p| u16::try_from(p).ok())
        })
        .unwrap_or(8000);
    let initial_sockets = bind_udp(udp_port).map_err(|error| {
        crate::diagnostics::write_log(&options.data_dir, "ERROR", &error);
        error
    })?;
    let port_file = options.data_dir.join("logs/web_port.txt");
    let temporary = port_file.with_extension("txt.tmp");
    std::fs::write(&temporary, port.to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &port_file).map_err(|e| e.to_string())?;
    let (stop_signal, stop_rx) = watch::channel(false);
    let stopping = Arc::new(AtomicBool::new(false));
    if options.owned {
        let stop = stop_signal.clone();
        thread::spawn(move || {
            let mut ignored = Vec::new();
            let _ = std::io::stdin().read_to_end(&mut ignored);
            stop.send_replace(true);
        });
    }
    let (sender, receiver) = mpsc::sync_channel::<Value>(10);
    let worker_app = app.clone();
    let worker = thread::spawn(move || {
        let mut maintained = Instant::now();
        // The UDP task owns every sender. Drain all accepted frames after it
        // stops, then flush the recorder on channel disconnection.
        loop {
            match receiver.recv_timeout(Duration::from_millis(50)) {
                Ok(frame) => {
                    let mut metrics = lock(&worker_app.metrics);
                    metrics.queue_depth = metrics.queue_depth.saturating_sub(1);
                    drop(metrics);
                    worker_app.process(frame);
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if maintained.elapsed() >= Duration::from_millis(250) {
                worker_app.maintain();
                maintained = Instant::now();
            }
        }
        worker_app.shutdown();
    });
    let overlay = overlay_worker(app.clone(), stopping.clone());
    app.native.discord_start();
    let udp_app = app.clone();
    let udp_stop = stop_rx.clone();
    let mut config_updates = app.config.settings_changed.subscribe();
    let udp = tokio::spawn(async move {
        let mut current_port = config_updates.borrow()["telemetry_port"]
            .as_u64()
            .and_then(|p| u16::try_from(p).ok())
            .unwrap_or(8000);
        let mut sockets = initial_sockets;
        let mut stop = udp_stop;
        let mut tasks = Vec::new();
        loop {
            for socket in sockets.drain(..) {
                tasks.push(tokio::spawn(receive_udp(
                    socket,
                    udp_app.clone(),
                    sender.clone(),
                    config_updates.clone(),
                    stop.clone(),
                )));
            }
            tokio::select! {_=stop.changed()=>break,changed=config_updates.changed()=>{if changed.is_err(){break;}let next=config_updates.borrow().get("telemetry_port").and_then(Value::as_u64).and_then(|p|u16::try_from(p).ok());if let Some(next)=next.filter(|p|*p!=current_port){for task in tasks.drain(..){task.abort();let _=task.await;}match bind_udp(next){Ok(bound)=>{sockets=bound;current_port=next;},Err(error)=>eprintln!("{error}")}}}}
        }
        for task in tasks {
            task.abort();
            let _ = task.await;
        }
    });
    crate::diagnostics::write_log(
        &options.data_dir,
        "INFO",
        &format!(
            "Rust backend ready; HTTP {port}, Companion LAN {:?}, UDP {udp_port}",
            app.companion.get_lan_port()
        ),
    );
    println!(
        "FH6_BACKEND_READY:{}",
        json!({"port":port,"port_fallback":port!=8001})
    );
    let mut shutdown = stop_rx;
    let companion_server = companion_listener.map(|listener| {
        let lan_app = app.clone();
        let mut lan_shutdown = shutdown.clone();
        tokio::spawn(async move {
            axum::serve(
                listener,
                network::lan_router(lan_app.clone(), lan_app.companion.clone()),
            )
            .with_graceful_shutdown(async move {
                let _ = lan_shutdown.changed().await;
            })
            .await
        })
    });
    let stop = stop_signal.clone();
    let server =
        axum::serve(listener, network::router(app.clone())).with_graceful_shutdown(async move {
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=shutdown.changed()=>{}}
            stop.send_replace(true);
        });
    let result = server.await.map_err(|e| e.to_string());
    stop_signal.send_replace(true);
    if let Some(companion_server) = companion_server {
        match companion_server.await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => eprintln!("Companion LAN server failed: {error}"),
            Err(error) => eprintln!("Companion LAN task failed: {error}"),
        }
    }
    let _ = udp.await;
    stopping.store(true, Ordering::Release);
    let _ = worker.join();
    let _ = overlay.join();
    crate::diagnostics::write_log(
        &options.data_dir,
        "INFO",
        "Backend stopped and recording state flushed",
    );
    result
}
