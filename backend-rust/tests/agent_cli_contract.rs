use serde_json::{json, Value};
use std::process::Command;
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
fn offline_metadata_and_unverified_presets_still_work() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(cli(&["doctor"], root.path(), true)["mode"], "offline");
    assert_eq!(
        cli(
            &["cars", "search", "Toyota", "--limit", "3"],
            root.path(),
            true
        )["count"],
        3
    );
    assert!(
        cli(&["cars", "get", "247"], root.path(), true)["display_name"]
            .as_str()
            .unwrap()
            .contains("Toyota")
    );
    let directory = cli(&["preset", "list"], root.path(), true)["directory"]
        .as_str()
        .unwrap()
        .to_owned();
    let dir = std::path::Path::new(&directory);
    std::fs::create_dir_all(dir).unwrap();
    let original = json!({"schemaVersion":"unverified-test-preset","parameters":{"spring":123}});
    std::fs::write(
        dir.join("247-static.json"),
        serde_json::to_vec(&original).unwrap(),
    )
    .unwrap();
    assert_eq!(
        cli(&["preset", "get", "247", "static"], root.path(), true),
        original
    );
    assert_eq!(
        cli(&["preset", "list"], root.path(), true)["presets"],
        json!(["247-static"])
    );
    assert!(cli(
        &["preset", "get", "../../escape", "bad"],
        root.path(),
        false
    )
    .get("error")
    .is_some());
    assert!(cli(
        &["mcp-call", "get_system_settings", "--args", "[]"],
        root.path(),
        false
    )
    .get("error")
    .is_some());
}
