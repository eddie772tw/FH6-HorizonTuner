//! Opt-in release microbenchmarks. Timings are evidence, never CI pass thresholds.
use fh6_backend::{
    config_service::ConfigService,
    road::{local_comparison, summarize_road_observations},
    telemetry::TelemetryStore,
};
use serde_json::{json, Value};
use std::{hint::black_box, time::Instant};

fn points(count: usize) -> Vec<Value> {
    (0..count)
        .map(|i| {
            let wave = (i as f64 / 30.0).sin();
            json!({
                "TimestampMS": i * 16, "time": i as f64 * 0.016,
                "IsRaceOn": 1, "LapNumber": 0, "CurrentLap": i as f64 * 0.016,
                "LastLap": 0, "SpeedMetersPerSecond": 30.0 + wave,
                "PositionX": i as f64 * 0.5, "PositionY": 0.0, "PositionZ": 0.0,
                "CurrentEngineRpm": 4500.0, "PowerWatts": 180000.0,
                "TorqueNewtons": 400.0, "Gear": 3, "AccelInput": 220,
                "BrakeInput": 0, "SteerInput": 0,
                "TireTemp": [185.0 + wave, 190.0, 175.0, 180.0],
                "NormalizedSuspensionTravel": [0.5, 0.6, 0.4, 0.5],
                "TireSlipRatio": [0.1, 0.2, 0.3, 0.4],
                "TireSlipAngle": [0.2, 0.3, 0.1, 0.2],
                "AccelerationX": wave, "AccelerationY": 0.0, "AccelerationZ": 0.0
            })
        })
        .collect()
}

fn report(name: &str, mut samples: Vec<f64>) {
    samples.sort_by(f64::total_cmp);
    println!(
        "{}",
        json!({"probe":name,"median_ms":samples[samples.len()/2],"samples_ms":samples})
    );
}

fn measure(name: &str, mut run: impl FnMut()) {
    run(); // Warm caches before collecting independent samples.
    let samples = (0..7)
        .map(|_| {
            let start = Instant::now();
            run();
            start.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    report(name, samples);
}

#[test]
#[ignore = "release-only performance evidence; no timing pass threshold"]
fn backend_performance_probe() {
    assert!(!cfg!(debug_assertions), "Use cargo test --release");
    let points = points(10_000);
    measure("road_summary_10000", || {
        black_box(summarize_road_observations(black_box(&points)));
    });
    measure("road_matching_4000", || {
        black_box(local_comparison(
            black_box(&points[..4000]),
            &points[..4000],
            true,
        ));
    });
    let root = tempfile::tempdir().unwrap();
    let config = ConfigService::new(root.path()).unwrap();
    measure("language_100_reads", || {
        for _ in 0..100 {
            black_box(
                config
                    .handle("GET", "/api/languages/zh-tw", &Value::Null)
                    .unwrap()
                    .unwrap(),
            );
        }
    });
    let mut samples = Vec::new();
    for _ in 0..7 {
        let root = tempfile::tempdir().unwrap();
        let store = TelemetryStore::new(&root.path().join("probe.sqlite")).unwrap();
        store
            .create_session("probe", 42, "Probe", 3, 700, 0.0)
            .unwrap();
        let start = Instant::now();
        store
            .insert_points_batch("probe", black_box(&points[..1000]))
            .unwrap();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
        assert_eq!(
            store.get_telemetry_points("probe", None).unwrap().len(),
            1000
        );
    }
    report("sqlite_insert_1000", samples);
}
