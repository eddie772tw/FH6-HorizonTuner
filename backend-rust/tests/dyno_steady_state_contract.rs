use fh6_backend::telemetry::{
    collect_dyno_sample, reconcile_dyno_profile_segment, DynoQualityGateRegistry,
};
use serde_json::{json, Value};
use std::{hint::black_box, time::Instant};

fn frame(idx: usize, rpm: f64, pw: f64, tq: f64, ord: i64) -> Value {
    json!({
        "TimestampMS": 1000 + idx * 16, "PositionX": 0.0, "PositionY": 0.0,
        "PositionZ": idx as f64 * 0.16, "SpeedMetersPerSecond": 10.0, "Gear": 4,
        "CarOrdinal": ord, "CarClass": 700, "CarPerformanceIndex": 800,
        "CurrentEngineRpm": rpm, "PowerWatts": pw, "TorqueNewtons": tq,
        "AccelInput": 255, "ClutchInput": 0, "BrakeInput": 0, "HandBrakeInput": 0,
        "TireSlipRatio": [0.0, 0.0, 0.0, 0.0]
    })
}

#[test]
fn dyno_steady_state_reconciliation_and_bucket_overflow_preserve_exact_values() {
    let mut reg = DynoQualityGateRegistry::default();
    let cfg = json!({"dyno_recording": true, "dyno_test_gear": 4, "dyno_filter_slip": true, "dyno_filter_transients": false});
    let mut prof = json!({"drivetrain": "RWD", "dyno_curve": {"3950": {"hp": 300.0, "torque": 280.0}, "4050": {"hp": 310.0, "torque": 290.0}}});
    for i in 0..80 {
        let hp_w = (295.0 + (i % 7) as f64) * 745.7;
        let f = frame(i, 4000.0, hp_w, (275.0 + (i % 5) as f64) / 0.73756, 42);
        let q = reg.observe("42", &f);
        assert!(!reconcile_dyno_profile_segment(&mut prof, &q));
        assert_eq!(
            collect_dyno_sample(&mut prof, &f, &q, &cfg, &reg, "42"),
            q.can_collect
        );
    }
    assert_eq!(
        prof["dyno_quality"],
        json!({"status": "confident", "confidence": 1.0, "reasons": [], "canCollect": true, "segmentId": 0, "segmentReset": false})
    );
    let b = &prof["dyno_curve"]["4000"];
    assert_eq!(b["hp_hist"].as_array().unwrap().len(), 50);
    assert_eq!(b["torque_hist"].as_array().unwrap().len(), 50);
    assert!((b["hp"].as_f64().unwrap() - 298.0).abs() < 2.0);
    let rq = reg.observe("42", &frame(80, 4000.0, 220000.0, 380.0, 99));
    assert!(reconcile_dyno_profile_segment(&mut prof, &rq));
    assert_eq!(prof["dyno_quality"]["status"], "unavailable");
    assert_eq!(prof["dyno_quality"]["segmentReset"], true);
}

#[test]
#[ignore = "release-only performance evidence; no timing pass threshold"]
fn dyno_steady_state_performance_probe() {
    assert!(!cfg!(debug_assertions), "Use cargo test --release");
    let cfg = json!({"dyno_recording": true, "dyno_test_gear": 4, "dyno_filter_slip": true, "dyno_filter_transients": false});
    let frames: Vec<_> = (0..10_000)
        .map(|i| {
            frame(
                i,
                4000.0 + ((i % 4) * 50) as f64,
                220_000.0 + (i % 10) as f64 * 100.0,
                380.0 + (i % 10) as f64,
                42,
            )
        })
        .collect();
    let mut best_ms = f64::INFINITY;
    for _ in 0..5 {
        let (mut reg, mut prof) = (
            DynoQualityGateRegistry::default(),
            json!({"drivetrain": "RWD", "dyno_curve": {}}),
        );
        let started = Instant::now();
        for f in &frames {
            let q = reg.observe("42", f);
            let _ = reconcile_dyno_profile_segment(&mut prof, &q);
            black_box(collect_dyno_sample(&mut prof, f, &q, &cfg, &reg, "42"));
        }
        best_ms = best_ms.min(started.elapsed().as_secs_f64() * 1000.0);
        black_box(prof);
    }
    println!("dyno_10000_frames_best_ms={best_ms:.3}");
}
