// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_backend_port() -> Result<u16, String> {
    // 獲取當前執行檔所在的目錄
    let mut path = std::env::current_exe()
        .map(|p| p.parent().unwrap().to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));
    
    // 多路徑嘗試 logs/web_port.txt
    let mut port_file = path.join("logs").join("web_port.txt");
    if !port_file.exists() {
        if let Some(parent) = path.parent() {
            let p2 = parent.join("logs").join("web_port.txt");
            if p2.exists() {
                port_file = p2;
            } else if let Some(gparent) = parent.parent() {
                let p3 = gparent.join("logs").join("web_port.txt");
                if p3.exists() {
                    port_file = p3;
                }
            }
        }
    }
    
    if !port_file.exists() {
        port_file = PathBuf::from("logs/web_port.txt");
    }
    
    if !port_file.exists() {
        port_file = PathBuf::from("backend/logs/web_port.txt");
    }

    match fs::read_to_string(&port_file) {
        Ok(content) => {
            let port_str = content.trim();
            port_str.parse::<u16>().map_err(|e| format!("Failed to parse port '{}': {}", port_str, e))
        }
        Err(e) => Err(format!("Failed to read port file at {:?}: {}", port_file, e))
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
