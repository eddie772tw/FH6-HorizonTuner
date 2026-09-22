//! Model Context Protocol server and read-only FH6 tools/resources.
mod protocol;
mod resources;
mod service;
mod tools;

use crate::{app::App, error::ApiResult};
use serde_json::{json, Value};

pub struct McpServer {
    pub requests: u64,
    protocol_version: String,
    initialized: bool,
}
impl Default for McpServer {
    fn default() -> Self {
        Self {
            requests: 0,
            protocol_version: protocol::SUPPORTED_PROTOCOL_VERSIONS[0].into(),
            initialized: false,
        }
    }
}
impl McpServer {
    pub fn handle(&mut self, app: &App, request: &Value) -> ApiResult<Option<Value>> {
        self.requests = self.requests.saturating_add(1);
        let id = request.get("id").filter(|value| !value.is_null());
        let Some(method) = request.get("method").and_then(Value::as_str) else {
            return Ok(
                id.map(|_| protocol::error(id, -32600, "Invalid Request: missing method", None))
            );
        };
        if id.is_none() {
            if matches!(method, "notifications/initialized" | "initialized") {
                self.initialized = true;
            }
            return Ok(None);
        }
        let params = request
            .get("params")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let result = match method {
            "initialize" => {
                let requested = params
                    .get("protocolVersion")
                    .and_then(Value::as_str)
                    .unwrap_or(protocol::SUPPORTED_PROTOCOL_VERSIONS[0]);
                self.protocol_version =
                    if protocol::SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
                        requested
                    } else {
                        protocol::SUPPORTED_PROTOCOL_VERSIONS[0]
                    }
                    .into();
                Ok(
                    json!({"protocolVersion":self.protocol_version,"capabilities":{"tools":{"listChanged":false},"resources":{"subscribe":false,"listChanged":false}},"serverInfo":{"name":protocol::SERVER_NAME,"version":protocol::SERVER_VERSION},"instructions":protocol::SERVER_INSTRUCTIONS}),
                )
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({"tools":tools::list_tools()})),
            "resources/list" => {
                Ok(json!({"resources":resources::list(&service::McpService::new(app))}))
            }
            "tools/call" => {
                let Some(name) = params
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|x| !x.is_empty())
                else {
                    return Ok(Some(protocol::error(
                        id,
                        -32602,
                        "Invalid params: 'name' is required for tools/call",
                        None,
                    )));
                };
                let args = params
                    .get("arguments")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                tools::call(&service::McpService::new(app), name, &args).map_err(|e| e)
            }
            "resources/read" => {
                let Some(uri) = params
                    .get("uri")
                    .and_then(Value::as_str)
                    .filter(|x| !x.is_empty())
                else {
                    return Ok(Some(protocol::error(
                        id,
                        -32602,
                        "Invalid params: 'uri' is required for resources/read",
                        None,
                    )));
                };
                resources::read(&service::McpService::new(app), uri)
                    .map_err(|(code, message)| tools::ToolError { code, message })
            }
            _ => {
                return Ok(Some(protocol::error(
                    id,
                    -32601,
                    format!("Method not found: {method}"),
                    None,
                )))
            }
        };
        match result {
            Ok(value) => Ok(Some(protocol::response(id, value))),
            Err(e) => Ok(Some(protocol::error(id, e.code, e.message, None))),
        }
    }
    pub fn status(&self, settings: &Value) -> Value {
        json!({"enabled":settings.get("mcp_enabled").and_then(Value::as_bool).unwrap_or(true),"allow_live":settings.get("mcp_allow_live").and_then(Value::as_bool).unwrap_or(true),"max_downsample":settings.get("mcp_max_downsample").and_then(Value::as_i64).unwrap_or(500),"total_requests_served":self.requests,"transport":"streamable-http","mcp_endpoint":"/mcp","continuous_streaming":false,"time_series_tools":["query_session_telemetry","query_capture_window"]})
    }
}

pub use service::McpService;
