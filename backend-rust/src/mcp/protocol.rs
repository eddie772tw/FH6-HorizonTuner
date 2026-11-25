use serde_json::{json, Value};

pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2024-11-05", "2024-10-07", "2025-06-18"];
pub const SERVER_NAME: &str = "fh6-horizon-tuner-mcp";
pub const SERVER_VERSION: &str = "1.1.0";
pub const SERVER_INSTRUCTIONS: &str = "FH6-HorizonTuner is a localhost MCP server exposed by the running backend. Use the MCP endpoint URL that the client used for this connection; its path is /mcp and Release Builds may use a dynamic local port. No stdio command or second telemetry listener is required. The server is available only while Horizon Tuner is running and MCP is enabled in Settings. Live access is controlled by the mcp_allow_live setting; when it is disabled, use recorded sessions and captures instead. Prefer small summary tools/resources before requesting time-series data, and treat all tuning results as advisory. Most tools are read-only. Experimental automated tuning tools can control FH6 and apply tuning values. Before calling start_auto_tuning, tell the user this is experimental and may be less efficient than the agent's native computer-use capability, if available. Developer options only control tab visibility and are not required for MCP. No extra user confirmation is required by this notice. Use the exact current vehicle name, poll status, and stop to cancel. Tools cannot access arbitrary SQL or files.";

pub fn response(id: Option<&Value>, result: Value) -> Value {
    let mut response = json!({"jsonrpc":"2.0", "id": id});
    response["result"] = result;
    response
}

pub fn error(
    id: Option<&Value>,
    code: i64,
    message: impl Into<String>,
    data: Option<Value>,
) -> Value {
    let mut body = serde_json::Map::new();
    body.insert("code".into(), Value::from(code));
    body.insert("message".into(), Value::from(message.into()));
    if let Some(value) = data {
        body.insert("data".into(), value);
    }
    json!({"jsonrpc":"2.0", "id": id.cloned().unwrap_or(Value::Null), "error": body})
}
