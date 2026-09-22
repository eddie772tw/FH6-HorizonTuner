use crate::error::{ApiError, ApiResult};
use serde_json::{json, Value};

pub fn defaults(name: &str) -> Value {
    let all: Value = serde_json::from_str(include_str!("../resources/defaults.json"))
        .expect("checked-in defaults");
    all[name].clone()
}
pub fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}
pub fn merge_object(target: &mut Value, patch: &Value) {
    if let Some(patch) = patch.as_object() {
        if !target.is_object() {
            *target = json!({});
        }
        target.as_object_mut().unwrap().extend(patch.clone());
    }
}
pub fn normalize_units(input: &Value) -> Value {
    let mut units = defaults("DEFAULT_SETTINGS")["units"].clone();
    merge_object(&mut units, input);
    let profile = if units["speed"] == "mph" {
        "imperial"
    } else {
        "metric"
    };
    merge_object(&mut units, &defaults("GENERAL_UNIT_PROFILES")[profile]);
    units
}
pub fn merge_settings(settings: &Value, patch: &Value) -> ApiResult<Value> {
    if !patch.is_object() {
        return Err(ApiError::invalid("Input should be a valid dictionary"));
    }
    let mut next = settings.clone();
    for key in [
        "dyno_recording",
        "race_recording",
        "developer_tuning_enabled",
        "dyno_filter_slip",
        "dyno_filter_transients",
        "mcp_enabled",
        "mcp_allow_live",
        "forward_telemetry_enabled",
    ] {
        if let Some(v) = patch.get(key) {
            next[key] = json!(truthy(v));
        }
    }
    for key in ["language", "forward_telemetry_host"] {
        if let Some(v) = patch.get(key) {
            let text = v.as_str().map(str::to_string).unwrap_or_else(|| match v {
                Value::Null => "None".into(),
                Value::Bool(true) => "True".into(),
                Value::Bool(false) => "False".into(),
                _ => v.to_string(),
            });
            next[key] = json!(if key == "forward_telemetry_host" {
                text.trim().to_string()
            } else {
                text
            });
        }
    }
    for key in [
        "dyno_test_gear",
        "mcp_max_downsample",
        "telemetry_port",
        "forward_telemetry_port",
    ] {
        if let Some(v) = patch.get(key) {
            let integer = v
                .as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                .or_else(|| v.as_f64().map(|n| n as i64))
                .or_else(|| v.as_bool().map(i64::from));
            next[key] =
                json!(integer.ok_or_else(|| ApiError::new(500, "Settings could not be saved"))?);
        }
    }
    if patch["units"].is_object() {
        merge_object(&mut next["units"], &patch["units"]);
        next["units"] = normalize_units(&next["units"]);
    }
    if patch["theme"].is_object() {
        merge_object(&mut next["theme"], &patch["theme"]);
        next["theme"].as_object_mut().unwrap().remove("slots");
    }
    Ok(next)
}
pub fn normalize_hud(data: &Value) -> Value {
    let mut value = if data.is_object() {
        data.clone()
    } else {
        json!({})
    };
    for key in [
        "vfdRenderMode",
        "actualScale",
        "s650GuiThemeMode",
        "effectiveUnit",
        "effectiveUnits",
    ] {
        value.as_object_mut().unwrap().remove(key);
    }
    let style = value["hudStyle"].as_str().unwrap_or("").to_string();
    if style.starts_with("s650_") && style != "s650_hmi" {
        value["hudStyle"] = json!("s650_hmi");
        value["s650Theme"] = json!(match style.as_str() {
            "s650_normal" => "normal",
            "s650_foxbody" => "foxbody",
            _ => "heritage67",
        });
    } else if style == "s650_hmi"
        && !["normal", "foxbody", "heritage67", "track"]
            .contains(&value["s650Theme"].as_str().unwrap_or(""))
    {
        value["s650Theme"] = json!("heritage67");
    }
    if value["hudStyle"] == "s650_hmi"
        && !["disable", "drive", "tire_temp", "performance", "music"]
            .contains(&value["s650CenterWidget"].as_str().unwrap_or(""))
    {
        value["s650CenterWidget"] = json!("drive");
    }
    if ["initial_d", "defi_triple"].contains(&style.as_str()) {
        value["hudStyle"] = json!("classic_jdm");
        for (key, v) in [
            (
                "classicJdmTachStyle",
                json!(if style == "initial_d" { "trd" } else { "defi" }),
            ),
            ("classicJdmShowTriple", json!(true)),
            ("classicJdmAux1", json!("tire_temp_4w")),
            ("classicJdmAux2", json!("tire_temp_rear")),
        ] {
            value.as_object_mut().unwrap().entry(key).or_insert(v);
        }
    }
    value
}
pub fn hud_for_frontend(data: &Value, settings: &Value) -> Value {
    let mut hud = normalize_hud(data);
    hud["s650GuiThemeMode"] = json!(if settings["theme"]["mode"] == "light" {
        "light"
    } else {
        "dark"
    });
    hud["vfdRenderMode"] = json!(
        if std::env::var("VFD_RENDER_MODE").as_deref() == Ok("optimized") {
            "optimized"
        } else {
            "legacy"
        }
    );
    let mut units = json!({});
    for (key, allowed, fallback) in [
        ("speed", &["kmh", "mph"][..], "kmh"),
        ("boostPressure", &["bar", "psi", "kpa"][..], "bar"),
        ("torque", &["nm", "lbft"][..], "nm"),
        ("power", &["kw", "hp", "ps"][..], "hp"),
    ] {
        let configured = hud["units"]
            .get(key)
            .or_else(|| {
                if key == "speed" {
                    hud.get("unit")
                } else {
                    None
                }
            })
            .and_then(Value::as_str)
            .unwrap_or(fallback);
        units[key] = json!(if allowed.contains(&configured) {
            configured
        } else {
            fallback
        });
    }
    hud["units"] = units.clone();
    if hud.get("followAppUnits").map(truthy).unwrap_or(true) {
        for key in ["speed", "boostPressure", "torque", "power"] {
            if let Some(v) = settings["units"].get(key) {
                units[key] = v.clone();
            }
        }
    }
    hud["effectiveUnit"] = units["speed"].clone();
    hud["effectiveUnits"] = units;
    hud
}
