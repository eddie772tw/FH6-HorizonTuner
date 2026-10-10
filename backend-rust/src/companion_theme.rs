//! Receive-only visual contract. Never serialize arbitrary settings into LAN responses.
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionVisualTheme {
    pub schema_version: u8,
    pub mode: String,
    pub halfmoon_core: String,
    pub primary_color: String,
    pub secondary_color: String,
    pub accent_color: String,
}

impl CompanionVisualTheme {
    pub fn project(theme: &Value) -> Option<Self> {
        let mode = theme["mode"].as_str()?;
        let core = theme["halfmoonCore"].as_str()?;
        if !matches!(mode, "light" | "dark")
            || !matches!(
                core,
                "default"
                    | "modern"
                    | "elegant"
                    | "swiss"
                    | "swiss-editorial"
                    | "swiss-contrast"
                    | "rhine-lab"
            )
        {
            return None;
        }
        let color = |key: &str| {
            theme[key]
                .as_str()
                .filter(|value| {
                    value.len() == 7
                        && value.starts_with('#')
                        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                })
                .map(str::to_owned)
        };
        Some(Self {
            schema_version: 1,
            mode: mode.to_owned(),
            halfmoon_core: core.to_owned(),
            primary_color: color("primaryColor")?,
            secondary_color: color("secondaryColor")?,
            accent_color: color("accentColor")?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn projects_only_valid_visual_fields_for_all_cores_and_modes() {
        for core in [
            "default",
            "modern",
            "elegant",
            "swiss",
            "swiss-editorial",
            "swiss-contrast",
            "rhine-lab",
        ] {
            for mode in ["light", "dark"] {
                let mut input = json!({"mode":mode,"halfmoonCore":core,"primaryColor":"#aBc123","secondaryColor":"#ef4444","accentColor":"#64748b","customCSS":"url(secret)","credential":"secret"});
                let output =
                    serde_json::to_value(CompanionVisualTheme::project(&input).unwrap()).unwrap();
                assert_eq!(output.as_object().unwrap().len(), 6);
                assert_eq!(output["schemaVersion"], 1);
                assert_eq!(output["halfmoonCore"], core);
                for (key, invalid) in [
                    ("mode", "auto"),
                    ("halfmoonCore", "future"),
                    ("primaryColor", "red"),
                    ("secondaryColor", "#fff"),
                    ("accentColor", "#000000;url(x)"),
                ] {
                    let saved = input[key].clone();
                    input[key] = json!(invalid);
                    assert!(CompanionVisualTheme::project(&input).is_none());
                    input[key] = saved;
                }
                input.as_object_mut().unwrap().remove("accentColor");
                assert!(CompanionVisualTheme::project(&input).is_none());
            }
        }
    }
}
