use axum::http::HeaderMap;
use fh6_backend::motec;
use fh6_backend::telemetry::{
    collect_dyno_sample, decoded_point, pack_binary, parse_packet, ActiveRoute, DragRecorder,
    DynoQualityGate, DynoQualityGateRegistry, RaceRecorder, RaceRecorderConfig, RecorderCommand,
    TelemetryStore,
};
use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
};
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeMap;

fn set_i32(b: &mut [u8], index: usize, v: i32) {
    b[index * 4..index * 4 + 4].copy_from_slice(&v.to_le_bytes())
}
fn set_u32(b: &mut [u8], index: usize, v: u32) {
    b[index * 4..index * 4 + 4].copy_from_slice(&v.to_le_bytes())
}
fn set_f32(b: &mut [u8], index: usize, v: f32) {
    b[index * 4..index * 4 + 4].copy_from_slice(&v.to_le_bytes())
}
fn fixture(name: &str) -> Value {
    let source = match name {
        "parser.json" => include_str!("../../tests/fixtures/telemetry/parser.json"),
        "binary.json" => include_str!("../../tests/fixtures/telemetry/binary.json"),
        "contract.json" => include_str!("../../tests/fixtures/telemetry/contract.json"),
        "dyno.json" => include_str!("../../tests/fixtures/telemetry/dyno.json"),
        "drag.json" => include_str!("../../tests/fixtures/telemetry/drag.json"),
        "race.json" => include_str!("../../tests/fixtures/telemetry/race.json"),
        "sqlite.json" => include_str!("../../tests/fixtures/telemetry/sqlite.json"),
        _ => panic!("unknown telemetry fixture: {name}"),
    };
    serde_json::from_str(source).unwrap()
}
fn b64(s: &str) -> Vec<u8> {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut n = 0u32;
    let mut bits = 0;
    for &c in bytes {
        if c == b'=' {
            break;
        }
        let v = A.iter().position(|x| *x == c).unwrap() as u32;
        n = (n << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((n >> bits) & 255) as u8)
        }
    }
    out
}
fn assert_json_close(actual: &Value, expected: &Value, path: &str) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            let x = a.as_f64().unwrap();
            let y = b.as_f64().unwrap();
            assert!(
                (x - y).abs() <= 1e-4_f64.max(y.abs() * 1e-5),
                "{}: {} != {}",
                path,
                x,
                y
            )
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{} length", path);
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                assert_json_close(x, y, &format!("{}[{}]", path, i))
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len(), "{} keys", path);
            for (k, y) in b {
                assert!(a.contains_key(k), "{}.{} missing", path, k);
                assert_json_close(&a[k], y, &format!("{}.{}", path, k))
            }
        }
        _ => assert_eq!(actual, expected, "{}", path),
    }
}

#[test]
fn parser_accepts_full_packet_and_preserves_units() {
    let mut b = vec![0u8; 324];
    set_i32(&mut b, 0, 1);
    set_u32(&mut b, 1, 1234);
    set_f32(&mut b, 2, 8000.0);
    set_f32(&mut b, 4, 3500.0);
    set_f32(&mut b, 64, 20.0);
    set_f32(&mut b, 65, 7457.0);
    set_f32(&mut b, 72, 0.75);
    b[315] = 255;
    b[319] = 3;
    let v = parse_packet(&b).unwrap();
    assert_eq!(v["TelemetrySchema"], "forza-data-out/fh6-324-v2");
    assert_eq!(v["TimestampMS"], 1234);
    assert_eq!(v["SpeedMetersPerSecond"], 20.0);
    assert_eq!(v["AccelInput"], 255);
    assert_eq!(v["Gear"], 3);
}
#[test]
fn parser_matches_generated_python_full_and_legacy_fixtures() {
    let f = fixture("parser.json");
    for kind in ["full", "legacy"] {
        let row = &f[kind];
        let actual = parse_packet(&b64(row["bytes_base64"].as_str().unwrap())).unwrap();
        assert_json_close(&actual, &row["expected"], kind);
    }
}
#[test]
fn binary_encoder_matches_python_oracle_bytes() {
    let f = fixture("binary.json");
    let actual = pack_binary(&f["input"]);
    assert_eq!(actual, b64(f["bytes_base64"].as_str().unwrap()));
}
#[test]
fn decoded_contract_matches_python_variants() {
    let f = fixture("contract.json");
    for row in f["variants"].as_array().unwrap() {
        let actual = decoded_point(&row["input"]);
        assert_json_close(&actual, &row["expected"], "decoded_point");
    }
}
#[test]
fn parser_has_python_rejection_reasons() {
    assert_eq!(parse_packet(&[0; 3]).unwrap_err(), "too_short");
    let mut b = vec![0u8; 232];
    assert_eq!(parse_packet(&b).unwrap_err(), "not_racing");
    set_i32(&mut b, 0, 1);
    assert!(parse_packet(&b).is_ok());
    assert_eq!(parse_packet(&vec![0; 233]).unwrap_err(), "partial_schema");
    let mut full = vec![0u8; 324];
    set_i32(&mut full, 0, 1);
    set_u32(&mut full, 1, 1);
    set_f32(&mut full, 72, f32::NAN);
    assert_eq!(parse_packet(&full).unwrap_err(), "non_finite");
    assert_eq!(
        parse_packet(&vec![0; 325]).unwrap_err(),
        "unsupported_length"
    );
}
#[test]
fn pack_binary_is_fixed_128_and_converts_python_units() {
    let v = json!({"IsRaceOn":1,"CurrentEngineRpm":3000,"SpeedMetersPerSecond":10,"PowerWatts":745.7,"Boost":6894.75729,"AccelerationX":9.81,"Yaw":1.0,"TireSlipAngle":[1,0,0,0]});
    let b = pack_binary(&v);
    assert_eq!(b.len(), 128);
    assert_eq!(i32::from_le_bytes(b[0..4].try_into().unwrap()), 1);
    assert!((f32::from_le_bytes(b[16..20].try_into().unwrap()) - 36.0).abs() < 0.001);
    assert!((f32::from_le_bytes(b[104..108].try_into().unwrap()) - 57.29578).abs() < 0.001)
}
#[test]
fn decoded_contract_preserves_missing_channels_as_null_and_aliases() {
    let v = decoded_point(&json!({"SpeedMetersPerSecond":10,"accel_pct":50}));
    assert_eq!(v["SpeedMetersPerSecond"], 10.0);
    assert!(v["PowerWatts"].is_null());
    assert_eq!(v["AccelInput"], 127.5);
    assert_eq!(v["accel_pct"], 50.0);
    assert_eq!(v["SuspTravel"], v["NormalizedSuspensionTravel"])
}
#[test]
fn drag_recorder_observes_launch_and_finishes_on_release() {
    let mut r = DragRecorder::default();
    r.prepare();
    r.record(&json!({"SpeedMetersPerSecond":0.1,"Gear":1,"AccelInput":255,"TimestampMS":1000,"IsRaceOn":1,"CarOrdinal":42}));
    assert_eq!(r.status(), "recording");
    r.record(&json!({"SpeedMetersPerSecond":5.0,"Gear":1,"AccelInput":0,"TimestampMS":2000,"IsRaceOn":1}));
    r.record(&json!({"SpeedMetersPerSecond":5.0,"Gear":1,"AccelInput":0,"TimestampMS":3000,"IsRaceOn":1}));
    assert_eq!(r.status(), "finished");
    r.record(&json!({"SpeedMetersPerSecond":5.0,"Gear":1,"AccelInput":0,"TimestampMS":4001,"IsRaceOn":1}));
    assert_eq!(r.status(), "finished");
    assert!(r.analysis().get("drivetrain").is_some())
}
#[test]
fn drag_context_survives_clear_and_uses_the_launched_car_name() {
    fn request(app: &App, method: &str, path: &str) -> Value {
        let response = app
            .request(ApiRequest {
                method: method.to_owned(),
                path: path.to_owned(),
                query: BTreeMap::new(),
                headers: HeaderMap::new(),
                body: vec![],
                upload_filename: None,
            })
            .unwrap();
        assert_eq!(response.status, 200, "{method} {path}");
        serde_json::from_slice(&response.body).unwrap()
    }

    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let cars = app.config.car_database.as_object().unwrap();
    let cars: Vec<(i64, String)> = cars
        .iter()
        .filter_map(|(id, car)| {
            let ordinal = id.parse().ok()?;
            let name = car.get("display_name")?.as_str()?;
            (!name.is_empty() && name != format!("Car {ordinal}")).then(|| (ordinal, name.into()))
        })
        .take(2)
        .collect();
    assert_eq!(cars.len(), 2, "expected two named cars in bundled database");

    for (id, name) in cars {
        request(&app, "POST", "/api/drag/prepare");
        app.process(json!({
            "CarOrdinal": id,
            "SpeedMetersPerSecond": 0.1,
            "Gear": 1,
            "AccelInput": 255,
            "TimestampMS": 1000,
            "IsRaceOn": 1
        }));
        app.process(json!({
            "CarOrdinal": id,
            "SpeedMetersPerSecond": 0.1,
            "Gear": 1,
            "AccelInput": 255,
            "TimestampMS": 1016,
            "IsRaceOn": 0
        }));
        assert_eq!(request(&app, "GET", "/api/drag/analysis")["car_name"], name);
        let data = request(&app, "GET", "/api/drag/data");
        assert_eq!(
            request(&app, "GET", "/api/drag/status")["points_count"],
            data.as_array().unwrap().len()
        );
        let saved = request(&app, "POST", "/api/drag/sessions/save");
        let archive: Value = serde_json::from_slice(
            &std::fs::read(
                root.path()
                    .join("drag_sessions")
                    .join(saved["filename"].as_str().unwrap()),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(archive["data"], data);
        assert_eq!(
            archive["analysis"],
            request(&app, "GET", "/api/drag/analysis")
        );
        request(&app, "POST", "/api/drag/clear");
        assert_eq!(request(&app, "GET", "/api/drag/status")["points_count"], 0);
    }
    app.shutdown();
}
#[test]
fn drag_recorder_matches_generated_fwd_rwd_awd_analysis_shapes() {
    let oracle = fixture("drag.json");
    for mode in ["FWD", "RWD", "AWD"] {
        let mut r = DragRecorder::default();
        r.set_context(&json!({}), &json!({"42":{"display_name":"Car 42"}}));
        r.prepare();
        for frame in oracle[mode]["frames"].as_array().unwrap() {
            r.record(frame);
        }
        assert_eq!(r.status(), oracle[mode]["status"], "{} status", mode);
        for key in [
            "car_id",
            "car_name",
            "drivetrain",
            "max_gear",
            "path_valid",
            "shifts",
            "shift_recommendations",
            "stability_diagnostics",
        ] {
            assert_json_close(
                &r.analysis()[key],
                &oracle[mode]["analysis"][key],
                &format!("{}.{}", mode, key),
            );
        }
        assert_json_close(&r.data(), &oracle[mode]["data"], &format!("{}.data", mode));
        assert_json_close(
            &r.analysis(),
            &oracle[mode]["analysis"],
            &format!("{}.analysis", mode),
        );
    }
}
#[test]
fn sqlite_round_trip_keeps_decoded_json_and_legacy_schema() {
    let dir = tempfile::tempdir().unwrap();
    let store = TelemetryStore::new(&dir.path().join("telemetry.db")).unwrap();
    store
        .create_session("s", 42, "Test", 700, 800, 1.0)
        .unwrap();
    store.insert_points_batch("s",&[json!({"TimestampMS":1,"LapNumber":0,"SpeedMetersPerSecond":10,"AccelerationX":9.81,"TireSlipAngle":[0.1,0,0,0]})]).unwrap();
    let rows = store.get_telemetry_points("s", None).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["sourceSchema"], "decoded-fh6/v1");
    assert_eq!(store.list_all_sessions().unwrap().len(), 1)
}

#[test]
fn dyno_quality_and_collection_follow_python_gates() {
    let mut gate = DynoQualityGate::default();
    let mut quality = gate.observe(&json!({"TimestampMS":1000,"PositionX":0,"PositionY":0,"PositionZ":0,"SpeedMetersPerSecond":10,"Gear":4,"CarOrdinal":10,"CarClass":3,"CarPerformanceIndex":800}));
    for n in 1..8 {
        quality = gate.observe(&json!({"TimestampMS":1000+n*16,"PositionX":0,"PositionY":0,"PositionZ":(n as f64)*0.16,"SpeedMetersPerSecond":10,"Gear":4,"CarOrdinal":10,"CarClass":3,"CarPerformanceIndex":800}));
    }
    assert!(quality.can_collect);
    assert_eq!(quality.status, "confident");
    let mut profile = json!({"drivetrain":"RWD","dyno_curve":{}});
    let settings = json!({"dyno_recording":true,"dyno_test_gear":4,"dyno_filter_slip":true,"dyno_filter_transients":false});
    let registry = DynoQualityGateRegistry::default();
    assert!(collect_dyno_sample(
        &mut profile,
        &json!({"CurrentEngineRpm":4000,"PowerWatts":7457,"TorqueNewtons":100,"AccelInput":255,"Gear":4,"ClutchInput":0,"BrakeInput":0,"HandBrakeInput":0,"TireSlipRatio":[0,0,0,0],"TimestampMS":1200}),
        &quality,
        &settings,
        &registry,
        "10"
    ));
    assert!(profile["dyno_curve"]["4000"]["hp"].as_f64().unwrap() > 0.0);
}
#[test]
fn dyno_quality_and_collection_match_generated_python_fixture() {
    let f = fixture("dyno.json");
    let mut gate = DynoQualityGate::default();
    let mut actual_quality = Vec::new();
    let mut last_quality = None;
    for index in 0..8 {
        let frame = json!({"TimestampMS":1000 + index * 16,"PositionX":0,"PositionY":0,"PositionZ":index as f64 * 0.16,"SpeedMetersPerSecond":10,"Gear":4,"CarOrdinal":42,"CarClass":700,"CarPerformanceIndex":800});
        let assessment = gate.observe(&frame);
        last_quality = Some(assessment.clone());
        actual_quality.push(assessment.as_value());
    }
    assert_json_close(&Value::Array(actual_quality), &f["quality"], "dyno.quality");
    let quality = last_quality.unwrap();
    let mut profile = json!({"drivetrain":"RWD","dyno_curve":{}});
    let settings = json!({"dyno_recording":true,"dyno_test_gear":4,"dyno_filter_slip":true,"dyno_filter_transients":false});
    let registry = DynoQualityGateRegistry::default();
    let frame = json!({"CurrentEngineRpm":4000,"PowerWatts":7457,"TorqueNewtons":100,"AccelInput":255,"Gear":4,"ClutchInput":0,"BrakeInput":0,"HandBrakeInput":0,"TireSlipRatio":[0,0,0,0],"TimestampMS":1200});
    assert!(collect_dyno_sample(
        &mut profile,
        &frame,
        &quality,
        &settings,
        &registry,
        "42"
    ));
    assert_json_close(&profile, &f["profile_after_collection"], "dyno.profile");
}

#[test]
fn race_recorder_clock_injection_and_command_worker_boundary() {
    let mut r = RaceRecorder::new_with_context(
        RaceRecorderConfig::default(),
        json!({"race_recording":true}),
        json!({"42":{"year":2026,"make":"Test","model":"Car"}}),
    );
    r.record_at(&json!({"IsRaceOn":1,"CurrentRaceTime":1,"LapNumber":0,"TimestampMS":100,"CarOrdinal":42,"CarClass":700,"CarPerformanceIndex":800,"DrivetrainType":1,"LastLap":0}),10.0);
    let id = r.status().current_session_id.clone().unwrap();
    assert!(id.starts_with("session_"));
    assert!(
        matches!(r.drain_commands().first(),Some(RecorderCommand::CreateSession{car_name,..}) if car_name=="2026 Test Car")
    );
    r.record_at(
        &json!({"IsRaceOn":0,"TimestampMS":200,"CarOrdinal":42,"CarPerformanceIndex":800,"DrivetrainType":1}),
        11.0,
    );
    r.tick(14.1);
    assert!(!r.status().is_recording);
    assert!(r.drain_commands().iter().any(|x|matches!(x,RecorderCommand::Finalize{metadata,..} if metadata["endReason"]=="race-stopped")));
}
#[test]
fn race_recorder_matches_generated_session_and_command_fixture() {
    let oracle = fixture("race.json");
    let mut r = RaceRecorder::new_with_context(
        RaceRecorderConfig {
            downsample_interval_ms: 0.0,
            ..RaceRecorderConfig::default()
        },
        json!({"race_recording": true}),
        json!({"42":{"year":2026,"make":"Test","model":"Car"}}),
    );
    r.record_at(&json!({"IsRaceOn":1,"CurrentRaceTime":1,"LapNumber":0,"TimestampMS":100,"CarOrdinal":42,"CarClass":700,"CarPerformanceIndex":800,"DrivetrainType":1}), 10.0);
    r.record_at(&json!({"IsRaceOn":0,"CurrentRaceTime":0,"LapNumber":0,"TimestampMS":200,"CarOrdinal":42,"CarPerformanceIndex":800,"DrivetrainType":1}), 11.0);
    r.tick(14.1);
    let commands = r.drain_commands();
    assert_eq!(commands.len(), 3);
    match &commands[0] {
        RecorderCommand::CreateSession {
            car_name,
            car_class,
            car_pi,
            car_ordinal,
            ..
        } => {
            assert_eq!(car_name, "2026 Test Car");
            assert_eq!((*car_ordinal, *car_class, *car_pi), (42, 700, 800));
        }
        other => panic!("unexpected first command: {other:?}"),
    }
    match &commands[1] {
        RecorderCommand::WritePoints { points, .. } => {
            assert_json_close(
                &Value::Array(points.clone()),
                &oracle["calls"][1][2],
                "race.points",
            );
        }
        other => panic!("unexpected points command: {other:?}"),
    }
    match &commands[2] {
        RecorderCommand::Finalize { metadata, .. } => {
            assert_json_close(metadata, &oracle["calls"][2][2], "race.finalize");
        }
        other => panic!("unexpected final command: {other:?}"),
    }
    assert_eq!(r.status().is_recording, oracle["status"]["is_recording"]);
    assert!(r.status().current_session_id.is_none());
}

#[test]
fn sqlite_migrates_old_tables_and_reports_laps_and_missing_delete() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.db");
    let c = rusqlite::Connection::open(&path).unwrap();
    c.execute_batch("CREATE TABLE sessions(session_id TEXT PRIMARY KEY,car_ordinal INTEGER,car_name TEXT,car_class INTEGER,car_pi INTEGER,start_time REAL,total_laps INTEGER,best_lap_time REAL,total_distance REAL);CREATE TABLE laps(session_id TEXT NOT NULL,lap_number INTEGER NOT NULL,lap_time REAL,start_distance REAL,end_distance REAL,max_speed_kmh REAL,avg_speed_kmh REAL,PRIMARY KEY(session_id,lap_number));CREATE TABLE telemetry_channels(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,lap_number INTEGER,relative_time REAL,lap_distance REAL,speed REAL,rpm REAL,gear INTEGER,accel_pct REAL,brake_pct REAL,steer_pct REAL,clutch_pct REAL,handbrake_pct REAL,accel_x REAL,accel_y REAL,accel_z REAL,yaw REAL,pitch REAL,roll REAL,pos_x REAL,pos_y REAL,pos_z REAL,susp_fl REAL,susp_fr REAL,susp_rl REAL,susp_rr REAL,slip_angle_fl REAL,slip_angle_fr REAL,slip_angle_rl REAL,slip_angle_rr REAL,slip_ratio_fl REAL,slip_ratio_fr REAL,slip_ratio_rl REAL,slip_ratio_rr REAL,temp_fl REAL,temp_fr REAL,temp_rl REAL,temp_rr REAL);INSERT INTO sessions VALUES('old',1,'Old',700,800,1,0,0,0);INSERT INTO laps VALUES('old',1,60,0,100,200,180);").unwrap();
    drop(c);
    let store = TelemetryStore::new(&path).unwrap();
    assert_eq!(store.get_session_laps("old").unwrap()[0]["lap_number"], 1);
    assert!(!store.delete_session("missing").unwrap());
    assert!(store.delete_session("old").unwrap());
}
#[test]
fn sqlite_roundtrip_matches_generated_decoded_fixture() {
    let oracle = fixture("sqlite.json");
    let dir = tempfile::tempdir().unwrap();
    let store = TelemetryStore::new(&dir.path().join("fixture.db")).unwrap();
    store
        .create_session("fixture", 42, "Test Car", 700, 800, 1.0)
        .unwrap();
    store.insert_points_batch("fixture", &[json!({"TimestampMS":1,"LapNumber":0,"SpeedMetersPerSecond":10,"AccelerationX":9.81,"TireSlipAngle":[0.1,0,0,0]})]).unwrap();
    assert_json_close(
        &Value::Array(store.get_telemetry_points("fixture", None).unwrap()),
        &oracle["points"],
        "sqlite.points",
    );
    let summary = store
        .finalize_session("fixture", json!({"endReason":"fixture"}))
        .unwrap();
    assert_json_close(&summary, &oracle["finalize"], "sqlite.finalize");
    assert_json_close(
        &Value::Array(store.get_session_laps("fixture").unwrap()),
        &oracle["laps"],
        "sqlite.laps",
    );
    assert_json_close(
        &store.get_session_metadata("fixture").unwrap(),
        &oracle["metadata"],
        "sqlite.metadata",
    );
}

#[test]
fn sqlite_finalize_rolls_back_laps_and_session_summary_on_lap_failure() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("finalize-rollback.db");
    let store = TelemetryStore::new(&path).unwrap();
    store
        .create_session("s", 42, "Test", 700, 800, 1.0)
        .unwrap();
    store
        .set_session_metadata("s", &json!({"state":"recording","keep":"value"}))
        .unwrap();
    store
        .insert_points_batch(
            "s",
            &[
                json!({"TimestampMS":1000,"LapNumber":1,"CurrentLap":0,"LastLap":60,"IsRaceOn":1,"SpeedMetersPerSecond":10}),
                json!({"TimestampMS":2000,"LapNumber":2,"CurrentLap":0,"LastLap":60,"IsRaceOn":1,"SpeedMetersPerSecond":12}),
            ],
        )
        .unwrap();
    let c = rusqlite::Connection::open(&path).unwrap();
    c.execute_batch(
        "CREATE TRIGGER reject_second_lap BEFORE INSERT ON laps \
         WHEN NEW.lap_number=2 BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
    )
    .unwrap();
    drop(c);

    let original_metadata = store.get_session_metadata("s").unwrap();
    assert!(store.finalize_session("s", original_metadata).is_err());
    assert!(store.get_session_laps("s").unwrap().is_empty());
    assert_eq!(store.list_all_sessions().unwrap()[0]["total_laps"], 0);
    let metadata_after_failure = store.get_session_metadata("s").unwrap();
    assert_eq!(metadata_after_failure["state"], "recording");
    assert_eq!(metadata_after_failure["keep"], "value");
    assert!(metadata_after_failure.get("completeLaps").is_none());
}

#[test]
fn sqlite_batch_round_trip_preserves_channels_units_nulls_and_raw_json() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("batch.db");
    let store = TelemetryStore::new(&path).unwrap();
    store
        .create_session("s", 42, "Test", 700, 800, 1.0)
        .unwrap();
    let points = vec![
        json!({
            "time":1.25,"LapNumber":2,"DistanceTraveled":123.5,
            "SpeedMetersPerSecond":25.0,"CurrentEngineRpm":5400,"Gear":4,
            "AccelInput":128,"AccelerationX":9.81,"AccelerationY":-4.905,
            "Yaw":1.0,"Pitch":0.1,"Roll":0.2,"PositionX":5.0,"PositionZ":6.0,
            "NormalizedSuspensionTravel":[0.1,0.2,0.3,0.4],
            "SuspensionTravelMeters":[0.01,0.02,0.03,0.04],
            "TireSlipAngle":[0.1,null,-0.2,0.3],"TireSlipRatio":[0.5,0.4,0.3,0.2],
            "TireTemp":[70,71,72,73],"PowerWatts":7457,"TorqueNewtons":300,
            "Boost":1.3,"Fuel":0.75
        }),
        json!({"time":2.0,"LapNumber":2,"Gear":3}),
    ];
    store.insert_points_batch("s", &points).unwrap();

    let rows = store.get_telemetry_points("s", None).unwrap();
    assert_eq!(rows.len(), points.len());
    for (actual, source) in rows.iter().zip(&points) {
        assert_eq!(actual, &decoded_point(source));
    }
    assert!(rows[1]["SpeedMetersPerSecond"].is_null());
    assert!(rows[1]["PositionX"].is_null());

    let c = rusqlite::Connection::open(path).unwrap();
    let (speed, accel_x, slip_angle, missing_slip_angle, suspension_m, power, fuel, missing_pos, raw): (
        Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, String,
    ) = c
        .query_row(
            "SELECT speed,accel_x,slip_angle_fl,slip_angle_fr,susp_meters_fr,power_watts,fuel,pos_y,raw_json FROM telemetry_channels WHERE session_id='s' ORDER BY id LIMIT 1",
            [],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?)),
        )
        .unwrap();
    assert_eq!(speed, Some(90.0));
    assert_eq!(accel_x, Some(1.0));
    assert_eq!(slip_angle, Some(0.1 * 57.29578));
    assert_eq!(missing_slip_angle, None);
    assert_eq!(suspension_m, Some(0.02));
    assert_eq!(power, Some(7457.0));
    assert_eq!(fuel, Some(0.75));
    assert_eq!(missing_pos, None);
    assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(), rows[0]);
}

#[test]
fn sqlite_batch_insert_rolls_back_all_points_on_later_row_failure() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rollback.db");
    let store = TelemetryStore::new(&path).unwrap();
    store
        .create_session("s", 42, "Test", 700, 800, 1.0)
        .unwrap();
    let c = rusqlite::Connection::open(&path).unwrap();
    c.execute_batch(
        "CREATE TRIGGER reject_second_point BEFORE INSERT ON telemetry_channels \
         WHEN NEW.relative_time=2.0 BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
    )
    .unwrap();
    drop(c);

    let result = store.insert_points_batch("s", &[json!({"time":1.0}), json!({"time":2.0})]);
    assert!(result.is_err());
    assert!(store.get_telemetry_points("s", None).unwrap().is_empty());
}

#[test]
fn test_custom_routes_lifecycle() {
    let dir = tempfile::tempdir().unwrap();
    let store = TelemetryStore::new(&dir.path().join("routes.db")).unwrap();

    let route = json!({
        "route_id": "test-route-1",
        "name": "Fujimi Kaido Sprint",
        "mode": "time_trial",
        "start_x": 100.0,
        "start_y": 200.0,
        "start_z": 300.0,
        "start_radius": 15.0,
        "end_x": null,
        "end_y": null,
        "end_z": null,
        "end_radius": null,
        "metadata": {"creator": "Tester", "elevation_gain": 450}
    });

    store.save_route(&route).unwrap();
    let list = store.list_routes().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["route_id"], "test-route-1");
    assert_eq!(list[0]["name"], "Fujimi Kaido Sprint");
    assert_eq!(list[0]["mode"], "time_trial");
    assert_eq!(list[0]["start_radius"], 15.0);

    let retrieved = store.get_route("test-route-1").unwrap();
    assert!(retrieved.is_some());
    let r = retrieved.unwrap();
    assert_eq!(r["name"], "Fujimi Kaido Sprint");
    assert_eq!(r["metadata"]["creator"], "Tester");

    // Upsert update
    let mut updated = route.clone();
    updated["name"] = json!("Fujimi Kaido Rev");
    store.save_route(&updated).unwrap();
    let r2 = store.get_route("test-route-1").unwrap().unwrap();
    assert_eq!(r2["name"], "Fujimi Kaido Rev");

    // Delete
    assert!(store.delete_route("test-route-1").unwrap());
    assert!(!store.delete_route("test-route-1").unwrap());
    assert!(store.list_routes().unwrap().is_empty());
}

#[test]
fn test_time_trial_gate_trigger() {
    let mut recorder = RaceRecorder::new(RaceRecorderConfig::default());
    let active_route = ActiveRoute {
        route_id: "tt-route".into(),
        name: "Time Trial 1".into(),
        mode: "time_trial".into(),
        start_x: 0.0,
        start_y: 0.0,
        start_z: 0.0,
        start_radius: 15.0,
        end_x: None,
        end_y: None,
        end_z: None,
        end_radius: None,
    };

    recorder.arm_route(active_route);
    assert!(recorder.status().armed);
    assert_eq!(
        recorder.status().armed_route_id.as_deref(),
        Some("tt-route")
    );

    // Far away: distance ~ 141m
    recorder.record_at(
        &json!({
            "PositionX": 100.0, "PositionY": 0.0, "PositionZ": 100.0,
            "TimestampMS": 1000.0, "CarOrdinal": 1
        }),
        1.0,
    );
    assert!(recorder.status().armed);
    assert!(!recorder.status().is_recording);

    // Crosses start gate: distance = 10m <= 15m
    recorder.record_at(
        &json!({
            "PositionX": 10.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 2000.0, "CarOrdinal": 1
        }),
        2.0,
    );
    assert!(!recorder.status().armed);
    assert!(recorder.status().is_recording);
    assert_eq!(recorder.status().recording_mode, "time_trial");

    // Drives away: distance = 30m > 15m * 1.2 (18m)
    recorder.record_at(
        &json!({
            "PositionX": 30.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 3000.0, "CarOrdinal": 1
        }),
        3.0,
    );

    // Re-enters start gate: completes Lap 1, enters Lap 2
    recorder.record_at(
        &json!({
            "PositionX": 5.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 4000.0, "CarOrdinal": 1
        }),
        4.0,
    );

    recorder.save_latest_and_clear("manual-stop");

    let commands = recorder.drain_commands();
    assert!(commands
        .iter()
        .any(|c| matches!(c, RecorderCommand::CreateSession { .. })));
    let write_cmd = commands
        .iter()
        .find(|c| matches!(c, RecorderCommand::WritePoints { .. }))
        .unwrap();
    if let RecorderCommand::WritePoints { points, .. } = write_cmd {
        assert_eq!(points.len(), 3);
        // Start crossing frame must be recorded as Lap 1, NOT Lap 2
        assert_eq!(points[0]["LapNumber"], 1);
        assert_eq!(points[1]["LapNumber"], 1);
        // Second crossing frame triggers Lap 2
        assert_eq!(points[2]["LapNumber"], 2);
    } else {
        panic!("expected WritePoints command");
    }

    let finalize_cmd = commands
        .iter()
        .find(|c| matches!(c, RecorderCommand::Finalize { .. }))
        .unwrap();
    if let RecorderCommand::Finalize { metadata, .. } = finalize_cmd {
        assert_eq!(metadata["recording_mode"], "time_trial");
        assert_eq!(metadata["route_id"], "tt-route");
    } else {
        panic!("expected Finalize command");
    }
}

#[test]
fn test_high_speed_swept_gate_crossing() {
    let mut recorder = RaceRecorder::new(RaceRecorderConfig::default());
    let active_route = ActiveRoute {
        route_id: "fast-gate".into(),
        name: "High Speed Gate".into(),
        mode: "time_trial".into(),
        start_x: 0.0,
        start_y: 0.0,
        start_z: 0.0,
        start_radius: 5.0, // Small radius
        end_x: None,
        end_y: None,
        end_z: None,
        end_radius: None,
    };

    recorder.arm_route(active_route);

    // Frame 1: Before gate at X = -15m (> 5m)
    recorder.record_at(
        &json!({
            "PositionX": -15.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 1000.0, "CarOrdinal": 1
        }),
        1.0,
    );
    assert!(recorder.status().armed);
    assert!(!recorder.status().is_recording);

    // Frame 2: 100ms later at 360 km/h (100 m/s = 10m/frame), leaped past gate to X = +15m (> 5m)
    // Neither frame landing inside 5.0m, but segment swept directly through (0, 0, 0)
    recorder.record_at(
        &json!({
            "PositionX": 15.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 1100.0, "CarOrdinal": 1
        }),
        1.1,
    );

    // Swept volume must detect and trigger the gate!
    assert!(!recorder.status().armed);
    assert!(recorder.status().is_recording);
}

#[test]
fn test_free_roam_zero_is_race_on_lap_aggregation() {
    let dir = tempfile::tempdir().unwrap();
    let store = TelemetryStore::new(&dir.path().join("freeroam.db")).unwrap();
    store
        .create_session("fr-session", 42, "Free Roam Car", 700, 800, 1.0)
        .unwrap();

    // In Forza Horizon Free Roam, IsRaceOn is ALWAYS 0!
    let points = vec![
        json!({"time": 0.0, "TimestampMS": 1000.0, "LapNumber": 1, "IsRaceOn": 0, "SpeedMetersPerSecond": 25.0}),
        json!({"time": 10.0, "TimestampMS": 11000.0, "LapNumber": 1, "IsRaceOn": 0, "SpeedMetersPerSecond": 35.0}),
        json!({"time": 20.0, "TimestampMS": 21000.0, "LapNumber": 1, "IsRaceOn": 0, "SpeedMetersPerSecond": 30.0}),
        json!({"time": 25.0, "TimestampMS": 26000.0, "LapNumber": 2, "IsRaceOn": 0, "SpeedMetersPerSecond": 20.0}),
    ];
    store.insert_points_batch("fr-session", &points).unwrap();

    let meta = json!({
        "recording_mode": "time_trial",
        "route_id": "test-tt",
        "endReason": "manual-stop"
    });
    let summary = store.finalize_session("fr-session", meta).unwrap();
    assert_eq!(summary["total_laps"], 1); // Lap 1 complete, Lap 2 incomplete tail
    assert!(summary["best_lap_time"].as_f64().unwrap() > 0.0);

    let laps = store.get_session_laps("fr-session").unwrap();
    assert_eq!(laps.len(), 2);
    assert_eq!(laps[0]["lap_number"], 1);
    assert_eq!(laps[0]["complete"], 1);
    assert_eq!(laps[0]["lap_time_source"], "gate-crossing");
    assert!(laps[0]["max_speed_kmh"].as_f64().unwrap() >= 126.0); // 35 m/s * 3.6
    assert!(!laps[0]["avg_speed_kmh"].is_null());

    assert_eq!(laps[1]["lap_number"], 2);
    assert_eq!(laps[1]["complete"], 0); // Tail cut off by manual stop
    assert!(laps[1]["lap_time"].is_null());
}

#[test]
fn test_roaming_start_and_end_gate() {
    let mut recorder = RaceRecorder::new(RaceRecorderConfig::default());
    let active_route = ActiveRoute {
        route_id: "roam-1".into(),
        name: "Coast to Mountain".into(),
        mode: "roaming".into(),
        start_x: 0.0,
        start_y: 0.0,
        start_z: 0.0,
        start_radius: 10.0,
        end_x: Some(100.0),
        end_y: Some(0.0),
        end_z: Some(100.0),
        end_radius: Some(10.0),
    };

    recorder.arm_route(active_route);
    // Enter start
    recorder.record_at(
        &json!({
            "PositionX": 5.0, "PositionY": 0.0, "PositionZ": 0.0,
            "TimestampMS": 1000.0, "CarOrdinal": 1
        }),
        1.0,
    );
    assert!(recorder.status().is_recording);

    // Mid point
    recorder.record_at(
        &json!({
            "PositionX": 50.0, "PositionY": 0.0, "PositionZ": 50.0,
            "TimestampMS": 2000.0, "CarOrdinal": 1
        }),
        2.0,
    );
    assert!(recorder.status().is_recording);

    // Reach destination: distance to (100, 0, 100) = sqrt(2^2 + 1^2) ~ 2.2m <= 10m
    recorder.record_at(
        &json!({
            "PositionX": 102.0, "PositionY": 0.0, "PositionZ": 101.0,
            "TimestampMS": 3000.0, "CarOrdinal": 1
        }),
        3.0,
    );

    // Automatically finalized!
    assert!(!recorder.status().is_recording);
    let commands = recorder.drain_commands();
    let finalize = commands
        .iter()
        .find(|c| matches!(c, RecorderCommand::Finalize { .. }))
        .unwrap();
    if let RecorderCommand::Finalize { metadata, .. } = finalize {
        assert_eq!(metadata["endReason"], "destination-reached");
        assert_eq!(metadata["recording_mode"], "roaming");
        assert_eq!(metadata["route_id"], "roam-1");
    } else {
        panic!("expected Finalize command");
    }
}

#[test]
fn test_post_stop_trimming_and_provenance() {
    let dir = tempfile::tempdir().unwrap();
    let store = TelemetryStore::new(&dir.path().join("trim.db")).unwrap();
    store
        .create_session("sess_trim", 1, "Car", 700, 800, 0.0)
        .unwrap();

    let points = vec![
        // Head stationary
        json!({"time": 0.0, "TimestampMS": 0, "SpeedMetersPerSecond": 0.0, "AccelInput": 0, "LapNumber": 1}),
        json!({"time": 1.0, "TimestampMS": 1000, "SpeedMetersPerSecond": 0.0, "AccelInput": 0, "LapNumber": 1}),
        // Active driving
        json!({"time": 2.0, "TimestampMS": 2000, "SpeedMetersPerSecond": 15.0, "AccelInput": 200, "LapNumber": 1}),
        json!({"time": 3.0, "TimestampMS": 3000, "SpeedMetersPerSecond": 25.0, "AccelInput": 255, "LapNumber": 1}),
        json!({"time": 4.0, "TimestampMS": 4000, "SpeedMetersPerSecond": 20.0, "AccelInput": 100, "LapNumber": 1}),
        // Tail stopped
        json!({"time": 5.0, "TimestampMS": 5000, "SpeedMetersPerSecond": 0.0, "AccelInput": 0, "LapNumber": 1}),
        json!({"time": 6.0, "TimestampMS": 6000, "SpeedMetersPerSecond": 0.0, "AccelInput": 0, "LapNumber": 1}),
    ];
    store.insert_points_batch("sess_trim", &points).unwrap();

    let res = store
        .finalize_session("sess_trim", json!({"recording_mode": "circuit"}))
        .unwrap();
    assert_eq!(res["session_id"], "sess_trim");

    let meta = store.get_session_metadata("sess_trim").unwrap();
    let trim = &meta["trim_analysis"];
    assert_eq!(trim["head_trim_samples"], 2);
    assert_eq!(trim["head_trim_seconds"], 2.0);
    assert_eq!(trim["tail_trim_samples"], 2);
    assert_eq!(trim["tail_trim_seconds"], 2.0);
    assert_eq!(trim["valid_start_time"], 2.0);
    assert_eq!(trim["valid_end_time"], 4.0);
    assert_eq!(trim["raw_sample_count"], 7);
    assert_eq!(trim["trimmed_sample_count"], 3);

    // Raw points in SQLite channels are unchanged
    let loaded = store.get_telemetry_points("sess_trim", None).unwrap();
    assert_eq!(loaded.len(), 7);
}

#[test]
fn test_motec_csv_roundtrip_and_laps() {
    let metadata = json!({
        "session_id": "motec_test_session",
        "car_name": "Porsche 911 GT3",
    });
    let points = vec![
        json!({
            "time": 0.0, "lap_distance": 0.0, "LapNumber": 1,
            "SpeedMetersPerSecond": 20.0, "CurrentEngineRpm": 4000.0, "Gear": 3,
            "AccelInput": 200, "BrakeInput": 0, "steer_pct": 5.0,
            "AccelerationX": 0.5, "AccelerationZ": 2.0, "AccelerationY": 9.8,
            "PositionX": 10.0, "PositionY": 0.0, "PositionZ": 20.0,
            "SuspTravel": [0.3, 0.3, 0.3, 0.3], "TireSlipAngle": [0.05, 0.05, 0.02, 0.02],
            "TireSlipRatio": [0.01, 0.01, 0.01, 0.01], "TireTemp": [80.0, 80.0, 82.0, 82.0]
        }),
        json!({
            "time": 30.0, "lap_distance": 500.0, "LapNumber": 1,
            "SpeedMetersPerSecond": 40.0, "CurrentEngineRpm": 7000.0, "Gear": 4,
            "AccelInput": 255, "BrakeInput": 0, "steer_pct": 0.0,
            "AccelerationX": 0.0, "AccelerationZ": 3.0, "AccelerationY": 9.8,
            "PositionX": 50.0, "PositionY": 0.0, "PositionZ": 100.0,
            "SuspTravel": [0.4, 0.4, 0.4, 0.4], "TireSlipAngle": [0.02, 0.02, 0.01, 0.01],
            "TireSlipRatio": [0.02, 0.02, 0.02, 0.02], "TireTemp": [90.0, 90.0, 92.0, 92.0]
        }),
        json!({
            "time": 60.0, "lap_distance": 0.0, "LapNumber": 2,
            "SpeedMetersPerSecond": 30.0, "CurrentEngineRpm": 5000.0, "Gear": 3,
            "AccelInput": 220, "BrakeInput": 0, "steer_pct": -2.0,
            "AccelerationX": -0.8, "AccelerationZ": 1.5, "AccelerationY": 9.8,
            "PositionX": 10.0, "PositionY": 0.0, "PositionZ": 20.0,
            "SuspTravel": [0.35, 0.35, 0.35, 0.35], "TireSlipAngle": [0.04, 0.04, 0.03, 0.03],
            "TireSlipRatio": [0.01, 0.01, 0.01, 0.01], "TireTemp": [95.0, 95.0, 96.0, 96.0]
        }),
    ];

    let bytes = motec::export(&metadata, &points).unwrap();
    assert!(!bytes.is_empty());

    let (imported_meta, imported_points) = motec::import(&bytes).unwrap();
    assert_eq!(imported_meta["session_id"], "motec_test_session");
    assert_eq!(imported_meta["car_name"], "Porsche 911 GT3");
    assert_eq!(imported_points.len(), 3);
    assert_eq!(imported_points[0]["LapNumber"].as_f64().unwrap() as i64, 1);
    assert_eq!(imported_points[2]["LapNumber"].as_f64().unwrap() as i64, 2);

    let debrief = motec::debrief(&imported_points);
    assert_eq!(debrief["total_samples"], 3);
}

#[test]
fn test_motec_ld_binary_structure_and_ldx_beacons() {
    let metadata = json!({
        "session_id": "test_ld_session",
        "car_name": "Ferrari 488 GT3",
        "driver": "Horizon Racer",
        "venue": "Silverstone GP",
        "date": "07/10/2026",
        "time": "14:30:00"
    });

    let points = vec![
        json!({
            "time": 0.0, "lap_distance": 0.0, "LapNumber": 1,
            "SpeedMetersPerSecond": 25.0, "CurrentEngineRpm": 4500.0, "Gear": 3,
            "AccelInput": 180, "BrakeInput": 0, "steer_pct": 2.0,
            "AccelerationX": 0.4, "AccelerationZ": 1.8, "AccelerationY": 9.81,
            "PositionX": 100.0, "PositionY": 15.0, "PositionZ": 200.0,
            "SuspTravel": [0.25, 0.25, 0.28, 0.28], "SuspensionTravelMeters": [0.05, 0.05, 0.06, 0.06],
            "TireSlipAngle": [0.03, 0.03, 0.02, 0.02], "TireSlipRatio": [0.01, 0.01, 0.01, 0.01],
            "TireTemp": [85.0, 85.0, 88.0, 88.0], "Boost": 12.5, "Fuel": 0.85,
            "PowerWatts": 450000.0, "TorqueNewtons": 650.0
        }),
        json!({
            "time": 0.5, "lap_distance": 20.0, "LapNumber": 1,
            "SpeedMetersPerSecond": 35.0, "CurrentEngineRpm": 6000.0, "Gear": 4,
            "AccelInput": 255, "BrakeInput": 0, "steer_pct": 0.0,
            "AccelerationX": 0.1, "AccelerationZ": 2.5, "AccelerationY": 9.81,
            "PositionX": 115.0, "PositionY": 15.0, "PositionZ": 210.0,
            "SuspTravel": [0.30, 0.30, 0.32, 0.32], "SuspensionTravelMeters": [0.06, 0.06, 0.07, 0.07],
            "TireSlipAngle": [0.02, 0.02, 0.01, 0.01], "TireSlipRatio": [0.02, 0.02, 0.02, 0.02],
            "TireTemp": [87.0, 87.0, 90.0, 90.0], "Boost": 15.0, "Fuel": 0.84,
            "PowerWatts": 500000.0, "TorqueNewtons": 700.0
        }),
        json!({
            "time": 1.0, "lap_distance": 45.0, "LapNumber": 2,
            "SpeedMetersPerSecond": 42.0, "CurrentEngineRpm": 7200.0, "Gear": 5,
            "AccelInput": 255, "BrakeInput": 0, "steer_pct": -1.0,
            "AccelerationX": -0.3, "AccelerationZ": 2.0, "AccelerationY": 9.81,
            "PositionX": 135.0, "PositionY": 15.0, "PositionZ": 225.0,
            "SuspTravel": [0.28, 0.28, 0.30, 0.30], "SuspensionTravelMeters": [0.055, 0.055, 0.065, 0.065],
            "TireSlipAngle": [0.02, 0.02, 0.02, 0.02], "TireSlipRatio": [0.015, 0.015, 0.015, 0.015],
            "TireTemp": [89.0, 89.0, 92.0, 92.0], "Boost": 15.2, "Fuel": 0.83,
            "PowerWatts": 510000.0, "TorqueNewtons": 680.0
        }),
    ];

    let laps = vec![
        json!({
            "lap_number": 1,
            "lap_time": 95.420,
            "start_distance": 0.0,
            "end_distance": 4500.0,
            "max_speed_kmh": 265.0,
            "complete": 1
        }),
        json!({
            "lap_number": 2,
            "lap_time": 94.180,
            "start_distance": 4500.0,
            "end_distance": 9000.0,
            "max_speed_kmh": 268.0,
            "complete": 1
        }),
    ];

    // 1. Verify resample_to_grid
    let resampled = motec::resample_to_grid(&points, 60.0);
    assert_eq!(resampled.len(), 61); // 0.0 to 1.0s inclusive at 60Hz = 61 samples
    assert!((resampled[0].time() - 0.0).abs() < 1e-6);
    assert!((resampled[60].time() - 1.0).abs() < 1e-6);
    let dt = resampled[1].time() - resampled[0].time();
    assert!((dt - (1.0 / 60.0)).abs() < 1e-6);

    // 2. Export .ld and .ldx
    let (ld_bytes, ldx_bytes) = motec::export_ld(&metadata, &points, &laps).unwrap();

    // 3. Verify .ld binary headers and layout
    assert!(ld_bytes.len() >= 18468);
    let magic = u32::from_le_bytes(ld_bytes[0..4].try_into().unwrap());
    assert_eq!(magic, 0x00000040);

    let meta_ptr = u32::from_le_bytes(ld_bytes[8..12].try_into().unwrap());
    assert_eq!(meta_ptr, 13384);

    let data_ptr = u32::from_le_bytes(ld_bytes[12..16].try_into().unwrap());
    assert_eq!(data_ptr, 18468);

    let event_ptr = u32::from_le_bytes(ld_bytes[36..40].try_into().unwrap());
    assert_eq!(event_ptr, 1762);

    assert_eq!(&ld_bytes[74..77], b"ADL");
    let version = u16::from_le_bytes(ld_bytes[82..84].try_into().unwrap());
    assert_eq!(version, 420);

    let num_channels = u32::from_le_bytes(ld_bytes[86..90].try_into().unwrap());
    assert_eq!(num_channels, 41);

    // Verify channel metadata linked list
    let sample_count = resampled.len() as u32;
    for i in 0..41 {
        let offset = 13384 + i * 124;
        let prev = u32::from_le_bytes(ld_bytes[offset..offset + 4].try_into().unwrap());
        let next = u32::from_le_bytes(ld_bytes[offset + 4..offset + 8].try_into().unwrap());
        let d_addr = u32::from_le_bytes(ld_bytes[offset + 8..offset + 12].try_into().unwrap());
        let count = u32::from_le_bytes(ld_bytes[offset + 12..offset + 16].try_into().unwrap());
        let datatype = u16::from_le_bytes(ld_bytes[offset + 18..offset + 20].try_into().unwrap());
        let datasize = u16::from_le_bytes(ld_bytes[offset + 20..offset + 22].try_into().unwrap());
        let freq = u16::from_le_bytes(ld_bytes[offset + 22..offset + 24].try_into().unwrap());
        let mul = i16::from_le_bytes(ld_bytes[offset + 26..offset + 28].try_into().unwrap());
        let scale = i16::from_le_bytes(ld_bytes[offset + 28..offset + 30].try_into().unwrap());

        if i == 0 {
            assert_eq!(prev, 0);
            assert_eq!(next, 13384 + 124);
        } else if i == 40 {
            assert_eq!(prev, 13384 + 39 * 124);
            assert_eq!(next, 0);
        } else {
            assert_eq!(prev, 13384 + (i as u32 - 1) * 124);
            assert_eq!(next, 13384 + (i as u32 + 1) * 124);
        }

        assert_eq!(d_addr, 18468 + (i as u32) * sample_count * 4);
        assert_eq!(count, sample_count);
        assert_eq!(datatype, 5);
        assert_eq!(datasize, 4);
        assert_eq!(freq, 60);
        assert_eq!(mul, 1);
        assert_eq!(scale, 1);

        // Verify channel name
        let name_bytes = &ld_bytes[offset + 32..offset + 64];
        let name = std::str::from_utf8(name_bytes).unwrap().trim_matches('\0');
        assert_eq!(name, motec::MOTEC_CHANNELS[i].name);
    }

    assert_eq!(ld_bytes.len(), 18468 + 41 * (sample_count as usize) * 4);

    // 4. Verify companion .ldx XML
    let xml = String::from_utf8(ldx_bytes).unwrap();
    assert!(xml.contains("<?xml version=\"1.0\"?>"));
    assert!(xml.contains("<LDXFile"));
    assert!(xml.contains("<MarkerBlock>"));
    assert!(xml.contains("<MarkerGroup Name=\"Beacons\""));
    assert!(xml.contains("ClassName=\"BCN\""));
    assert!(xml.contains("Flags=\"77\""));
    assert!(xml.contains("Time=\"0.00000000000000000E+00\""));
    assert!(xml.contains("Time=\"9.54200000000000000E+07\""));
    assert!(xml.contains("<String Id=\"Total Laps\" Value=\"2\"/>"));
    assert!(xml.contains("<String Id=\"Fastest Lap\" Value=\"2\"/>"));

    // 5. Verify API route format=ld export and open
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    app.database
        .create_session("ld_api_test", 100, "Ferrari 488 GT3", 5, 850, 0.0)
        .unwrap();
    app.database
        .insert_points_batch("ld_api_test", &points)
        .unwrap();

    let mut query = BTreeMap::new();
    query.insert("format".to_string(), "ld".to_string());

    // GET /api/analysis/export/motec/ld_api_test?format=ld
    let export_req = ApiRequest {
        method: "GET".to_string(),
        path: "/api/analysis/export/motec/ld_api_test".to_string(),
        query: query.clone(),
        headers: HeaderMap::new(),
        body: vec![],
        upload_filename: None,
    };
    let export_res = app.request(export_req).unwrap();
    assert_eq!(export_res.status, 200);
    let content_type = export_res
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map(|(_, v)| v.as_str())
        .unwrap();
    assert_eq!(content_type, "application/zip");
    let content_disp = export_res
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-disposition"))
        .map(|(_, v)| v.as_str())
        .unwrap();
    assert!(
        content_disp.contains("ld_api_test_motec.zip")
            || content_disp.contains("ld%5Fapi%5Ftest%5Fmotec%2Ezip")
    );

    let mut zip_reader = zip::ZipArchive::new(std::io::Cursor::new(export_res.body)).unwrap();
    assert_eq!(zip_reader.len(), 2);
    {
        let ld_file = zip_reader.by_name("ld_api_test.ld").unwrap();
        assert!(ld_file.size() >= 18468);
    }
    {
        let ldx_file = zip_reader.by_name("ld_api_test.ldx").unwrap();
        assert!(ldx_file.size() > 0);
    }

    // POST /api/analysis/motec/open/ld_api_test?format=ld
    let open_req = ApiRequest {
        method: "POST".to_string(),
        path: "/api/analysis/motec/open/ld_api_test".to_string(),
        query,
        headers: HeaderMap::new(),
        body: vec![],
        upload_filename: None,
    };
    let open_res = app.request(open_req).unwrap();
    assert_eq!(open_res.status, 200);
    let open_json: Value = serde_json::from_slice(&open_res.body).unwrap();
    assert_eq!(open_json["success"], true);
    assert!(root.path().join("sessions").join("ld_api_test.ld").exists());
    assert!(root
        .path()
        .join("sessions")
        .join("ld_api_test.ldx")
        .exists());
}

#[test]
fn test_motec_ld_edge_cases_and_beacon_robustness() {
    // 1. Test non-zero start time and out-of-order jitter in resample_to_grid
    let jittered_points = vec![
        json!({
            "time": 120.5, "DistanceTraveled": 15.0, "speed": 100.0,
            "accel_pct": 80.0, "brake_pct": 0.0, "clutch_pct": 0.0, "handbrake_pct": 0.0,
            "NormalizedSuspensionTravel": [0.2, 0.2, 0.25, 0.25]
        }),
        json!({
            "time": 120.0, "DistanceTraveled": 0.0, "speed": 90.0,
            "accel_pct": 70.0, "brake_pct": 0.0, "clutch_pct": 0.0, "handbrake_pct": 0.0,
            "NormalizedSuspensionTravel": [0.2, 0.2, 0.25, 0.25]
        }),
        json!({
            "time": 121.0, "DistanceTraveled": 30.0, "speed": 110.0,
            "accel_pct": 90.0, "brake_pct": 0.0, "clutch_pct": 0.0, "handbrake_pct": 0.0,
            "NormalizedSuspensionTravel": [0.2, 0.2, 0.25, 0.25]
        }),
    ];

    let resampled = motec::resample_to_grid(&jittered_points, 60.0);
    assert_eq!(resampled.len(), 61);
    // Relative time must start at 0.0 and end at 1.0, not 120.0
    assert!((resampled[0].time() - 0.0).abs() < 1e-6);
    assert!((resampled[60].time() - 1.0).abs() < 1e-6);
    // Aliased channels must be correctly extracted
    assert!((resampled[0].channels[6] - 70.0).abs() < 1e-3); // Accel pct
    assert!((resampled[0].channels[1] - 0.0).abs() < 1e-3); // DistanceTraveled
    assert!((resampled[0].channels[3] - 90.0).abs() < 1e-3); // speed km/h
    assert!((resampled[0].channels[18] - 20.0).abs() < 1e-3); // NormalizedSuspensionTravel FL * 100

    // 2. Test empty laps with multi-lap points: must generate start, transition, AND finish beacons
    let multi_lap_points = vec![
        json!({ "time": 0.0, "LapNumber": 1, "SpeedMetersPerSecond": 30.0 }),
        json!({ "time": 30.0, "LapNumber": 1, "SpeedMetersPerSecond": 40.0 }),
        json!({ "time": 60.0, "LapNumber": 2, "SpeedMetersPerSecond": 45.0 }),
        json!({ "time": 90.0, "LapNumber": 2, "SpeedMetersPerSecond": 50.0 }),
        json!({ "time": 115.0, "LapNumber": 2, "SpeedMetersPerSecond": 55.0 }),
    ];
    let xml_multi = motec::generate_ldx_xml(&[], &multi_lap_points);
    // Must contain 3 markers: 0.0 (lap 1 start), 60.0 (lap 2 start), 115.0 (lap 2 end)
    assert!(xml_multi.contains("Name=\"1\" Flags=\"77\" Time=\"0.00000000000000000E+00\""));
    assert!(xml_multi.contains("Name=\"2\" Flags=\"77\" Time=\"6.00000000000000000E+07\""));
    assert!(xml_multi.contains("Name=\"3\" Flags=\"77\" Time=\"1.15000000000000000E+08\""));
    assert!(xml_multi.contains("<String Id=\"Total Laps\" Value=\"2\"/>"));
    // Lap 2 (55s) is faster than Lap 1 (60s)
    assert!(xml_multi.contains("<String Id=\"Fastest Lap\" Value=\"2\"/>"));
    assert!(xml_multi.contains("<String Id=\"Fastest Time\" Value=\"0:55.000\"/>"));

    // 3. Test incomplete lap with null lap_time but valid observed_span
    let incomplete_laps = vec![json!({
        "lap_number": 1,
        "lap_time": null,
        "observed_span": 52.340,
        "complete": 0
    })];
    let xml_incomplete = motec::generate_ldx_xml(&incomplete_laps, &[]);
    // Must use observed_span as beacon duration
    assert!(xml_incomplete.contains("Name=\"1\" Flags=\"77\" Time=\"0.00000000000000000E+00\""));
    assert!(xml_incomplete.contains("Name=\"2\" Flags=\"77\" Time=\"5.23400000000000000E+07\""));
    assert!(xml_incomplete.contains("<String Id=\"Total Laps\" Value=\"1\"/>"));
    assert!(xml_incomplete.contains("<String Id=\"Fastest Lap\" Value=\"1\"/>"));
    assert!(xml_incomplete.contains("<String Id=\"Fastest Time\" Value=\"0:52.340\"/>"));

    // 4. Test completely empty session
    let meta = json!({ "session_id": "empty_session", "car_name": "Test" });
    let (ld_empty, ldx_empty) = motec::export_ld(&meta, &[], &[]).unwrap();
    assert_eq!(ld_empty.len(), 18468);
    let xml_empty = String::from_utf8(ldx_empty).unwrap();
    assert!(xml_empty.contains("<String Id=\"Total Laps\" Value=\"0\"/>"));
}
