use fh6_backend::motec;
use serde_json::{json, Value};

fn equivalent(actual: &Value, expected: &Value, path: &str) {
    if let (Some(a), Some(b)) = (actual.as_f64(), expected.as_f64()) {
        assert!(
            (a - b).abs() <= 1e-8 * b.abs().max(1.0),
            "{path}: {a} != {b}"
        );
    } else if let (Some(a), Some(b)) = (actual.as_object(), expected.as_object()) {
        assert_eq!(a.len(), b.len(), "{path}");
        for (k, v) in b {
            equivalent(&a[k], v, &format!("{path}.{k}"));
        }
    } else if let (Some(a), Some(b)) = (actual.as_array(), expected.as_array()) {
        assert_eq!(a.len(), b.len(), "{path}");
        for (i, (a, b)) in a.iter().zip(b).enumerate() {
            equivalent(a, b, &format!("{path}[{i}]"));
        }
    } else {
        assert_eq!(actual, expected, "{path}");
    }
}
#[test]
fn csv_and_debrief_match_python_reference() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/motec.json")).unwrap();
    let points = fixture["points"].as_array().unwrap();
    assert_eq!(
        String::from_utf8(motec::export(&fixture["metadata"], points).unwrap()).unwrap(),
        include_str!("fixtures/motec.csv")
    );
    let (metadata, points) = motec::import(include_bytes!("fixtures/motec.csv")).unwrap();
    equivalent(&metadata, &fixture["parsedMetadata"], "metadata");
    equivalent(&json!(points), &fixture["parsed"], "parsed");
    equivalent(
        &motec::debrief(fixture["points"].as_array().unwrap()),
        &fixture["debrief"],
        "debrief",
    );
    assert_eq!(motec::debrief(&[]), fixture["emptyDebrief"]);
}

#[test]
fn export_neutralizes_csv_formula_injection_in_metadata() {
    let cases = [
        ("=cmd|'/C calc'!A0", "+SUM(1,1)"),
        ("-2+3", "@SUM(1,1)"),
        ("  =HYPERLINK(\"http://evil.example\")", "\t=1+1"),
        ("\r=1+1", "\n=1+1"),
    ];
    let sample = [json!({"time": 0.1, "AccelerationX": -9.81})];
    for (session_id, car_name) in cases {
        let bytes = motec::export(
            &json!({"session_id": session_id, "car_name": car_name}),
            &sample,
        )
        .unwrap();
        let csv = String::from_utf8_lossy(&bytes);
        let (imported_meta, _) = motec::import(&bytes).unwrap();
        assert_eq!(imported_meta["session_id"], format!("'{session_id}"));
        assert_eq!(imported_meta["car_name"], format!("'{car_name}"));
        // Negative numeric telemetry values must remain numeric for MoTeC/spreadsheet parsing.
        assert!(
            csv.contains(",-1.000,"),
            "negative telemetry altered: {csv}"
        );
    }
    // Idempotence and benign hyphenated car names remain uncorrupted.
    let benign = motec::export(
        &json!({"session_id": "'=already_escaped", "car_name": "Porsche 911 - GT3"}),
        &sample,
    )
    .unwrap();
    let (benign_meta, _) = motec::import(&benign).unwrap();
    assert_eq!(benign_meta["session_id"], "'=already_escaped");
    assert_eq!(benign_meta["car_name"], "Porsche 911 - GT3");
}

#[test]
fn export_preserves_alias_precedence_nulls_and_large_session_throughput() {
    let meta = json!({"session_id": "perf-10k", "car_name": "Porsche 911 GT3"});
    let edge_points = vec![
        json!({
            "time": 0.0, "lap_distance": 12.5, "LapNumber": 1, "SpeedMetersPerSecond": 45.0,
            "CurrentEngineRpm": 7200, "Gear": 4, "AccelInput": 255, "BrakeInput": 0,
            "ClutchInput": 0, "HandBrakeInput": 0, "steer_pct": null, "SteerInput": 63.5,
            "AccelerationX": 9.81, "AccelerationZ": -4.905, "AccelerationY": 0.0,
            "Boost": 68947.5729, "Fuel": 0.85, "PowerWatts": null, "Power": 372850.0,
            "TorqueNewtons": 500.0, "Torque": 999.0,
            "SuspTravel": [0.4, 0.45, 0.5, 0.55],
            "SuspensionTravelMeters": [0.02, 0.021, 0.025, 0.026],
            "TireSlipAngle": [0.05, -0.04, 0.02, -0.01],
            "TireSlipRatio": [0.01, 0.02, 0.03, 0.04],
            "TireTemp": [180.0, 185.0, 190.0, 195.0],
            "PositionX": 100.0, "PositionY": 12.0, "PositionZ": -200.0
        }),
        json!({
            "time": 0.1, "steer_pct": 15.0, "SteerInput": 127.0,
            "Power": 223710.0, "Torque": 420.0, "TireTemp": [212.0]
        }),
        Value::Null,
    ];
    let edge_csv = String::from_utf8(motec::export(&meta, &edge_points).unwrap()).unwrap();
    let lines: Vec<&str> = edge_csv.lines().collect();
    // Row 1: PowerWatts=null blocks Power fallback; steer_pct=null falls back to SteerInput
    assert!(lines[9].contains(",50.000,1.000,-0.500,0.000,10.000,85.000,,500.000,"));
    // Row 2: steer_pct=15.0 wins over SteerInput; Power/Torque aliases apply when canonical absent
    assert!(lines[10].contains(",15.000,,,,,,300.000,420.000,"));
    assert!(lines[10].contains(",100.000,,,,"));
    // Row 3: non-object point emits 40 commas (41 empty cells)
    assert_eq!(lines[11], ",".repeat(40));

    let template = &edge_points[0];
    let points: Vec<Value> = (0..10_000)
        .map(|i| {
            let mut p = template.clone();
            p["time"] = json!(i as f64 * 0.016);
            p["lap_distance"] = json!(i as f64 * 0.75);
            p
        })
        .collect();
    let mut best_ms = f64::INFINITY;
    let mut total_bytes = 0usize;
    for _ in 0..5 {
        let t0 = std::time::Instant::now();
        let out = motec::export(&meta, &points).unwrap();
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        total_bytes = out.len();
        best_ms = best_ms.min(elapsed_ms);
    }
    assert!(total_bytes > 1_000_000);
    println!("motec::export 10000 points best_ms={best_ms:.3} bytes={total_bytes}");
}

#[test]
fn ld_resampling_rejects_oversized_and_non_finite_spans_without_oom() {
    let meta = json!({"session_id": "dos-guard", "car_name": "Test"});
    let cases = [
        // Two forged 32-bit UDP TimestampMS packets (0 ms -> u32::MAX ms ≈ 49.7 days).
        vec![json!({"time": 0.0}), json!({"time": 4_294_967.30})],
        // Just over the 2-hour 60 Hz ceiling (7,200.1 s -> 432,007 samples).
        vec![json!({"time": 0.0}), json!({"time": 7200.1})],
        // Extreme finite f64 timestamps whose difference overflows to +inf.
        vec![json!({"time": -1.0e308}), json!({"time": 1.0e308})],
    ];
    for points in &cases {
        let err = motec::export_ld(&meta, points, &[]).unwrap_err();
        assert_eq!(err.status, 422);
        assert!(motec::try_resample_to_grid(points, 60.0).is_err());
        assert!(motec::resample_to_grid(points, 60.0).is_empty());
    }
    let normal = [json!({"time": 0.0}), json!({"time": 1.0})];
    for bad_freq in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1.0e12] {
        assert_eq!(
            motec::try_resample_to_grid(&normal, bad_freq)
                .unwrap_err()
                .status,
            422
        );
        assert!(motec::resample_to_grid(&normal, bad_freq).is_empty());
    }
    assert_eq!(motec::resample_to_grid(&normal, 0.0).len(), 1);
    assert_eq!(motec::resample_to_grid(&normal, 60.0).len(), 61);
    assert!(motec::export_ld(&meta, &normal, &[]).is_ok());
}

#[test]
fn motec_import_and_ldx_handle_extreme_lap_numbers_without_overflow() {
    let headers: Vec<&str> = motec::MOTEC_CHANNELS.iter().map(|c| c.name).collect();
    let units: Vec<&str> = motec::MOTEC_CHANNELS.iter().map(|c| c.unit).collect();
    let row0 = format!("0.0,0.0,0{}", ",0.0".repeat(38));
    let row_max = format!("1.0,10.0,1e20{}", ",0.0".repeat(38));
    let csv = format!(
        "{}\r\n{}\r\n{row0}\r\n{row_max}\r\n",
        headers.join(","),
        units.join(",")
    );
    let (_, points) = motec::import(csv.as_bytes()).unwrap();
    assert_eq!(points[0]["LapNumber"], 1);
    assert_eq!(points[1]["LapNumber"], i64::MAX);

    let laps = [json!({"lap_number": i64::MAX, "lap_time": 60.0, "complete": true})];
    let pts = [
        json!({"LapNumber": i64::MAX, "time": 0.0}),
        json!({"LapNumber": i64::MAX, "time": 60.0}),
    ];
    let xml = motec::generate_ldx_xml(&laps, &pts);
    assert!(xml.contains("Id=\"Total Laps\" Value=\"1\""));
}
