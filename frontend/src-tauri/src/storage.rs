use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

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

pub fn find_resource_file(
    app_handle: Option<&tauri::AppHandle>,
    file_subpath: &str,
) -> Option<PathBuf> {
    // 1. Try Tauri AppHandle resource_dir
    if let Some(app) = app_handle {
        use tauri::Manager;
        if let Ok(res_dir) = app.path().resource_dir() {
            let p = res_dir.join(file_subpath);
            if p.exists() {
                return Some(p);
            }
            let p_up = res_dir.join("_up_").join("_up_").join(file_subpath);
            if p_up.exists() {
                return Some(p_up);
            }
        }
    }

    // 2. Try current exe directory and parents
    if let Ok(exe_path) = std::env::current_exe() {
        let mut curr = exe_path.parent();
        for _ in 0..5 {
            if let Some(dir) = curr {
                let p = dir.join(file_subpath);
                if p.exists() {
                    return Some(p);
                }
                curr = dir.parent();
            }
        }
    }

    // 3. Try current working dir and parents
    if let Ok(cwd) = std::env::current_dir() {
        let mut curr = Some(cwd.as_path());
        for _ in 0..5 {
            if let Some(dir) = curr {
                let p = dir.join(file_subpath);
                if p.exists() {
                    return Some(p);
                }
                curr = dir.parent();
            }
        }
    }

    None
}

pub fn read_car_database(
    app_handle: Option<&tauri::AppHandle>,
) -> Result<Value, String> {
    if let Some(db_path) = find_resource_file(app_handle, "car_database.json") {
        let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

pub fn read_language_file(
    app_handle: Option<&tauri::AppHandle>,
    code: &str,
) -> Result<Value, String> {
    let subpath = format!("lang/{}.json", code);
    if let Some(lang_path) = find_resource_file(app_handle, &subpath) {
        let content = fs::read_to_string(&lang_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

pub fn list_languages(
    app_handle: Option<&tauri::AppHandle>,
) -> Result<Vec<Value>, String> {
    let mut list = vec![serde_json::json!({"code": "en-us", "name": "English (US)"})];

    let lang_dir = find_resource_file(app_handle, "lang").or_else(|| {
        find_resource_file(app_handle, "lang/zh-tw.json")
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    });

    if let Some(dir) = lang_dir {
        if let Ok(entries) = fs::read_dir(dir) {
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
    fn test_write_and_read_json() {
        let test_val = serde_json::json!({"test_key": "test_val"});
        assert!(write_json_file("test_dir", "test_file.json", &test_val).is_ok());

        let read_val = read_json_file("test_dir", "test_file.json").unwrap();
        assert_eq!(read_val["test_key"], "test_val");

        assert!(delete_json_file("test_dir", "test_file.json").is_ok());
    }
}
