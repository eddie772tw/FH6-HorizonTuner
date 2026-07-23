use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

// Embedded Default Fallback Resources
const EMBEDDED_CAR_DB: &str = include_str!("../../../car_database.json");
const EMBEDDED_LANG_ZH_TW: &str = include_str!("../../../lang/zh-tw.json");
const EMBEDDED_LANG_JA_JP: &str = include_str!("../../../lang/ja-jp.json");

fn get_data_dir() -> PathBuf {
    let base_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));

    let data_path = base_dir.join("data");
    if !data_path.exists() {
        let _ = fs::create_dir_all(&data_path);
    }
    data_path
}

/// Migrate legacy root files/folders (settings.json, car_params, tunings, etc.) into data/ by moving them
pub fn migrate_legacy_data() {
    let base_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));

    let data_dir = get_data_dir();

    let move_file = |src: &Path, dst: &Path| {
        if src.exists() && src != dst {
            if !dst.exists() {
                if fs::rename(src, dst).is_err() && fs::copy(src, dst).is_ok() {
                    let _ = fs::remove_file(src);
                }
            } else {
                let _ = fs::remove_file(src);
            }
        }
    };

    // 1. Move root settings.json to data/settings.json
    let old_settings = base_dir.join("settings.json");
    let new_settings = data_dir.join("settings.json");
    move_file(&old_settings, &new_settings);

    // 2. Move subdirectories (car_params, tunings, sessions, drag_sessions, logs)
    let legacy_folders = ["car_params", "tunings", "sessions", "drag_sessions", "logs"];
    for folder in &legacy_folders {
        let old_folder = base_dir.join(folder);
        let new_folder = data_dir.join(folder);

        if old_folder.exists() && old_folder.is_dir() && old_folder != new_folder {
            let _ = fs::create_dir_all(&new_folder);
            if let Ok(entries) = fs::read_dir(&old_folder) {
                for entry in entries.flatten() {
                    let src_path = entry.path();
                    if src_path.is_file() {
                        if let Some(file_name) = src_path.file_name() {
                            let dst_path = new_folder.join(file_name);
                            move_file(&src_path, &dst_path);
                        }
                    }
                }
            }
            // Remove old empty folder
            let _ = fs::remove_dir(old_folder);
        }
    }
}

/// Automatically extract/update embedded resources into data/ if missing or older
pub fn ensure_resources_updated(_app_handle: Option<&tauri::AppHandle>) {
    migrate_legacy_data();

    let data_dir = get_data_dir();
    let lang_dir = data_dir.join("lang");
    let _ = fs::create_dir_all(&lang_dir);

    // Executable mtime as baseline build timestamp
    let exe_mtime = std::env::current_exe()
        .ok()
        .and_then(|p| fs::metadata(p).ok())
        .and_then(|m| m.modified().ok());

    let sync_file = |target_path: &Path, content: &str| {
        let should_write = if !target_path.exists() {
            true
        } else if let (Some(build_time), Ok(meta)) =
            (exe_mtime, fs::metadata(target_path))
        {
            if let Ok(file_time) = meta.modified() {
                // If embedded build time is newer than target physical file, update it
                build_time > file_time
            } else {
                false
            }
        } else {
            false
        };

        if should_write {
            let _ = fs::write(target_path, content);
        }
    };

    // 1. Sync data/car_database.json
    sync_file(&data_dir.join("car_database.json"), EMBEDDED_CAR_DB);

    // 2. Sync data/lang/*.json
    sync_file(&lang_dir.join("zh-tw.json"), EMBEDDED_LANG_ZH_TW);
    sync_file(&lang_dir.join("ja-jp.json"), EMBEDDED_LANG_JA_JP);
}

pub fn read_car_database(
    _app_handle: Option<&tauri::AppHandle>,
) -> Result<Value, String> {
    let db_path = get_data_dir().join("car_database.json");
    if db_path.exists() {
        let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        serde_json::from_str(EMBEDDED_CAR_DB).map_err(|e| e.to_string())
    }
}

pub fn read_language_file(
    _app_handle: Option<&tauri::AppHandle>,
    code: &str,
) -> Result<Value, String> {
    let lang_path = get_data_dir().join("lang").join(format!("{}.json", code));
    if lang_path.exists() {
        let content = fs::read_to_string(&lang_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        let fallback = match code {
            "ja-jp" => EMBEDDED_LANG_JA_JP,
            _ => EMBEDDED_LANG_ZH_TW,
        };
        serde_json::from_str(fallback).map_err(|e| e.to_string())
    }
}

pub fn list_languages(
    _app_handle: Option<&tauri::AppHandle>,
) -> Result<Vec<Value>, String> {
    let mut list = vec![serde_json::json!({"code": "en-us", "name": "English (US)"})];
    let lang_dir = get_data_dir().join("lang");

    if lang_dir.exists() {
        if let Ok(entries) = fs::read_dir(lang_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file()
                    && path.extension().and_then(|s| s.to_str()) == Some("json")
                {
                    if let Some(code) = path.file_stem().and_then(|s| s.to_str()) {
                        let name = match code {
                            "zh-tw" => "繁體中文 (Taiwan)",
                            "ja-jp" => "日本語 (Japanese)",
                            "en-us" => "English (US)",
                            _ => code,
                        };
                        if code != "en-us" {
                            list.push(serde_json::json!({"code": code, "name": name}));
                        }
                    }
                }
            }
        }
    }
    Ok(list)
}

pub fn read_json_file(sub_dir: &str, file_name: &str) -> Result<Value, String> {
    let data_dir = get_data_dir();
    let target_dir = if sub_dir.is_empty() {
        data_dir
    } else {
        data_dir.join(sub_dir)
    };
    let file_path = target_dir.join(file_name);

    if file_path.exists() {
        let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(Value::Null)
    }
}

pub fn write_json_file(
    sub_dir: &str,
    file_name: &str,
    data: &Value,
) -> Result<(), String> {
    let data_dir = get_data_dir();
    let target_dir = if sub_dir.is_empty() {
        data_dir
    } else {
        data_dir.join(sub_dir)
    };
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let file_path = target_dir.join(file_name);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(file_path, content).map_err(|e| e.to_string())
}

pub fn list_json_files(sub_dir: &str) -> Result<Vec<String>, String> {
    let data_dir = get_data_dir();
    let target_dir = data_dir.join(sub_dir);
    if !target_dir.exists() {
        return Ok(Vec::new());
    }

    let mut list = Vec::new();
    let entries = fs::read_dir(target_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                list.push(file_name.to_string());
            }
        }
    }
    Ok(list)
}

pub fn delete_json_file(sub_dir: &str, file_name: &str) -> Result<(), String> {
    let data_dir = get_data_dir();
    let file_path = data_dir.join(sub_dir).join(file_name);
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrate_legacy_data() {
        let base_dir = std::env::current_exe()
            .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
            .unwrap_or_else(|_| PathBuf::from("."));
        let data_dir = get_data_dir();

        // Create dummy legacy files
        let old_settings = base_dir.join("test_legacy_settings.json");
        let _new_settings = data_dir.join("test_legacy_settings.json");
        let _ = fs::write(&old_settings, r#"{"legacy": true}"#);

        assert!(old_settings.exists());

        // Perform migration
        migrate_legacy_data();

        // If old settings filename was "settings.json", it moves it.
        // Let's test standard settings.json move
        let old_std_settings = base_dir.join("settings.json");
        let new_std_settings = data_dir.join("settings.json");
        let _ = fs::write(&old_std_settings, r#"{"legacy": true}"#);
        assert!(old_std_settings.exists());

        migrate_legacy_data();

        assert!(!old_std_settings.exists());
        assert!(new_std_settings.exists());

        // Clean up test file
        let _ = fs::remove_file(old_settings);
    }

    #[test]
    fn test_legacy_json_structure_compatibility() {
        // Test compatibility with legacy Python FastAPI JSON structures
        let legacy_hud_config = serde_json::json!({
            "show_speed": true,
            "show_gear": true,
            "legacy_field_from_python": "should_be_preserved_or_ignored"
        });

        assert!(
            write_json_file("test_legacy", "hud_config.json", &legacy_hud_config)
                .is_ok()
        );

        let loaded = read_json_file("test_legacy", "hud_config.json").unwrap();
        assert_eq!(loaded["show_speed"], true);
        assert_eq!(
            loaded["legacy_field_from_python"],
            "should_be_preserved_or_ignored"
        );

        assert!(delete_json_file("test_legacy", "hud_config.json").is_ok());
    }
}
