//! Offline Agent CLI and bounded HTTP client. Never starts the backend or native providers.
mod context;
mod options;
use crate::storage;
use context::Context;
use options::Options;
use serde_json::{json, Value};

pub fn main(arguments: Vec<String>) -> i32 {
    if arguments.iter().any(|s| s == "--version") {
        println!("fh6-agent 1.0.0 (Core: {})", env!("CARGO_PKG_VERSION"));
        return 0;
    }
    if arguments.is_empty()
        || arguments
            .iter()
            .any(|s| matches!(s.as_str(), "--help" | "-h"))
    {
        println!("{}", options::HELP);
        return 0;
    }
    if arguments.first().map(String::as_str) == Some("solve")
        && matches!(
            arguments.get(1).map(String::as_str),
            Some("chassis" | "gearing" | "full")
        )
    {
        println!(
            "{}",
            json!({"error":crate::tuning::archive::RETIRED_MESSAGE,"code":"model-retired"})
        );
        return 1;
    }
    if arguments.first().map(String::as_str) == Some("telemetry")
        && arguments.get(1).map(String::as_str) == Some("diagnose")
    {
        println!(
            "{}",
            json!({"error":"Legacy handling advice retired. Use telemetry snapshot for observations; no replacement advice is inferred.","code":"model-retired"})
        );
        return 1;
    }
    let args = match Options::parse(arguments) {
        Ok(a) => a,
        Err(e) => {
            println!("{}", json!({"error":e}));
            return 2;
        }
    };
    let result = Context::new(&args).and_then(|ctx| execute(&args, &ctx));
    match result {
        Ok(value) => {
            println!("{}", serde_json::to_string_pretty(&value).unwrap());
            0
        }
        Err(e) => {
            println!("{}", json!({"error":e}));
            1
        }
    }
}

fn execute(args: &Options, ctx: &Context) -> Result<Value, String> {
    let command: Vec<&str> = args.positionals.iter().map(String::as_str).collect();
    match command.as_slice() {
        ["solve", "workflow"] => {
            let encoded = if let Some(path) = args.get("args-file") {
                if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 64 * 1024 * 1024 {
                    return Err("Workflow input exceeds 64 MiB".into());
                }
                std::fs::read_to_string(path).map_err(|e| e.to_string())?
            } else {
                args.get("args")
                    .ok_or("--args JSON or --args-file PATH is required")?
                    .to_owned()
            };
            let input: crate::tuning::workflow::WorkflowRequest = serde_json::from_str(&encoded)
                .map_err(|e| format!("Invalid workflow input: {e}"))?;
            let saved = matches!(
                input.evidence,
                Some(
                    crate::tuning::evidence::EvidenceRequest::SavedEngine { .. }
                        | crate::tuning::evidence::EvidenceRequest::SavedEv { .. }
                        | crate::tuning::evidence::EvidenceRequest::SavedCvt { .. }
                )
            );
            let result = if saved {
                crate::tuning::evidence::EvidenceService {
                    store: crate::road::RoadStore {
                        db_path: ctx
                            .root
                            .join("telemetry_sessions.db")
                            .to_string_lossy()
                            .into_owned(),
                    },
                }
                .calculate_read_only(input)
                .map_err(|e| e.to_string())?
            } else {
                crate::tuning::workflow::calculate_workflow(input)?
            };
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        ["status" | "doctor"] => {
            let status = ctx.get("api/mcp/status");
            let online = status.is_ok();
            let status = status.unwrap_or_default();
            let settings = if online {
                ctx.get("api/settings").unwrap_or_default()
            } else {
                Value::Null
            };
            let runtime = if online {
                ctx.get("api/runtime").unwrap_or_default()
            } else {
                Value::Null
            };
            let snap = if online {
                ctx.tool("get_live_telemetry_snapshot", json!({}))
                    .unwrap_or_default()
            } else {
                Value::Null
            };
            let live = snap["source"] == "udp_memory_stream" && snap["status"] == "live";
            let raw = &snap["latest_sample"];
            Ok(
                json!({"cli_version":"1.0.0","app_version":env!("CARGO_PKG_VERSION"),"backend_url":ctx.url,
                "backend_running":online,"mcp_enabled":online && status["enabled"]==true,"mcp_endpoint":format!("{}/mcp",ctx.url),
                "telemetry_udp_port":runtime["telemetry"]["port"].as_u64().or_else(||settings["telemetry_port"].as_u64()).unwrap_or(8000),"telemetry_receiving":live,
                "is_race_on":live && raw["IsRaceOn"]==1,"current_speed_kmh":if live {(raw["SpeedMetersPerSecond"].as_f64().unwrap_or(0.)*36.).round()/10.} else {0.},
                "mode":if online {"online"} else {"offline"}}),
            )
        }
        ["mcp-config"] => {
            let url = format!("{}/mcp", ctx.url);
            let configs = json!({"mcp_url":url,"codex":{"instruction":"Run in terminal once:","command":format!("codex mcp add fh6-horizon-tuner --url {url}")},
                "claude_desktop":{"config_path":"%APPDATA%\\Claude\\claude_desktop_config.json","snippet":{"mcpServers":{"fh6-horizon-tuner":{"url":url}}}},
                "cursor":{"type":"Streamable HTTP","name":"fh6-horizon-tuner","url":url}});
            let client = args.text("client", "all");
            Ok(if client == "all" {
                configs
            } else {
                configs[if client == "claude" {
                    "claude_desktop"
                } else {
                    client
                }]
                .clone()
            })
        }
        ["cars", "search", query] => {
            let db = ctx.cars()?;
            let query_lower = query.to_lowercase();
            let mut cars = Vec::new();
            let limit = args.integer("limit", 10)?;
            if !(1..=1000).contains(&limit) {
                return Err("--limit must be between 1 and 1000".into());
            }
            for (id, car) in db.as_object().ok_or("Invalid car database")? {
                let drive = car["drivetrain"].as_str().unwrap_or("");
                if ["display_name", "make", "model"].iter().any(|k| {
                    car[k]
                        .as_str()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains(&query_lower)
                }) && (args.get("drive").is_none()
                    || drive.is_empty()
                    || Some(drive) == args.get("drive"))
                {
                    let mut car = car.clone();
                    car["car_id"] = id.parse::<u64>().map_or_else(|_| json!(id), |n| json!(n));
                    cars.push(car);
                    if cars.len() >= limit as usize {
                        break;
                    }
                }
            }
            Ok(json!({"query":query,"count":cars.len(),"cars":cars}))
        }
        ["cars", "get", id] => ctx
            .cars()?
            .get(*id)
            .cloned()
            .ok_or_else(|| format!("Vehicle ordinal {id} not found in database.")),
        ["solve", "chassis" | "full" | "gearing"] => Err(crate::tuning::archive::RETIRED_MESSAGE.into()),
        ["preset", "list"] => {
            let dir = ctx.tunings()?;
            let mut names = Vec::new();
            for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
                let path = entry.map_err(|e| e.to_string())?.path();
                if path.extension().is_some_and(|s| s == "json") && path.is_file() {
                    names.push(path.file_stem().unwrap().to_string_lossy().to_string());
                }
            }
            names.sort();
            Ok(json!({"count":names.len(),"directory":dir,"presets":names}))
        }
        ["preset", "get", car, name] => {
            storage::read_json(&ctx.preset_path(car, name)?).map_err(|e| e.to_string())
        }
        ["telemetry", "snapshot"] => ctx.tool(
            match args.text("category", "all") {
                "cockpit" => "get_driver_cockpit_telemetry",
                "dynamics" => "get_vehicle_dynamics_telemetry",
                "tires" => "get_tires_status_telemetry",
                "suspension" => "get_suspension_telemetry",
                _ => "get_live_telemetry_snapshot",
            },
            json!({}),
        ),
        ["telemetry", "diagnose"] => Err("Legacy handling advice retired. Use telemetry snapshot to inspect observations; no replacement advice is inferred.".into()),
        ["mcp-call", tool] => {
            let params: Value = serde_json::from_str(args.text("args", "{}"))
                .map_err(|e| format!("Invalid JSON in --args: {e}"))?;
            if !params.is_object() {
                return Err("--args must be a JSON object".into());
            }
            ctx.tool(tool, params)
                .map(|v| json!({"status":"ok","result":v}))
        }
        _ => Err("Unknown command; use fh6-agent --help".into()),
    }
}
