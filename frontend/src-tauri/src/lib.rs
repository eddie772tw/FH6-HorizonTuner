// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--no-sidecar".to_string()) || std::env::var("FH6_NO_SIDECAR").is_ok() {
                println!("Skipping sidecar startup as --no-sidecar was passed or FH6_NO_SIDECAR env var is set.");
                return Ok(());
            }

            if let Ok(sidecar_command) = app.shell().sidecar("server-sidecar") {
                if let Ok((mut rx, child)) = sidecar_command.spawn() {
                    tauri::async_runtime::spawn(async move {
                        let _child_handle = child;
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Stdout(line) = event {
                                println!("sidecar: {}", String::from_utf8_lossy(&line));
                            } else if let CommandEvent::Stderr(line) = event {
                                println!("sidecar err: {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                } else {
                    println!("Failed to spawn sidecar, continuing without it.");
                }
            } else {
                println!("Sidecar configuration not found, continuing without it.");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
