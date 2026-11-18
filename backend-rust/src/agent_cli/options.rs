use std::collections::BTreeMap;

pub const HELP: &str = "FH6 Agent CLI (Rust)\n\
Usage: fh6-agent <command> [options] [--json] [--data-dir PATH] [--backend-url URL]\n\
  status | doctor                      Backend, MCP and telemetry status\n\
  mcp-config [--client all|codex|claude|cursor]\n\
  cars search QUERY [--drive AWD|RWD|FWD] [--limit 10]\n\
  cars get CAR_ID\n\
  solve workflow --args JSON | --args-file PATH  Qualified Rust ICE v4 / EV workflow (offline)\n\
  telemetry snapshot [--category all|cockpit|dynamics|tires|suspension]\n\
  preset list | preset get CAR_ID SAVE_NAME\n\
  mcp-call TOOL [--args JSON]\n\
Chassis/gearing/full and legacy telemetry advice are retired; use solve workflow with qualified evidence. Presets remain unverified.\n\
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
                "json" => 0,
                "backend-url" | "data-dir" | "client" | "drive" | "limit" | "category" | "args"
                | "args-file" => 1,
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
            ("client", vec!["all", "codex", "claude", "cursor"]),
            (
                "category",
                vec!["all", "cockpit", "dynamics", "tires", "suspension"],
            ),
        ] {
            if result.get(key).is_some_and(|v| !allowed.contains(&v)) {
                return Err(format!("Invalid --{key}"));
            }
        }
        Ok(result)
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
    pub fn integer(&self, key: &str, default: i64) -> Result<i64, String> {
        self.get(key).map_or(Ok(default), |v| {
            v.parse()
                .map_err(|_| format!("Invalid integer for --{key}"))
        })
    }
}
