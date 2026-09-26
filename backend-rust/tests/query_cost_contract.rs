use fh6_backend::{app::App, mcp::McpService};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::{collections::HashSet, sync::Arc};

fn app() -> (Arc<App>, tempfile::TempDir) {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    (app, root)
}

#[test]
fn mcp_session_queries_keep_order_lap_stride_raw_legacy_and_projection_semantics() {
    let (app, root) = app();
    for (id, start) in [("older", 1.0), ("newer", 2.0), ("newest", 3.0)] {
        app.database
            .create_session(id, 1, id, 1, 700, start)
            .unwrap();
    }
    let points = (0..6)
        .map(|i| {
            json!({
                "LapNumber": if i % 2 == 0 { 1 } else { 2 },
                "time": i as f64,
                "SpeedMetersPerSecond": 10.0 + i as f64,
                "PowerWatts": 1000.0 + i as f64,
                "TorqueNewtons": 200.0 + i as f64,
                "extra": format!("raw-{i}")
            })
        })
        .collect::<Vec<Value>>();
    app.database.insert_points_batch("newest", &points).unwrap();

    // Create a gap in row IDs and turn one chosen row into a legacy record.
    let conn = Connection::open(root.path().join("telemetry_sessions.db")).unwrap();
    // Persistence canonicalizes input; inject an extension into already stored
    // raw JSON to verify that reads preserve it without schema reconstruction.
    conn.execute(
        "UPDATE telemetry_channels SET raw_json=json_set(raw_json,'$.extra','raw-' || (id-1))",
        [],
    )
    .unwrap();
    conn.execute("DELETE FROM telemetry_channels WHERE id=2", [])
        .unwrap();
    conn.execute("UPDATE telemetry_channels SET raw_json=NULL WHERE id=5", [])
        .unwrap();

    let service = McpService::new(&app);
    let all = service.session_points("newest", None, 1, None);
    assert_eq!(all.len(), 5);
    assert_eq!(all[0]["extra"], "raw-0");
    assert_eq!(all[1]["extra"], "raw-2");
    assert_eq!(all[2]["extra"], "raw-3");
    assert_eq!(all[3]["sourceSchema"], "legacy-sqlite/unknown");
    assert_eq!(all[4]["extra"], "raw-5");

    // Lap filtering happens before stride: lap 1 rows are IDs 1, 3, and 5;
    // every second filtered row selects IDs 1 and 5 despite the ID gap.
    let sampled = service.session_points("newest", Some(1), 2, None);
    assert_eq!(sampled.len(), 2);
    assert_eq!(sampled[0]["extra"], "raw-0");
    assert_eq!(sampled[0]["SpeedMetersPerSecond"], 10.0);
    assert_eq!(sampled[1]["sourceSchema"], "legacy-sqlite/unknown");
    assert_eq!(sampled[1]["SpeedMetersPerSecond"], 14.0);
    assert_eq!(sampled[1]["Power"], sampled[1]["PowerWatts"]);
    assert_eq!(sampled[1]["Torque"], sampled[1]["TorqueNewtons"]);

    let channels = HashSet::from(["time".to_owned(), "SpeedMetersPerSecond".to_owned()]);
    let projected = app
        .database
        .get_telemetry_points_filtered("newest", Some(1), 2, Some(&channels))
        .unwrap();
    assert_eq!(
        projected,
        vec![
            json!({"time":0.0,"SpeedMetersPerSecond":10.0}),
            json!({"time":4.0,"SpeedMetersPerSecond":14.0})
        ]
    );
    let empty = HashSet::new();
    assert_eq!(
        app.database
            .get_telemetry_points_filtered("newest", None, 3, Some(&empty))
            .unwrap(),
        vec![json!({}), json!({})]
    );

    assert_eq!(
        service
            .list_race_sessions(2, 1)
            .iter()
            .map(|s| s["session_id"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["newer", "older"]
    );
    assert_eq!(service.list_race_sessions(0, 0), Vec::<Value>::new());
    assert_eq!(
        service.session_summary("newest").unwrap()["session"]["session_id"],
        "newest"
    );
    assert!(service.session_summary("missing").is_none());
    assert_eq!(
        app.database
            .get_latest_telemetry_point("newest")
            .unwrap()
            .unwrap()["LapNumber"],
        2
    );
    conn.execute("UPDATE telemetry_channels SET raw_json='17' WHERE id=6", [])
        .unwrap();
    let scalar = service.session_points("newest", None, 1, None);
    assert_eq!(scalar.last().unwrap(), &json!(17));
    let projected = service.session_points("newest", None, 1, Some(&vec![]));
    assert_eq!(projected.last().unwrap(), &Value::Null);

    // Equal start times must page in the same order as the unpaged query on
    // the bundled SQLite engine. No new timestamp index changes its tie order.
    for id in ["tie-b", "tie-a", "tie-c"] {
        app.database
            .create_session(id, 1, id, 1, 700, 10.0)
            .unwrap();
    }
    let ordered = app.database.list_all_sessions().unwrap();
    assert_eq!(service.list_race_sessions(2, 1), ordered[1..3]);
    assert_eq!(
        app.database.session_count_and_latest().unwrap(),
        (6, ordered[0]["session_id"].as_str().map(str::to_owned))
    );

    // The sampling query decodes only chosen rows. A type-corrupt skipped
    // record cannot poison otherwise readable samples; the complete query
    // still reports its decoding error (the public MCP wrapper returns []).
    conn.execute(
        "UPDATE telemetry_channels SET raw_json=x'FF' WHERE id=3",
        [],
    )
    .unwrap();
    assert!(app.database.get_telemetry_points("newest", None).is_err());
    assert_eq!(service.session_points("newest", None, 3, None).len(), 2);
}

#[test]
fn capture_summary_and_window_keep_defaults_and_projection_for_scalar_samples() {
    let (app, root) = app();
    let dir = root.path().join("captures");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("boundary.json"),
        serde_json::to_vec(&json!({
            "schemaVersion": "tuning-capture/v1",
            "captureId": "boundary",
            "metadata": {"carOrdinal": 1, "installedParts": {}, "surface": "road"},
            "samples": [
                {"timestampMs": 0, "speedKmh": 5.0, "keep": "first"},
                7,
                {"timestampMs": 10, "speedKmh": 15.0, "keep": "last"}
            ]
        }))
        .unwrap(),
    )
    .unwrap();

    let service = McpService::new(&app);
    let summary = service.capture_summary("boundary").unwrap();
    assert_eq!(summary["summary"]["sample_count"], 3);
    assert_eq!(summary["summary"]["duration_sec"], 0.01);
    assert_eq!(summary["summary"]["avg_speed_kmh"], 6.7);
    let channels = vec![json!("timestampMs")];
    assert_eq!(
        service.capture_window("boundary", 0, Some(10), Some(&channels), 3),
        vec![
            json!({"timestampMs":0}),
            json!({}),
            json!({"timestampMs":10})
        ]
    );
    let empty = Vec::new();
    assert_eq!(
        service.capture_window("boundary", 0, Some(10), Some(&empty), 3),
        vec![json!({}), json!({}), json!({})]
    );

    std::fs::write(
        dir.join("missing-samples.json"),
        serde_json::to_vec(
            &json!({"schemaVersion":"tuning-capture/v1","captureId":"missing-samples"}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        service.capture_summary("missing-samples").unwrap()["summary"]["sample_count"],
        0
    );
}
