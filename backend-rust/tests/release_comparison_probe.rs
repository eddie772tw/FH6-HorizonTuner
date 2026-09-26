//! Opt-in comparison probe; build once with `cargo test --release --no-run`.
use fh6_backend::road::{local_comparison, summarize_road_observations};
use serde_json::{json, Value};
use std::{fs, hint::black_box, time::Instant};

fn measure(mut f: impl FnMut(), samples: usize) -> Vec<f64> {
    f();
    (0..samples)
        .map(|_| {
            let start = Instant::now();
            f();
            start.elapsed().as_secs_f64() * 1000.0
        })
        .collect()
}

#[test]
#[ignore = "cross-version release comparison; set fixture/result env vars"]
fn release_comparison_probe() {
    assert!(!cfg!(debug_assertions), "use the release test executable");
    let fixture = fs::read(std::env::var("FH6_BENCH_FIXTURE").unwrap()).unwrap();
    let points: Vec<Value> = serde_json::from_slice(&fixture).unwrap();
    assert!(points.len() >= 4000);
    let samples = std::env::var("FH6_BENCH_SAMPLES")
        .unwrap()
        .parse::<usize>()
        .unwrap();
    assert!(matches!(samples, 1 | 3));
    let mut summary = Value::Null;
    let summary_ms = measure(
        || summary = black_box(summarize_road_observations(black_box(&points))),
        samples,
    );
    let a = &points[..4000];
    let mut matching = Value::Null;
    let matching_ms = measure(
        || matching = black_box(local_comparison(black_box(a), black_box(a), true)),
        samples,
    );
    let result = json!({
        "version":"rust", "summary":summary, "matching":matching,
        "summary_ms":summary_ms, "matching_ms":matching_ms
    });
    fs::write(
        std::env::var("FH6_BENCH_RESULT").unwrap(),
        serde_json::to_vec(&result).unwrap(),
    )
    .unwrap();
}
