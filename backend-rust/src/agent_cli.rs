//! Offline Agent CLI and bounded HTTP client. Never starts the backend or native providers.
mod context;
mod options;
use crate::{storage, tuning::legacy_cli as solver};
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
        ["solve", "chassis" | "full"] => {
            let full = command[1] == "full";
            let car = if !full {
                ctx.cars()?
                    .get(args.text("car-id", ""))
                    .cloned()
                    .unwrap_or_default()
            } else {
                Value::Null
            };
            let weight = args.number(
                "weight",
                car["weight"]
                    .as_f64()
                    .unwrap_or(if full { 1400. } else { 1450. }),
            )?;
            let bias = args.number("bias", car["weight_distribution"].as_f64().unwrap_or(52.))?;
            let drive = args.text("drive", car["drivetrain"].as_str().unwrap_or("RWD"));
            let chassis = solver::chassis(
                weight,
                bias,
                drive,
                args.text("goal", "road"),
                args.number("aero-f", 0.)?,
                args.number("aero-r", 0.)?,
            );
            if !full {
                return Ok(if args.has("export-applied-setup") {
                    solver::applied(&chassis, None)
                } else {
                    chassis
                });
            }
            let gearing = solve_gearing(args)?;
            let mut preset = solver::preset(args.text("vehicle-class", "S1"), &chassis, &gearing);
            if let Some(name) = args.get("save") {
                let car = args.text("car-id", "custom");
                let path = ctx.preset_path(car, name)?;
                storage::atomic_json(&path, &preset).map_err(|e| e.to_string())?;
                let synced = ctx
                    .post(
                        &format!(
                            "api/tunings/{}/{}",
                            context::segment(car),
                            context::segment(name)
                        ),
                        &preset,
                    )
                    .is_ok();
                preset["saved_to_disk"] = json!(true);
                preset["synced_to_backend"] = json!(synced);
                preset["saved_path"] = json!(path);
            }
            Ok(if args.has("export-applied-setup") {
                solver::applied(&chassis, Some(&gearing))
            } else {
                preset
            })
        }
        ["solve", "gearing"] => solve_gearing(args),
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
        ["telemetry", "diagnose"] => {
            let temps = if let Some(values) = args.values.get("tire-temps") {
                values
                    .iter()
                    .map(|v| options::finite(v))
                    .collect::<Result<Vec<_>, _>>()?
            } else {
                let snap = ctx.tool("get_live_telemetry_snapshot", json!({}))?;
                if snap["source"] != "udp_memory_stream" || snap["status"] != "live" {
                    return Err(
                        "No live tire temperatures; supply --tire-temps FL FR RL RR in Celsius"
                            .into(),
                    );
                }
                snap["latest_sample"]["TireTemp"]
                    .as_array()
                    .filter(|v| v.len() == 4)
                    .ok_or("Live sample has no complete tire temperatures")?
                    .iter()
                    .map(|v| {
                        v.as_f64()
                            .map(|f| (f - 32.) * 5. / 9.)
                            .ok_or("Invalid tire temperature".into())
                    })
                    .collect::<Result<Vec<_>, String>>()?
            };
            let symptom = args.get("symptom");
            Ok(ctx
                .tool(
                    "diagnose_telemetry_handling",
                    json!({"tire_temps":temps,"symptom":symptom}),
                )
                .unwrap_or_else(|_| offline_diagnosis(&temps, symptom)))
        }
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
fn solve_gearing(args: &Options) -> Result<Value, String> {
    let result = solver::gearing(
        args.number("max-rpm", 8000.)?,
        args.number("peak-hp-rpm", 7200.)?,
        args.number("top-speed", 300.)?,
        args.integer("gears", 6)?,
        args.number("tire-diameter", 65.)?,
    );
    if let Some(error) = result["error"].as_str() {
        Err(error.into())
    } else {
        Ok(result)
    }
}
fn offline_diagnosis(t: &[f64], symptom: Option<&str>) -> Value {
    let (f, r) = ((t[0] + t[1]) / 2., (t[2] + t[3]) / 2.);
    let delta = f - r;
    let mut actions = Vec::new();
    if delta > 5. {
        actions.push("Front axle overheat: Soften Front ARB (-2.0)");
    } else if delta < -5. {
        actions.push("Rear axle overheat: Soften Rear ARB (-2.0)");
    }
    match symptom {
        Some("understeer_entry") => {
            actions.push("Entry Understeer: Increase front negative camber (-0.2°)")
        }
        Some("oversteer_exit") => {
            actions.push("Exit Oversteer: Soften rear spring or reduce rear accel diff lock")
        }
        _ => (),
    }
    if actions.is_empty() {
        actions.push("Tire thermal balance is nominal. No adjustments required.");
    }
    let rnd = |n: f64| format!("{n:.1}").parse::<f64>().unwrap();
    json!({"front_avg_temp_c":rnd(f),"rear_avg_temp_c":rnd(r),"axle_delta_t_c":rnd(delta),"convergence_status":if delta.abs()<=3. {"converged"} else {"adjustment_required"},"actionable_directives":actions,"source":"offline_fallback"})
}
