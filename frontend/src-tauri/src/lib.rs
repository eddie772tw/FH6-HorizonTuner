// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_backend_port() -> Result<u16, String> {
    if let Ok(port_str) = std::env::var("BACKEND_PORT") {
        if let Ok(port) = port_str.parse::<u16>() {
            return Ok(port);
        }
    }

    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap().to_path_buf())
        .ok();
    
    let cwd_dir = std::env::current_dir().ok();

    let mut search_dirs = Vec::new();
    if let Some(ref d) = exe_dir {
        search_dirs.push(d.clone());
    }
    if let Some(ref d) = cwd_dir {
        search_dirs.push(d.clone());
    }

    search_dirs.push(PathBuf::from("."));
    search_dirs.push(PathBuf::from(".."));
    search_dirs.push(PathBuf::from("../.."));

    for base_dir in search_dirs {
        let mut curr = Some(base_dir.as_path());
        while let Some(dir) = curr {
            let p1 = dir.join("logs").join("web_port.txt");
            if p1.exists() {
                return read_port_from_file(&p1);
            }
            let p2 = dir.join("backend").join("logs").join("web_port.txt");
            if p2.exists() {
                return read_port_from_file(&p2);
            }
            curr = dir.parent();
        }
    }

    Err("Could not find web_port.txt in any searched paths".to_string())
}

fn read_port_from_file(path: &std::path::Path) -> Result<u16, String> {
    match fs::read_to_string(path) {
        Ok(content) => {
            let port_str = content.trim();
            port_str.parse::<u16>().map_err(|e| format!("Failed to parse port '{}' from {:?}: {}", port_str, path, e))
        }
        Err(e) => Err(format!("Failed to read port file at {:?}: {}", path, e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
