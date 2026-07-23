use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn get_data_dir() -> PathBuf {
    let dir = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));

    // If running in target/release, use current dir or data/
    let data_path = dir.join("data");
    if !data_path.exists() {
        let _ = fs::create_dir_all(&data_path);
    }
    data_path
}

fn get_resource_dir() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cwd.join("backend").exists() {
        cwd.join("backend")
    } else if cwd.join("car_database.json").exists() {
        cwd
    } else {
        cwd.join("..").join("backend")
    }
}

pub fn read_car_database() -> Result<Value, String> {
    let resource_dir = get_resource_dir();
    let db_path = resource_dir.join("car_database.json");

    if db_path.exists() {
        let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        // Fallback search
        let alt_path = PathBuf::from("car_database.json");
        if alt_path.exists() {
            let content = fs::read_to_string(&alt_path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())
        } else {
            Ok(serde_json::json!({}))
        }
    }
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

pub fn write_json_file(sub_dir: &str, file_name: &str, data: &Value) -> Result<(), String> {
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
