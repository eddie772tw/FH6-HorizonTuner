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

// Count only allocations on this test thread, after the bounded histories are warm.
struct CountingAllocator;
thread_local! {
    static ALLOCATIONS: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
}
#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;
unsafe impl std::alloc::GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: std::alloc::Layout) -> *mut u8 {
        ALLOCATIONS.with(|count| count.set(count.get().map(|n| n + 1)));
        unsafe { std::alloc::System.alloc(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: std::alloc::Layout) {
        unsafe { std::alloc::System.dealloc(ptr, layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: std::alloc::Layout, size: usize) -> *mut u8 {
        ALLOCATIONS.with(|count| count.set(count.get().map(|n| n + 1)));
        unsafe { std::alloc::System.realloc(ptr, layout, size) }
    }
}

#[test]
fn warmed_collection_and_unchanged_quality_do_not_allocate() {
    let mut gate = DynoQualityGateRegistry::default();
    let settings =
        json!({"dyno_recording": true, "dyno_test_gear": 4, "dyno_filter_transients": false});
    let mut profile = json!({"drivetrain": "RWD", "dyno_curve": {}});
    for index in 0..100 {
        let data = frame(index, 4000.0, 220000.0, 380.0, 42);
        let quality = gate.observe("42", &data);
        reconcile_dyno_profile_segment(&mut profile, &quality);
        collect_dyno_sample(&mut profile, &data, &quality, &settings, &gate, "42");
    }
    let data = frame(100, 4000.0, 220000.0, 380.0, 42);
    let quality = gate.observe("42", &data);
    assert!(quality.can_collect);
    ALLOCATIONS.with(|count| count.set(Some(0)));
    let reset = reconcile_dyno_profile_segment(&mut profile, &quality);
    let changed = collect_dyno_sample(&mut profile, &data, &quality, &settings, &gate, "42");
    let allocations = ALLOCATIONS.with(|count| count.replace(None).unwrap());
    assert!(!reset);
    assert!(changed);
    assert_eq!(allocations, 0);
}

#[test]
fn dyno_collection_bounds_extreme_rpm_bucket_capacity_and_malformed_profiles() {
    let mut reg = DynoQualityGateRegistry::default();
    let cfg = json!({"dyno_recording": true, "dyno_test_gear": 4, "dyno_filter_slip": true, "dyno_filter_transients": false});
    let mut prof = json!({"drivetrain": "RWD", "dyno_curve": {}});
    let q = reg.observe("42", &frame(0, 4000.0, 220_000.0, 380.0, 42));
    assert!(q.can_collect);

    // Reject extreme finite RPMs that previously overflowed i64 buckets or grew dyno_curve unboundedly.
    for bad_rpm in [0.0, -500.0, 30_000.5, 1e20, f32::MAX as f64] {
        let f = frame(1, bad_rpm, 220_000.0, 380.0, 42);
        assert!(!collect_dyno_sample(&mut prof, &f, &q, &cfg, &reg, "42"));
    }
    assert!(prof["dyno_curve"].as_object().unwrap().is_empty());

    // Boundary RPM 30_000.0 remains valid and does not overflow neighbor offsets.
    let edge = frame(2, 30_000.0, 220_000.0, 380.0, 42);
    assert!(collect_dyno_sample(&mut prof, &edge, &q, &cfg, &reg, "42"));
    assert!(prof["dyno_curve"].get("30000").is_some());

    // Enforce bucket capacity cap on pre-seeded profiles while still permitting existing bucket updates.
    let mut full = serde_json::Map::new();
    for i in 0..601 {
        full.insert(format!("seeded_{i}"), json!({"hp": 100.0, "torque": 100.0}));
    }
    let mut capped = json!({"drivetrain": "RWD", "dyno_curve": full});
    let valid = frame(3, 4000.0, 220_000.0, 380.0, 42);
    assert!(!collect_dyno_sample(
        &mut capped,
        &valid,
        &q,
        &cfg,
        &reg,
        "42"
    ));
    assert_eq!(capped["dyno_curve"].as_object().unwrap().len(), 601);

    // Malformed persisted/API profile shapes must never panic the telemetry worker thread.
    for mut bad in [
        json!({"drivetrain": "RWD", "dyno_curve": null}),
        json!({"drivetrain": "RWD", "dyno_curve": [1, 2, 3]}),
        json!({"drivetrain": "RWD", "dyno_curve": {"4000": "corrupted"}}),
        json!({"drivetrain": "RWD", "dyno_curve": {"4000": {"hp_hist": 42, "torque_hist": null}}}),
    ] {
        assert!(collect_dyno_sample(&mut bad, &valid, &q, &cfg, &reg, "42"));
        assert_eq!(
            bad["dyno_curve"]["4000"]["hp_hist"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
}
