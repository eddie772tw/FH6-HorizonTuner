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
    let path = std::env::current_exe()
        .map(|p| p.parent().unwrap().to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."));
    
    // 遞迴向上層目錄尋找 web_port.txt 檔案
    let mut port_file = None;
    let mut current = Some(path.as_path());
    while let Some(p) = current {
        let candidate1 = p.join("backend").join("logs").join("web_port.txt");
        if candidate1.exists() {
            port_file = Some(candidate1);
            break;
        }
        let candidate2 = p.join("logs").join("web_port.txt");
        if candidate2.exists() {
            port_file = Some(candidate2);
            break;
        }
        current = p.parent();
    }

    // 回退到工作目錄
    let final_port_file = port_file.unwrap_or_else(|| {
        let f1 = PathBuf::from("logs/web_port.txt");
        if f1.exists() {
            f1
        } else {
            PathBuf::from("backend/logs/web_port.txt")
        }
    });

    match fs::read_to_string(&final_port_file) {
        Ok(content) => {
            let port_str = content.trim();
            port_str.parse::<u16>().map_err(|e| format!("Failed to parse port '{}': {}", port_str, e))
        }
        Err(e) => Err(format!("Failed to read port file at {:?}: {}", final_port_file, e))
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
