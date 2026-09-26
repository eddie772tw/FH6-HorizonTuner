use fh6_backend::tuning::legacy_cli as solver;
use serde_json::{json, Value};
use std::process::Command;

fn same(actual: &Value, expected: &Value) {
    if let (Some(a), Some(b)) = (actual.as_f64(), expected.as_f64()) {
        assert_eq!(a, b);
    } else if let (Some(a), Some(b)) = (actual.as_object(), expected.as_object()) {
        assert_eq!(a.len(), b.len());
        for (k, v) in b {
            assert!(a.contains_key(k), "Missing {k}");
            same(&a[k], v);
        }
    } else if let (Some(a), Some(b)) = (actual.as_array(), expected.as_array()) {
        assert_eq!(a.len(), b.len());
        for (a, b) in a.iter().zip(b) {
            same(a, b);
        }
    } else {
        assert_eq!(actual, expected);
    }
}
#[test]
fn frozen_python_solver_and_exports() {
    let fixtures: Value =
        serde_json::from_str(include_str!("fixtures/agent_cli_golden.json")).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let a = &case["args"];
        match case["kind"].as_str().unwrap() {
            "chassis" => {
                let c = solver::chassis(
                    a[0].as_f64().unwrap(),
                    a[1].as_f64().unwrap(),
                    a[2].as_str().unwrap(),
                    a[3].as_str().unwrap(),
                    a[4].as_f64().unwrap(),
                    a[5].as_f64().unwrap(),
                );
                same(&c, &case["result"]);
                same(&solver::applied(&c, None), &case["applied"]);
            }
            "gearing" => same(
                &solver::gearing(
                    a[0].as_f64().unwrap(),
                    a[1].as_f64().unwrap(),
                    a[2].as_f64().unwrap(),
                    a[3].as_i64().unwrap(),
                    a[4].as_f64().unwrap(),
                ),
                &case["result"],
            ),
            "full" => {
                let mut p = solver::preset(
                    "s1",
                    &solver::chassis(1400., 52., "RWD", "road", 0., 0.),
                    &solver::gearing(8000., 7200., 300., 6, 65.),
                );
                p.as_object_mut().unwrap().remove("createdAt");
                same(&p, &case["result"]);
            }
            _ => panic!("Unknown fixture"),
        }
    }
}
fn cli(args: &[&str], root: &std::path::Path, success: bool) -> Value {
    let executable = std::env::var_os("FH6_TEST_AGENT_EXE")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_fh6-agent").into());
    let result = Command::new(executable)
        .args(args)
        .args([
            "--json",
            "--backend-url",
            "http://127.0.0.1:1",
            "--data-dir",
        ])
        .arg(root)
        .output()
        .unwrap();
    assert_eq!(
        result.status.success(),
        success,
        "{}",
        String::from_utf8_lossy(&result.stdout)
    );
    serde_json::from_slice(&result.stdout).unwrap()
}
#[test]
fn offline_cli_commands_persistence_and_validation() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(cli(&["doctor"], root.path(), true)["mode"], "offline");
    let config = cli(&["mcp-config", "--client", "claude"], root.path(), true);
    assert_eq!(
        config["snippet"]["mcpServers"]["fh6-horizon-tuner"]["url"],
        "http://127.0.0.1:1/mcp"
    );
    let cars = cli(
        &["cars", "search", "Toyota", "--limit", "3"],
        root.path(),
        true,
    );
    assert_eq!(cars["count"], 3);
    assert!(
        cli(&["cars", "get", "247"], root.path(), true)["display_name"]
            .as_str()
            .unwrap()
            .contains("Toyota")
    );
    let c = cli(&["solve", "chassis", "--drive", "AWD"], root.path(), true);
    assert_eq!(c["anti_roll_bars"]["front"], 3.1);
    assert!(cli(
        &["solve", "chassis", "--export-applied-setup"],
        root.path(),
        true
    )
    .get("springsFront")
    .is_some());
    let g = cli(
        &[
            "solve",
            "gearing",
            "--max-rpm",
            "8500",
            "--peak-hp-rpm",
            "7800",
            "--top-speed",
            "320",
        ],
        root.path(),
        true,
    );
    assert_eq!(g["gears"].as_array().unwrap().len(), 6);
    let p = cli(
        &["solve", "full", "--car-id", "247", "--save", "測試 preset"],
        root.path(),
        true,
    );
    assert_eq!(p["saved_to_disk"], true);
    assert_eq!(p["synced_to_backend"], false);
    let read = cli(&["preset", "get", "247", "測試 preset"], root.path(), true);
    assert_eq!(read["parameters"], p["parameters"]);
    assert_eq!(
        cli(&["preset", "list"], root.path(), true)["presets"],
        json!(["247-測試 preset"])
    );
    let diagnosis = cli(
        &[
            "telemetry",
            "diagnose",
            "--tire-temps",
            "95",
            "95",
            "82",
            "82",
            "--symptom",
            "understeer_entry",
        ],
        root.path(),
        true,
    );
    assert_eq!(diagnosis["axle_delta_t_c"], 13.0);
    assert_eq!(diagnosis["source"], "offline_fallback");
    for args in [
        vec!["solve", "full", "--save", "../escape"],
        vec!["preset", "get", "../../x", "escape"],
        vec!["solve", "chassis", "--weight", "NaN"],
        vec!["solve", "full", "--gears", "1000000000"],
        vec!["solve", "full", "--tire-diameter", "0"],
        vec!["solve", "gearing"],
        vec!["telemetry", "diagnose"],
        vec!["telemetry", "snapshot"],
        vec!["mcp-call", "get_system_settings", "--args", "[]"],
    ] {
        assert!(cli(&args, root.path(), false).get("error").is_some());
    }
}
