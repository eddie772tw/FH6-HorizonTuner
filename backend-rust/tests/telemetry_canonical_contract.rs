use fh6_backend::{app::App, mcp::McpService};
use serde_json::Value;
use std::sync::Arc;

const FIXTURES_STR: &str = include_str!("../../tests/fixtures/telemetry_canonical_fixtures.json");

fn test_app() -> (Arc<App>, tempfile::TempDir) {
    let root = tempfile::tempdir().expect("test directory");
    std::fs::write(
        root.path().join("settings.json"),
        r#"{"language":"en-us","speedUnit":"kmh"}"#,
    )
    .unwrap();
    std::fs::write(
        root.path().join("hud_config.json"),
        r#"{"enabled":true,"showTeleMaster":true}"#,
    )
    .unwrap();
    std::fs::create_dir_all(root.path().join("logs")).unwrap();
    std::fs::write(root.path().join("logs/backend.log"), "fixture log\n").unwrap();
    let app = App::new(root.path()).expect("test app");
    (app, root)
}

fn assert_json_close(actual: &Value, expected: &Value, path: &str) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            let x = a.as_f64().unwrap();
            let y = b.as_f64().unwrap();
            assert!(
                (x - y).abs() <= 0.15_f64.max(y.abs() * 1e-3),
                "{}: {} != {}",
                path,
                x,
                y
            );
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{} length", path);
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                assert_json_close(x, y, &format!("{}[{}]", path, i));
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len(), "{} keys count", path);
            for (k, y) in b {
                assert!(a.contains_key(k), "{}.{} missing", path, k);
                assert_json_close(&a[k], y, &format!("{}.{}", path, k));
            }
        }
        _ => assert_eq!(actual, expected, "{}", path),
    }
}

#[test]
fn rust_mcp_matches_telemetry_canonical_fixtures() {
    let (app, _root) = test_app();
    let fixtures_val: Value =
        serde_json::from_str(FIXTURES_STR).expect("parse canonical fixtures json");
    let fixtures = fixtures_val["fixtures"].as_array().expect("fixtures array");
    let service = McpService::new(&app);

    for fixture in fixtures {
        let id = fixture["id"].as_str().unwrap_or("unknown");
        let raw = &fixture["raw_packet"];
        let expected_pres = &fixture["expected_presentation"];

        // 1. Driver cockpit
        let actual_cockpit = service.format_driver_cockpit(raw);
        let expected_cockpit = &expected_pres["mcp_driver_cockpit"];
        assert_json_close(
            &actual_cockpit,
            expected_cockpit,
            &format!("{id}.mcp_driver_cockpit"),
        );

        // 2. Vehicle dynamics
        let actual_dynamics = service.format_vehicle_dynamics(raw);
        let expected_dynamics = &expected_pres["mcp_vehicle_dynamics"];
        assert_json_close(
            &actual_dynamics,
            expected_dynamics,
            &format!("{id}.mcp_vehicle_dynamics"),
        );

        // 3. Tires status
        let actual_tires = service.format_tires_status(raw);
        let expected_tires = &expected_pres["mcp_tires_status"];
        assert_json_close(
            &actual_tires,
            expected_tires,
            &format!("{id}.mcp_tires_status"),
        );

        // 4. Suspension
        let actual_susp = service.format_suspension(raw);
        let expected_susp = &expected_pres["mcp_suspension"];
        assert_json_close(&actual_susp, expected_susp, &format!("{id}.mcp_suspension"));
    }
}

#[test]
fn canonical_domain_and_presentation_conversions() {
    let fixtures_val: Value =
        serde_json::from_str(FIXTURES_STR).expect("parse canonical fixtures json");
    let fixtures = fixtures_val["fixtures"].as_array().expect("fixtures array");

    for fixture in fixtures {
        let id = fixture["id"].as_str().unwrap_or("unknown");
        let raw = &fixture["raw_packet"];
        let canonical = &fixture["expected_canonical"];
        let pres = &fixture["expected_presentation"];

        // Speed
        let speed_ms = raw["SpeedMetersPerSecond"].as_f64().unwrap();
        assert_eq!(speed_ms, canonical["speed_ms"].as_f64().unwrap());
        let kmh = (speed_ms * 3.6 * 10.0).round() / 10.0;
        assert_eq!(kmh, pres["speed_kmh"].as_f64().unwrap(), "{id} speed_kmh");

        // Boost
        let boost_pa = raw["Boost"].as_f64().unwrap();
        assert_eq!(boost_pa, canonical["boost_pa"].as_f64().unwrap());
        let bar = (boost_pa / 100000.0 * 1000.0).round() / 1000.0;
        assert_eq!(bar, pres["boost_bar"].as_f64().unwrap(), "{id} boost_bar");
        let psi = (boost_pa * 0.0001450377 * 100.0).round() / 100.0;
        assert_eq!(psi, pres["boost_psi"].as_f64().unwrap(), "{id} boost_psi");
        let kpa = (boost_pa / 1000.0 * 10.0).round() / 10.0;
        assert_eq!(kpa, pres["boost_kpa"].as_f64().unwrap(), "{id} boost_kpa");

        // Accelerations
        let ax = raw["AccelerationX"].as_f64().unwrap();
        let ay = raw["AccelerationY"].as_f64().unwrap();
        let az = raw["AccelerationZ"].as_f64().unwrap();
        assert_eq!(ax, canonical["accel_x_ms2"].as_f64().unwrap());
        assert_eq!(ay, canonical["accel_y_ms2"].as_f64().unwrap());
        assert_eq!(az, canonical["accel_z_ms2"].as_f64().unwrap());

        let lat_g = (ax / 9.81 * 10.0).round() / 10.0;
        let vert_g = (ay / 9.81 * 10.0).round() / 10.0;
        let long_g = (az / 9.81 * 10.0).round() / 10.0;
        assert_eq!(lat_g, pres["lateral_g"].as_f64().unwrap(), "{id} lateral_g");
        assert_eq!(
            vert_g,
            pres["vertical_g"].as_f64().unwrap(),
            "{id} vertical_g"
        );
        assert_eq!(
            long_g,
            pres["longitudinal_g"].as_f64().unwrap(),
            "{id} longitudinal_g"
        );

        // Inputs
        let accel_raw = raw["AccelInput"].as_f64().unwrap();
        let brake_raw = raw["BrakeInput"].as_f64().unwrap();
        let clutch_raw = raw["ClutchInput"].as_f64().unwrap();
        let handbrake_raw = raw["HandBrakeInput"].as_f64().unwrap();
        let steer_raw = raw["SteerInput"].as_f64().unwrap();

        let throttle_pct = (accel_raw / 255.0 * 1000.0).round() / 10.0;
        let brake_pct = (brake_raw / 255.0 * 1000.0).round() / 10.0;
        let clutch_pct = (clutch_raw / 255.0 * 1000.0).round() / 10.0;
        let handbrake_pct = (handbrake_raw / 255.0 * 1000.0).round() / 10.0;
        let steer_pct = (steer_raw / 127.0 * 1000.0).round() / 10.0;

        assert_eq!(
            throttle_pct,
            canonical["throttle_pct"].as_f64().unwrap(),
            "{id} throttle_pct"
        );
        assert_eq!(
            brake_pct,
            canonical["brake_pct"].as_f64().unwrap(),
            "{id} brake_pct"
        );
        assert_eq!(
            clutch_pct,
            canonical["clutch_pct"].as_f64().unwrap(),
            "{id} clutch_pct"
        );
        assert_eq!(
            handbrake_pct,
            canonical["handbrake_pct"].as_f64().unwrap(),
            "{id} handbrake_pct"
        );
        assert_eq!(
            steer_pct,
            canonical["steer_pct"].as_f64().unwrap(),
            "{id} steer_pct"
        );
    }
}
