use std::collections::BTreeMap;

pub const HELP: &str = "FH6 Agent CLI (Rust)\n\
Usage: fh6-agent <command> [options] [--json] [--data-dir PATH] [--backend-url URL]\n\
  status | doctor                      Backend, MCP and telemetry status\n\
  mcp-config [--client all|codex|claude|cursor]\n\
  cars search QUERY [--drive AWD|RWD|FWD] [--limit 10]\n\
  cars get CAR_ID\n\
  solve chassis [--car-id ID] [--weight KG] [--bias PERCENT] [--drive RWD]\n\
       [--goal road|drift|rally|drag] [--aero-f LBS] [--aero-r LBS] [--export-applied-setup]\n\
  solve gearing --max-rpm RPM --peak-hp-rpm RPM --top-speed KMH [--gears 6] [--tire-diameter CM]\n\
  solve full [chassis options] [gearing options] [--vehicle-class S1] [--car-id ID] [--save NAME]\n\
  telemetry snapshot [--category all|cockpit|dynamics|tires|suspension]\n\
  telemetry diagnose [--symptom understeer_entry|oversteer_exit|none] [--tire-temps FL FR RL RR]\n\
  preset list | preset get CAR_ID SAVE_NAME\n\
  mcp-call TOOL [--args JSON]\n\
Solve commands preserve the legacy tuning-dev/v1 contract; presets remain unverified.\n\
All results are readable JSON. No command starts the frontend or backend.";

pub struct Options {
    pub positionals: Vec<String>,
    pub values: BTreeMap<String, Vec<String>>,
}
impl Options {
    pub fn parse(args: Vec<String>) -> Result<Self, String> {
        let mut result = Self {
            positionals: vec![],
            values: BTreeMap::new(),
        };
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            if arg == "--" {
                result.positionals.extend(args);
                break;
            }
            if !arg.starts_with("--") {
                result.positionals.push(arg);
                continue;
            }
            let (key, inline) = arg[2..]
                .split_once('=')
                .map_or((&arg[2..], None), |(k, v)| (k, Some(v.to_owned())));
            let count = match key {
                "json" | "export-applied-setup" => 0,
                "tire-temps" => 4,
                "backend-url" | "data-dir" | "client" | "drive" | "limit" | "car-id" | "weight"
                | "bias" | "goal" | "aero-f" | "aero-r" | "max-rpm" | "peak-hp-rpm"
                | "top-speed" | "gears" | "tire-diameter" | "vehicle-class" | "save"
                | "category" | "symptom" | "args" => 1,
                _ => return Err(format!("Unknown option --{key}")),
            };
            let mut values = inline.into_iter().collect::<Vec<_>>();
            if values.len() > count {
                return Err(format!("--{key} takes no value"));
            }
            while values.len() < count {
                let v = args
                    .next()
                    .filter(|v| !v.starts_with("--"))
                    .ok_or_else(|| format!("--{key} requires {count} value(s)"))?;
                values.push(v);
            }
            result.values.insert(key.to_owned(), values);
        }
        for (key, allowed) in [
            ("drive", vec!["AWD", "RWD", "FWD"]),
            ("goal", vec!["road", "drift", "rally", "drag"]),
            ("client", vec!["all", "codex", "claude", "cursor"]),
            (
                "category",
                vec!["all", "cockpit", "dynamics", "tires", "suspension"],
            ),
            (
                "symptom",
                vec!["understeer_entry", "oversteer_exit", "none"],
            ),
        ] {
            if result.get(key).is_some_and(|v| !allowed.contains(&v)) {
                return Err(format!("Invalid --{key}"));
            }
        }
        if result.positionals == ["solve", "gearing"] {
            for key in ["max-rpm", "peak-hp-rpm", "top-speed"] {
                if !result.has(key) {
                    return Err(format!("--{key} is required"));
                }
            }
        }
        Ok(result)
    }
    pub fn has(&self, key: &str) -> bool {
        self.values.contains_key(key)
    }
    pub fn get(&self, key: &str) -> Option<&str> {
        self.values
            .get(key)
            .and_then(|v| v.first())
            .map(String::as_str)
    }
    pub fn text<'a>(&'a self, key: &str, default: &'a str) -> &'a str {
        self.get(key).unwrap_or(default)
    }
    pub fn number(&self, key: &str, default: f64) -> Result<f64, String> {
        self.get(key).map_or(Ok(default), finite)
    }
    pub fn integer(&self, key: &str, default: i64) -> Result<i64, String> {
        self.get(key).map_or(Ok(default), |v| {
            v.parse()
                .map_err(|_| format!("Invalid integer for --{key}"))
        })
    }
}
pub fn finite(s: &str) -> Result<f64, String> {
    s.parse::<f64>()
        .ok()
        .filter(|v| v.is_finite())
        .ok_or_else(|| format!("Invalid finite number: {s}"))
}
