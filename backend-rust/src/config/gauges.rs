use serde_json::{json, Value};

pub(super) fn normalize(value: &mut Value) {
    let legacy = value["hudStyle"] == "auxiliary_gauges";
    let has_settings = value.as_object().is_some_and(|object| {
        object.keys().any(|key| key.starts_with("auxGauge"))
            || object.contains_key("gaugeValueSources")
    }) || value["elements"].get("showAuxiliaryGauges").is_some();
    if !legacy && !has_settings {
        return;
    }
    if legacy {
        value["hudStyle"] = json!("vfd");
        if !value["elements"].is_object() {
            value["elements"] = json!({});
        }
        if value["elements"].get("showAuxiliaryGauges").is_none() {
            value["elements"]["showAuxiliaryGauges"] =
                json!(value["elements"]["showGauge"] != false);
        }
    }
    if value["elements"].get("showAuxiliaryGauges").is_some() {
        value["elements"]["showAuxiliaryGauges"] = json!(value["elements"]["showAuxiliaryGauges"]
            .as_bool()
            .unwrap_or(false));
    }
    let faces = ["aem", "greddy", "blitz", "defi", "speedhut"];
    let selected = if let Some(array) = value["auxGaugeFaces"].as_array() {
        let mut selected = Vec::new();
        for face in array.iter().filter_map(Value::as_str) {
            if faces.contains(&face) && !selected.contains(&face) {
                selected.push(face);
            }
        }
        json!(selected)
    } else if let Some(face) = value["auxGaugeMode"]
        .as_str()
        .filter(|face| faces.contains(face))
    {
        json!([face])
    } else {
        json!(["aem", "greddy", "defi"])
    };
    value["auxGaugeFaces"] = selected;
    value.as_object_mut().unwrap().remove("auxGaugeMode");
    for (key, min, max, fallback) in [
        ("auxGaugeMaxPerRow", 1.0, 5.0, 3.0),
        ("auxGaugeOffset", 0.0, 4000.0, 0.0),
        ("auxGaugeCenterOffset", -4000.0, 4000.0, 0.0),
    ] {
        let number = value[key]
            .as_f64()
            .filter(|n| n.is_finite())
            .unwrap_or(fallback)
            .clamp(min, max);
        value[key] = if key == "auxGaugeMaxPerRow" {
            json!(number as i64)
        } else {
            json!(number)
        };
    }
    if !["left", "right", "top", "bottom"].contains(&value["auxGaugeEdge"].as_str().unwrap_or("")) {
        value["auxGaugeEdge"] = json!("right");
    }
    if value["auxGaugeOrientation"] != "vertical" {
        value["auxGaugeOrientation"] = json!("horizontal");
    }
    let mut sources = json!({});
    for (key, field, unit, label) in [
        ("boost", "boost_psi", "psi", "Boost"),
        ("oilPressure", "", "psi", "Oil pressure (unassigned)"),
        ("oilTemperature", "", "C", "Oil temperature (unassigned)"),
        (
            "waterTemperature",
            "tire_temp_avg",
            "F",
            "Average tire temperature",
        ),
    ] {
        let source = &value["gaugeValueSources"][key];
        let field = source["field"]
            .as_str()
            .filter(|s| {
                s.is_empty()
                    || (s.len() <= 64
                        && s.as_bytes()[0].is_ascii_alphabetic()
                        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_'))
            })
            .unwrap_or(field);
        let units: &[&str] = if key.ends_with("Temperature") {
            &["native", "C", "F"]
        } else {
            &["native", "psi", "bar", "kpa"]
        };
        let unit = source["unit"]
            .as_str()
            .filter(|s| units.contains(s))
            .unwrap_or(unit);
        let label = source["label"]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(label);
        sources[key] =
            json!({"field":field,"unit":unit,"label":label.chars().take(64).collect::<String>()});
    }
    value["gaugeValueSources"] = sources;
}
