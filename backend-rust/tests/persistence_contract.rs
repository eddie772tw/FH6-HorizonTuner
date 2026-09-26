use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
};
use serde_json::{json, Value};
use std::{sync::mpsc, time::Duration};

fn request(app: &App, path: &str) -> Value {
    let response = app
        .request(ApiRequest {
            method: "POST".into(),
            path: path.into(),
            query: Default::default(),
            headers: Default::default(),
            body: vec![],
            upload_filename: None,
        })
        .unwrap();
    assert_eq!(response.status, 200);
    serde_json::from_slice(&response.body).unwrap()
}

#[test]
fn locked_database_does_not_block_live_frames_and_stop_drains_all_samples() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let session = request(&app, "/api/analysis/recorder/start")["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let database = rusqlite::Connection::open(root.path().join("telemetry_sessions.db")).unwrap();
    database.execute_batch("BEGIN IMMEDIATE").unwrap();
    let processing = app.clone();
    let (sent, completed) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        for i in 1..=120 {
            processing.process(
                json!({"TimestampMS":i*100,"IsRaceOn":1,"CurrentRaceTime":i as f64*0.1,
                "LapNumber":0,"CarOrdinal":0,"SpeedMetersPerSecond":20.0}),
            );
        }
        sent.send(()).unwrap();
    });
    // A bounded watchdog only: SQLite remains locked until live processing has finished.
    let published_while_locked = completed.recv_timeout(Duration::from_secs(3)).is_ok();
    database.execute_batch("ROLLBACK").unwrap();
    thread.join().unwrap();
    assert!(
        published_while_locked,
        "live processing waited for database I/O"
    );
    assert_eq!(app.live().unwrap()["TimestampMS"], 12000);
    request(&app, "/api/analysis/recorder/stop");
    let points = app.database.get_telemetry_points(&session, None).unwrap();
    assert_eq!(points.len(), 120);
    let metadata = app.database.get_session_metadata(&session).unwrap();
    assert_eq!(metadata["state"], "finalized");
    assert_ne!(metadata["incompletePersistence"], true);
    app.shutdown();
}

#[test]
fn clear_finalizes_accepted_recordings_without_exhausting_reserved_queue_slots() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    for _ in 0..70 {
        let started = request(&app, "/api/analysis/recorder/start");
        request(&app, "/api/analysis/clear");
        let metadata = app
            .database
            .get_session_metadata(started["sessionId"].as_str().unwrap())
            .unwrap();
        assert_eq!(metadata["state"], "finalized");
        assert_eq!(metadata["endReason"], "manual-clear");
    }
    app.shutdown();
}

#[test]
fn road_identity_change_queues_summary_until_database_unblocks() {
    use fh6_backend::{
        road::{RoadService, RoadStore},
        telemetry::TelemetryStore,
    };
    use std::sync::Arc;
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("telemetry.sqlite");
    let database = Arc::new(TelemetryStore::new(&path).unwrap());
    let store = RoadStore::new(path.to_string_lossy()).unwrap();
    let mut service = RoadService::new(database, store.clone());
    let frame = |ms, ordinal| {
        json!({"TimestampMS":ms,"IsRaceOn":1,"CurrentRaceTime":ms as f64/1000.0,
        "CarOrdinal":ordinal,"CarPerformanceIndex":700,"DrivetrainType":1,
        "CarClass":3,"SpeedMetersPerSecond":20.0})
    };
    service.observe(&frame(100, 42));
    service.observe(&frame(200, 42));
    let workflow = service.create(json!({"identity":{"ordinal":42,"performanceIndex":700,"drivetrain":1},
        "carName":"Test","event":{"name":"Road","format":"sprint","driverAssists":"unknown","conditions":"unknown"}})).unwrap();
    let id = workflow["id"].as_str().unwrap();
    let setup = store
        .list(Some(id), Some("setup"), false)
        .unwrap()
        .remove(0);
    service
        .start_run(
            id,
            &json!({"setupId":setup["id"],"settingsConfirmed":true,"otherSettings":"unchanged",
        "tires":"unchanged","conditions":"unchanged","driverAssists":"unchanged"}),
        )
        .unwrap();
    let blocker = rusqlite::Connection::open(&path).unwrap();
    blocker.execute_batch("BEGIN IMMEDIATE").unwrap();
    let (sent, completed) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        service.observe(&frame(300, 42));
        service.maintain();
        service.observe(&frame(400, 43));
        sent.send(service.live()).unwrap();
        service
    });
    let live = completed.recv_timeout(Duration::from_secs(3));
    blocker.execute_batch("ROLLBACK").unwrap();
    let mut service = worker.join().unwrap();
    assert_eq!(
        live.expect("identity transition waited for SQLite")["state"],
        "idle"
    );
    service.shutdown();
    let summaries = store.list(Some(id), Some("summary"), false).unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["observations"]["sampleCount"], 1);
    assert_eq!(summaries[0]["recording"]["endReason"], "identity-changed");
    assert_eq!(service.persistence_metrics()["pendingWork"], 0);
}
