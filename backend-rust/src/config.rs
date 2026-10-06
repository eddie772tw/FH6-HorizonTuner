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
            next[key] = json!(integer.ok_or_else(|| ApiError::internal(
                "Operation failed",
                "Settings could not be saved"
            ))?);
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
fn stack_st8100_alarm_spec(metric: &str) -> Option<(f64, f64, f64)> {
    Some(match metric {
        "rpm" => (0.0, 30000.0, 7000.0),
        "speed" => (0.0, 1440.0, 200.0),
        "tire_avg" | "tire_max" => (-100.0, 800.0, 120.0),
        "boost" => (-1.0, 10.0, 1.5),
        "power" => (-2000.0, 20000.0, 300.0),
        "torque" => (-100000.0, 100000.0, 500.0),
        "throttle" | "brake" => (0.0, 100.0, 90.0),
        _ => return None,
    })
}
fn stack_st8100_number(input: &Value, min: f64, max: f64, fallback: &Value) -> Value {
    match input.as_f64().filter(|v| v.is_finite()) {
        Some(v) if v < min || v > max => json!(v.clamp(min, max)),
        Some(_) => input.clone(),
        None => fallback.clone(),
    }
}
fn normalize_stack_st8100_alarms(value: &Value, defaults: &Value) -> Value {
    json!((0..3)
        .map(|index| {
            let input = value
                .as_array()
                .and_then(|array| array.get(index))
                .filter(|v| v.is_object());
            let get = |key: &str| input.and_then(|v| v.get(key)).unwrap_or(&Value::Null);
            let metric = get("metric")
                .as_str()
                .filter(|m| stack_st8100_alarm_spec(m).is_some())
                .unwrap_or_else(|| {
                    defaults[index]["metric"]
                        .as_str()
                        .expect("alarm default metric")
                });
            let (min, max, threshold) =
                stack_st8100_alarm_spec(metric).expect("known alarm metric");
            json!({"enabled":get("enabled").as_bool() == Some(true), "metric":metric,
            "direction":if get("direction") == "low" { "low" } else { "high" },
            "threshold":stack_st8100_number(get("threshold"), min, max, &json!(threshold))})
        })
        .collect::<Vec<_>>())
}
/// Stack owns only its namespaced keys; migration never populates unrelated HUD defaults.
fn normalize_stack_st8100(value: &mut Value) {
    let active = value["hudStyle"] == "stack_st8100";
    if !active
        && !value
            .as_object()
            .is_some_and(|object| object.keys().any(|key| key.starts_with("stackSt8100")))
    {
        return;
    }
    let defaults = defaults("DEFAULT_STACK_ST8100_CONFIG");
    let legacy = [
        "stackSt8100FuelWarningEnabled",
        "stackSt8100FuelWarningPercent",
        "stackSt8100TireWarningEnabled",
        "stackSt8100TireWarningC",
        "stackSt8100BoostWarningEnabled",
        "stackSt8100BoostWarningBar",
    ];
    if value.get("stackSt8100Alarms").is_none()
        && legacy[2..].iter().any(|key| value.get(key).is_some())
    {
        value["stackSt8100Alarms"] = json!([
            {"metric":"tire_max","enabled":value["stackSt8100TireWarningEnabled"],"threshold":value["stackSt8100TireWarningC"]},
            {"metric":"boost","enabled":value["stackSt8100BoostWarningEnabled"],"threshold":value["stackSt8100BoostWarningBar"]}
        ]);
    }
    for key in legacy {
        value.as_object_mut().expect("HUD object").remove(key);
    }
    let fields = [
        "speed",
        "gear",
        "tire_avg",
        "tire_max",
        "boost",
        "rpm",
        "power",
        "torque",
        "throttle",
        "brake",
        "current_lap",
        "race_time",
        "last_lap",
        "best_lap",
        "lap",
        "peak_rpm",
        "peak_speed",
    ];
    for (key, fallback) in defaults.as_object().expect("Stack defaults object") {
        if !active && value.get(key).is_none() {
            continue;
        }
        let input = &value[key];
        let normalized = match key.as_str() {
            "stackSt8100Alarms" => Some(normalize_stack_st8100_alarms(input, fallback)),
            "stackSt8100Field1" | "stackSt8100Field2" | "stackSt8100Field3"
            | "stackSt8100Field4" => {
                if input == "fuel" {
                    Some(json!("race_time"))
                } else {
                    input
                        .as_str()
                        .filter(|v| fields.contains(v))
                        .map(|v| json!(v))
                }
            }
            "stackSt8100Page" => input
                .as_str()
                .filter(|v| ["live", "peaks"].contains(v))
                .map(|v| json!(v)),
            "stackSt8100TemperatureUnit" => input
                .as_str()
                .filter(|v| ["c", "f"].contains(v))
                .map(|v| json!(v)),
            "stackSt8100Dial" => input
                .as_str()
                .filter(|v| ["auto", "0-3-8", "0-4-10", "0-3-10.5", "0-6-13"].contains(v))
                .map(|v| json!(v)),
            "stackSt8100Face" => input
                .as_str()
                .filter(|v| ["black", "white"].contains(v))
                .map(|v| json!(v)),
            "stackSt8100ShiftEnabled" => input.as_bool().map(|v| json!(v)),
            "stackSt8100ShiftPercent" => Some(stack_st8100_number(input, 50.0, 100.0, fallback)),
            _ => None,
        };
        value[key] = normalized.unwrap_or_else(|| fallback.clone());
    }
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
    normalize_stack_st8100(&mut value);
    if style == "lfa_center_ring" {
        for key in ["lfaManualExpand", "lfaAutoExpand"] {
            value[key] = json!(value[key].as_bool().unwrap_or(false));
        }
    }
    if style == "r34_mfd" {
        if !["single", "twin", "multi", "g", "lap"]
            .contains(&value["r34MfdMode"].as_str().unwrap_or(""))
        {
            value["r34MfdMode"] = json!("single");
        }
        if !value["r34ShowCluster"].is_boolean() {
            value["r34ShowCluster"] = json!(true);
        }
        if !["day", "night"].contains(&value["r34Lighting"].as_str().unwrap_or("")) {
            value["r34Lighting"] = json!("night");
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
        ("temperature", &["C", "F"][..], "C"),
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
        units["temperature"] = json!(if settings["units"]["temperature"] == "F" {
            "F"
        } else {
            "C"
        });
    }
    hud["effectiveUnit"] = units["speed"].clone();
    hud["effectiveUnits"] = units;
    hud
}
