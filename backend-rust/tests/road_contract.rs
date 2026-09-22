use fh6_backend::road::RoadService;
use fh6_backend::road::{
    capture_sample, local_comparison, summarize_laps, summarize_road_observations, RoadStore,
};
use fh6_backend::telemetry::TelemetryStore;
use serde_json::{json, Value};
use std::sync::Arc;

fn point(ms: i64, lap: i64, current: f64) -> Value {
    json!({"TimestampMS":ms,"IsRaceOn":1,"LapNumber":lap,"CurrentLap":current,"LastLap":0,"SpeedMetersPerSecond":20.0,"PositionX":ms as f64 * 0.02,"PositionY":0.0,"PositionZ":0.0,"TireTemp":[185.0,null,140.0,240.0],"SuspTravel":[0.96,0.3,0.2,0.3],"TireSlipAngle":[0.2,0.2,0.05,0.05],"TireSlipRatio":[0.1,0.1,0.1,0.1],"AccelerationX":4.5})
}

#[test]
fn analysis_and_lap_summary_keep_python_wire_shape() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/road_observation_contract.json"
    ))
    .unwrap();
    let points = fixture["points"].as_array().unwrap().clone();
    let summary = summarize_road_observations(&points);
    assert_eq!(summary["methodVersion"], "road-observations/v1");
    assert_eq!(summary["sampleCount"], 6);
    assert!((summary["quality"]["observedSeconds"].as_f64().unwrap() - 0.4).abs() < 1e-9);
    assert!((summary["quality"]["gapSeconds"].as_f64().unwrap() - 0.8).abs() < 1e-9);
    assert_eq!(summary["wheels"]["FL"]["startTemperatureC"], 85.0);
    assert!((summary["laps"][0]["observedSeconds"].as_f64().unwrap() - 0.4).abs() < 1e-9);
    assert_eq!(summarize_laps(&points)[0]["complete"], false);
}

#[test]
fn capture_sample_declares_missing_channels_and_zero_fills_fixed_vectors() {
    let sample = capture_sample(&json!({"TimestampMS":100,"WheelRotationSpeed":[0,null,2,3]}));
    assert_eq!(sample["timestampMS"], 100);
    assert_eq!(sample["powerWatts"], Value::Null);
    assert_eq!(sample["angularVelocity"], json!([null, null, null]));
    assert_eq!(sample["wheelRotationSpeed"], json!([0, null, 2, 3]));
    let missing = sample["missingChannels"].as_array().unwrap();
    assert!(missing.iter().any(|x| x == "PowerWatts"));
    assert!(missing.iter().any(|x| x == "WheelRotationSpeed.1"));
    assert!(!missing.iter().any(|x| x == "WheelRotationSpeed.0"));
}

#[test]
fn road_store_preserves_append_only_schema_and_atomic_batch() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("road.sqlite");
    let store = RoadStore::new(path.to_string_lossy()).unwrap();
    let mut first =
        RoadStore::document("setup", "workflow", &json!({"label":"A"}), Some("setup-a"));
    // CI exposed a one-ULP change when reloading this timestamp through JSON.
    // Immutable Road documents require exact round trips, including f64 values.
    first["createdAt"] = json!(1790061494.4082587_f64);
    store.append_documents(&[first.clone()]).unwrap();
    assert_eq!(
        store
            .get("setup-a", Some("setup"), Some("workflow"))
            .unwrap(),
        first
    );
    assert_eq!(
        store
            .list(Some("workflow"), Some("setup"), false)
            .unwrap()
            .len(),
        1
    );
    let duplicate =
        RoadStore::document("setup", "workflow", &json!({"label":"B"}), Some("setup-a"));
    assert!(store.append_documents(&[duplicate]).is_err());
    assert_eq!(
        store.list(Some("workflow"), Some("setup"), false).unwrap()[0]["label"],
        "A"
    );
}

#[test]
fn local_match_requires_spatially_compatible_driving_points() {
    let a: Vec<_> = (0..30).map(|i| point(i * 100, 0, i as f64 * 0.1)).collect();
    let b: Vec<_> = a
        .iter()
        .map(|p| {
            let mut x = p.clone();
            x["TireSlipAngle"] = json!([0.3, 0.3, 0.15, 0.15]);
            x
        })
        .collect();
    let report = local_comparison(&a, &b, true);
    assert_eq!(report["routeStatus"], "compatible");
    assert!(report["matchedLocations"].as_u64().unwrap_or(0) >= 20);
}

#[test]
fn road_service_lifecycle_uses_batched_telemetry_and_persists_summary() {
    let temp = tempfile::tempdir().unwrap();
    let telemetry_path = temp.path().join("telemetry.sqlite");
    let road_path = temp.path().join("road.sqlite");
    let telemetry = Arc::new(TelemetryStore::new(&telemetry_path).unwrap());
    let store = RoadStore::new(road_path.to_string_lossy()).unwrap();
    let mut service = RoadService::new(telemetry, store);
    let first = json!({"TimestampMS":100,"IsRaceOn":1,"CurrentRaceTime":0.1,"CarOrdinal":42,"CarPerformanceIndex":700,"DrivetrainType":1,"CarClass":3,"SpeedMetersPerSecond":20.0,"LapNumber":0,"CurrentLap":0.1,"TireTemp":[185,185,185,185]});
    let second = json!({"TimestampMS":200,"IsRaceOn":1,"CurrentRaceTime":0.2,"CarOrdinal":42,"CarPerformanceIndex":700,"DrivetrainType":1,"CarClass":3,"SpeedMetersPerSecond":20.0,"LapNumber":0,"CurrentLap":0.2,"TireTemp":[185,185,185,185]});
    service.observe(&first);
    service.observe(&second);
    let workflow = service.create(json!({"identity":{"ordinal":42,"performanceIndex":700,"drivetrain":1},"carName":"Test","event":{"name":"Road","format":"sprint","driverAssists":"unknown","conditions":"unknown"}})).unwrap();
    let setup = service
        .store
        .list(Some(workflow["id"].as_str().unwrap()), Some("setup"), false)
        .unwrap()
        .remove(0);
    let run = service.start_run(workflow["id"].as_str().unwrap(),&json!({"setupId":setup["id"],"settingsConfirmed":true,"otherSettings":"unchanged","tires":"unchanged","conditions":"unchanged","driverAssists":"unchanged"})).unwrap();
    service.observe(&json!({"TimestampMS":300,"IsRaceOn":1,"CurrentRaceTime":0.3,"CarOrdinal":42,"CarPerformanceIndex":700,"DrivetrainType":1,"CarClass":3,"SpeedMetersPerSecond":20.0,"LapNumber":0,"CurrentLap":0.3,"TireTemp":[185,185,185,185]}));
    assert_eq!(service.live()["sampleCount"], 1);
    service.stop().unwrap();
    let summaries = service
        .store
        .list(
            Some(workflow["id"].as_str().unwrap()),
            Some("summary"),
            false,
        )
        .unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0]["runId"], run["id"]);
    assert_eq!(summaries[0]["observations"]["sampleCount"], 1);
}

#[test]
fn road_workflow_candidate_comparison_decision_and_recovery_preserve_links() {
    let temp = tempfile::tempdir().unwrap();
    let telemetry = Arc::new(TelemetryStore::new(&temp.path().join("telemetry.sqlite")).unwrap());
    let store = RoadStore::new(temp.path().join("road.sqlite").to_string_lossy()).unwrap();
    let mut service = RoadService::new(telemetry.clone(), store);
    let frame = |ms: i64, t: f64, x: f64| json!({"TimestampMS":ms,"IsRaceOn":1,"CurrentRaceTime":t,"CarOrdinal":42,"CarPerformanceIndex":700,"DrivetrainType":1,"CarClass":3,"SpeedMetersPerSecond":20.0,"PositionX":x,"PositionY":0.0,"PositionZ":0.0,"LapNumber":0,"CurrentLap":t,"TireTemp":[185,185,185,185],"TireSlipAngle":[0.1,0.1,0.1,0.1],"TireSlipRatio":[0.1,0.1,0.1,0.1]});
    service.observe(&frame(100, 0.1, 0.0));
    service.observe(&frame(200, 0.2, 2.0));
    let workflow=service.create(json!({"identity":{"ordinal":42,"performanceIndex":700,"drivetrain":1},"carName":"Test","event":{"name":"Road","format":"sprint","driverAssists":"unchanged","conditions":"unchanged"}})).unwrap();
    let wf = workflow["id"].as_str().unwrap().to_owned();
    let setup = service
        .store
        .list(Some(&wf), Some("setup"), false)
        .unwrap()
        .remove(0);
    let start = |service: &mut RoadService, setup: &Value, start_ms: i64| {
        let run=service.start_run(&wf,&json!({"setupId":setup["id"],"settingsConfirmed":true,"otherSettings":"unchanged","tires":"unchanged","conditions":"unchanged","driverAssists":"unchanged"})).unwrap();
        for i in 1..=25 {
            service.observe(&frame(start_ms + i * 100, i as f64 / 10.0, i as f64 * 2.0));
        }
        service.stop().unwrap();
        let finish=service.store.append("finish",&wf,&json!({"runId":run["id"],"completed":true,"clean":"confirmed","timeSeconds":2.5,"source":"game-confirmed"}),None).unwrap();
        (run, finish)
    };
    let (baseline_run, _) = start(&mut service, &setup, 1000);
    let candidate=service.handle("POST",&format!("/api/road/workflows/{wf}/candidates"),Some(&json!({"baselineRunId":baseline_run["id"],"parameter":"pressure.front","baseline":{"value":28.0,"unit":"psi","minimum":15.0,"maximum":55.0,"step":0.5},"candidateValue":28.5,"baselineValueUnchanged":true,"hypothesis":"one step","source":"one-game-step-exploration"}))).unwrap();
    let (candidate_run, _) = start(&mut service, &candidate, 5000);
    let report=service.handle("POST",&format!("/api/road/workflows/{wf}/comparisons"),Some(&json!({"baselineRunIds":[baseline_run["id"]],"candidateRunIds":[candidate_run["id"]]}))).unwrap();
    assert_eq!(
        report["independentRuns"],
        json!({"baseline":1,"candidate":1})
    );
    assert_eq!(report["evidenceLevel"], "descriptive");
    let decision = service
        .handle(
            "POST",
            &format!("/api/road/workflows/{wf}/decisions"),
            Some(&json!({"reportId":report["id"],"choice":"keep-candidate"})),
        )
        .unwrap();
    let promoted = service
        .store
        .get(
            decision["setupId"].as_str().unwrap(),
            Some("setup"),
            Some(&wf),
        )
        .unwrap();
    assert_eq!(promoted["baselineSetupId"], Value::Null);
    assert_eq!(promoted["basisSetupId"], candidate["id"]);
    let mut restored = RoadService::new(
        telemetry,
        RoadStore::new(temp.path().join("road.sqlite").to_string_lossy()).unwrap(),
    );
    restored.recover().unwrap();
    assert!(
        restored
            .store
            .list(Some(&wf), Some("summary"), false)
            .unwrap()
            .len()
            >= 2
    );
}

#[test]
fn engine_observation_endpoint_keeps_immutable_capture_and_history_shapes() {
    let temp = tempfile::tempdir().unwrap();
    let telemetry = Arc::new(TelemetryStore::new(&temp.path().join("telemetry.sqlite")).unwrap());
    let store = RoadStore::new(temp.path().join("road.sqlite").to_string_lossy()).unwrap();
    let mut service = RoadService::new(telemetry, store);
    let bins: Vec<_> = (0..8).map(|index| json!({"index":index,"sampleCount":10,"averageRpm":3000.0,"averagePowerWatts":200000.0,"averageTorqueNewtons":400.0,"rpmSum":30000.0,"powerWattsSum":2000000.0,"torqueNewtonsSum":4000.0})).collect();
    let payload = json!({"observation":{"schema":"engine-observation/v1","id":"engine-42","carId":"42","source":"measured","capturedAt":1000,"dependencyKey":"k","data":{"carId":"42","status":"ready","engineMaxRpm":8000,"acceptedMs":6000,"identity":{"ordinal":42,"performanceIndex":700,"carClass":3},"bins":bins}},"capture":{"schemaVersion":"tuning-capture/v1","metadata":{"carId":"42"},"references":{"engineObservationId":"engine-42","dependencyKey":"k"},"samples":[{"carOrdinal":"42","engineMaxRpm":8000,"powerWatts":200000,"torqueNewtons":400}]}});
    let saved = service
        .handle("POST", "/api/road/engine-observations", Some(&payload))
        .unwrap();
    assert_eq!(saved, payload["observation"]);
    let history = service
        .handle("GET", "/api/road/engine-observations", None)
        .unwrap();
    assert_eq!(history, json!([payload["observation"]]));
    let capture = service
        .handle(
            "GET",
            "/api/road/engine-observations/engine-42/capture",
            None,
        )
        .unwrap();
    assert_eq!(capture, payload["capture"]);
    let mut changed = payload.clone();
    changed["observation"]["capturedAt"] = json!(1001);
    assert!(service
        .handle("POST", "/api/road/engine-observations", Some(&changed))
        .is_err());
}
