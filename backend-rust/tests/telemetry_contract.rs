use axum::http::HeaderMap;
use fh6_backend::telemetry::{
    collect_dyno_sample, decoded_point, pack_binary, parse_packet, DragRecorder, DynoQualityGate,
    DynoQualityGateRegistry, RaceRecorder, RaceRecorderConfig, RecorderCommand, TelemetryStore,
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
