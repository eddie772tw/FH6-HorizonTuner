use fh6_backend::{app::App, mcp::McpServer};
use serde_json::{json, Value};

fn call(server: &mut McpServer, app: &App, name: &str, args: Value) -> Value {
    server.handle(app, &json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}})).unwrap().unwrap()
}

#[test]
fn automatic_tuning_is_discoverable_without_a_developer_switch_and_discloses_game_control() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let mut server = McpServer::default();
    let list = server
        .handle(&app, &json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}))
        .unwrap()
        .unwrap();
    let tools = list["result"]["tools"].as_array().unwrap();
    let start = tools
        .iter()
        .find(|t| t["name"] == "start_auto_tuning")
        .unwrap();
    assert_eq!(start["annotations"]["readOnlyHint"], false);
    assert_eq!(start["annotations"]["destructiveHint"], true);
    assert!(start["description"]
        .as_str()
        .unwrap()
        .contains("native computer-use"));
    assert!(start["inputSchema"]["properties"]
        .get("experimentalNoticeAcknowledged")
        .is_none());
    let status = call(&mut server, &app, "get_auto_tuning_status", json!({}));
    let body: Value =
        serde_json::from_str(status["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(body["developerOptions"], false);
    assert_eq!(body["experimental"], true);
    assert!(body["run"].is_null());
    assert!(!root.path().join("auto-tune/developer-options").exists());
    let response = call(
        &mut server,
        &app,
        "start_auto_tuning",
        json!({"goal":"Road","season":"Winter","expectedCarName":"1964 Aston Martin DB5","requestId":"contract-test"}),
    );
    // A headless test has no packaged runtime; importantly it reaches runtime
    // availability without requiring a developer switch or acknowledgement flag.
    assert!(response["error"]["message"]
        .as_str()
        .unwrap()
        .contains("packaged Windows"));
}

#[test]
fn rejects_missing_identity_invalid_goals_and_arbitrary_screenshot_paths() {
    let root = tempfile::tempdir().unwrap();
    let app = App::new(root.path()).unwrap();
    let mut server = McpServer::default();
    for args in [
        json!({"goal":"Road","season":"Winter"}),
        json!({"goal":"Drift","season":"Winter","expectedCarName":"DB5","requestId":"x"}),
    ] {
        assert!(call(&mut server, &app, "start_auto_tuning", args)
            .get("error")
            .is_some());
    }
    assert!(call(
        &mut server,
        &app,
        "get_auto_tuning_screenshot",
        json!({"runId":"../../settings.json"})
    )
    .get("error")
    .is_some());
    assert!(!root.path().join("auto-tune").exists());
}
