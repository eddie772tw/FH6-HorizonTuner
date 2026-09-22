use super::service::McpService;
use serde_json::{json, Map, Value};

pub fn list_tools() -> Value {
    serde_json::from_str(include_str!("tool_registry.json")).expect("checked-in MCP tool registry")
}

#[derive(Debug)]
pub struct ToolError {
    pub code: i64,
    pub message: String,
}
impl ToolError {
    fn missing(name: &str) -> Self {
        Self {
            code: -32602,
            message: format!("Missing '{name}'"),
        }
    }
    fn not_found(message: String) -> Self {
        Self {
            code: -32004,
            message,
        }
    }
}
fn s<'a>(a: &'a Map<String, Value>, k: &str) -> Option<&'a str> {
    a.get(k).and_then(Value::as_str).filter(|x| !x.is_empty())
}
fn i(a: &Map<String, Value>, k: &str, d: i64) -> i64 {
    a.get(k).and_then(Value::as_i64).unwrap_or(d)
}
fn f(a: &Map<String, Value>, k: &str, d: f64) -> f64 {
    a.get(k).and_then(Value::as_f64).unwrap_or(d)
}
fn arr<'a>(a: &'a Map<String, Value>, k: &str) -> Option<&'a Vec<Value>> {
    a.get(k).and_then(Value::as_array)
}

pub fn call(
    service: &McpService<'_>,
    name: &str,
    args: &Map<String, Value>,
) -> Result<Value, ToolError> {
    let out = match name {
        "get_live_telemetry_snapshot" => service.get_live_telemetry_snapshot(),
        "get_driver_cockpit_telemetry" => service.get_driver_cockpit_telemetry(),
        "get_vehicle_dynamics_telemetry" => service.get_vehicle_dynamics_telemetry(),
        "get_tires_status_telemetry" => service.get_tires_status_telemetry(),
        "get_suspension_telemetry" => service.get_suspension_telemetry(),
        "list_race_sessions" => {
            json!(service.list_race_sessions(i(args, "limit", 20), i(args, "offset", 0)))
        }
        "get_session_summary" => {
            let id = s(args, "session_id").ok_or_else(|| ToolError::missing("session_id"))?;
            service
                .session_summary(id)
                .ok_or_else(|| ToolError::not_found(format!("Session '{id}' not found")))?
        }
        "query_session_telemetry" => {
            let id = s(args, "session_id").ok_or_else(|| ToolError::missing("session_id"))?;
            json!(service.session_points(
                id,
                args.get("lap_number").and_then(Value::as_i64),
                i(args, "downsample", 1),
                arr(args, "channels")
            ))
        }
        "list_tuning_captures" => json!(service.list_captures(
            s(args, "surface"),
            s(args, "purpose"),
            s(args, "confidence")
        )),
        "get_capture_summary" => {
            let id = s(args, "capture_id").ok_or_else(|| ToolError::missing("capture_id"))?;
            service
                .capture_summary(id)
                .ok_or_else(|| ToolError::not_found(format!("Capture dataset '{id}' not found")))?
        }
        "query_capture_window" => {
            let id = s(args, "capture_id").ok_or_else(|| ToolError::missing("capture_id"))?;
            json!(service.capture_window(
                id,
                i(args, "start_ms", 0),
                args.get("end_ms").and_then(Value::as_i64),
                arr(args, "channels"),
                i(args, "max_samples", 500)
            ))
        }
        "compare_captures" => {
            let b = s(args, "baseline_id");
            let c = s(args, "candidate_id");
            if b.is_none() || c.is_none() {
                return Err(ToolError {
                    code: -32602,
                    message: "Requires both 'baseline_id' and 'candidate_id'".into(),
                });
            }
            service
                .compare_captures(b.unwrap(), c.unwrap())
                .ok_or_else(|| {
                    ToolError::not_found("One or both capture datasets could not be loaded".into())
                })?
        }
        "list_drag_sessions" => json!(service.drag_sessions()),
        "get_drag_analysis" => {
            let n = s(args, "filename").ok_or_else(|| ToolError::missing("filename"))?;
            service
                .drag_analysis(n)
                .ok_or_else(|| ToolError::not_found(format!("Drag session file '{n}' not found")))?
        }
        "search_cars" => json!(service.search_cars(
            s(args, "query"),
            s(args, "drivetrain"),
            s(args, "car_class")
        )),
        "get_car_details" => {
            let id = s(args, "car_id").ok_or_else(|| ToolError::missing("car_id"))?;
            service
                .car_details(id)
                .ok_or_else(|| ToolError::not_found(format!("Car '{id}' not found in database")))?
        }
        "get_car_tuning_capabilities" => {
            let id = s(args, "car_id").ok_or_else(|| ToolError::missing("car_id"))?;
            service.capabilities(id, args.get("installed_parts").and_then(Value::as_object))
        }
        "get_tuning_constants_and_priors" => service.priors(s(args, "profile_name")),
        "list_tuning_presets" => json!(service.presets(s(args, "car_id"))),
        "get_tuning_preset" => {
            let c = s(args, "car_id");
            let n = s(args, "save_name");
            if c.is_none() || n.is_none() {
                return Err(ToolError {
                    code: -32602,
                    message: "Requires 'car_id' and 'save_name'".into(),
                });
            }
            service.preset(c.unwrap(), n.unwrap()).ok_or_else(|| {
                ToolError::not_found(format!(
                    "Tuning preset '{}/{}' not found",
                    c.unwrap(),
                    n.unwrap()
                ))
            })?
        }
        "run_dev_tuning_solver" => {
            let p = args
                .get("car_params")
                .and_then(Value::as_object)
                .ok_or_else(|| ToolError {
                    code: -32602,
                    message: "Missing or invalid 'car_params' dictionary".into(),
                })?;
            service.dev_solver(
                p,
                args.get("installed_parts").and_then(Value::as_object),
                s(args, "purpose").unwrap_or("road"),
            )
        }
        "run_gearing_solver" => service.gearing(
            f(args, "max_rpm", 0.),
            f(args, "peak_hp_rpm", 0.),
            f(args, "top_speed_kmh", 0.),
            i(args, "gears_count", 6),
            f(args, "tire_diameter_cm", 65.),
        ),
        "diagnose_telemetry_handling" => {
            let values = arr(args, "tire_temps").ok_or_else(|| ToolError {
                code: -32602,
                message: "Requires 'tire_temps' array with 4 values [FL, FR, RL, RR]".into(),
            })?;
            if values.len() < 4 {
                return Err(ToolError {
                    code: -32602,
                    message: "Requires 'tire_temps' array with 4 values [FL, FR, RL, RR]".into(),
                });
            };
            let t = values
                .iter()
                .take(4)
                .map(|v| v.as_f64().unwrap_or(0.))
                .collect::<Vec<_>>();
            service.diagnosis(&t, s(args, "symptom"))
        }
        "get_system_settings" => service.settings(),
        "get_hud_configurations" => service.hud(),
        "get_recent_logs" => json!(service.logs(i(args, "line_count", 50))),
        _ => {
            return Err(ToolError {
                code: -32601,
                message: format!("Method not found: {name}"),
            })
        }
    };
    Ok(
        json!({"content":[{"type":"text","text":serde_json::to_string_pretty(&out).unwrap_or_else(|_|out.to_string())}]}),
    )
}
