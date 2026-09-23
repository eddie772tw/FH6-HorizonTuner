use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn collect(root: &Path, path: &Path, prefix: &str, entries: &mut Vec<(String, PathBuf)>) {
    if !path.is_dir() {
        return;
    }
    for entry in fs::read_dir(path).expect("read resource directory") {
        let entry = entry.expect("read resource entry");
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == "tests"
            || name.starts_with('.')
            || name == "node_modules"
            || name == "__pycache__"
        {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, prefix, entries);
        } else {
            let key = format!(
                "{prefix}/{}",
                path.strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            );
            entries.push((key, path));
        }
    }
}

fn main() {
    let repo = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .parent()
        .unwrap()
        .to_path_buf();
    let manifest = repo.join("frontend/src-tauri/tauri.conf.json");
    println!("cargo:rerun-if-changed={}", manifest.display());
    let runtime: serde_json::Value =
        serde_json::from_slice(&fs::read(manifest).expect("Tauri version manifest")).unwrap();
    let version = env::var("CARGO_PKG_VERSION").unwrap();
    assert_eq!(
        runtime["version"].as_str(),
        Some(version.as_str()),
        "Backend and Tauri versions must match"
    );
    println!("cargo:rerun-if-env-changed=DISCORD_APPLICATION_ID");
    let local = repo.join("config/discord.local.json");
    println!("cargo:rerun-if-changed={}", local.display());
    let configured = env::var("DISCORD_APPLICATION_ID")
        .ok()
        .filter(|s| valid_id(s))
        .or_else(|| {
            fs::read(local)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                .and_then(|value| {
                    value
                        .get("discord_application_id")
                        .filter(|v| !v.is_null())
                        .map(|v| {
                            v.as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string())
                        })
                })
                .filter(|s| valid_id(s))
        });
    println!(
        "cargo:rustc-env=FH6_BUNDLED_DISCORD_APPLICATION_ID={}",
        configured.unwrap_or_default().trim()
    );
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut resource = winresource::WindowsResource::new();
        resource
            .set_language(0x0409)
            .set("CompanyName", "eddie772tw")
            .set("ProductName", "FH6 HorizonTuner Backend")
            .set("FileDescription", "FH6 HorizonTuner Rust sidecar")
            .set("FileVersion", &format!("{version}.0"))
            .set("ProductVersion", &format!("{version}.0"));
        resource.compile().expect("Windows executable metadata");
    }
    let mut entries = Vec::new();
    println!("cargo:rerun-if-env-changed=FH6_REQUIRE_ADB");
    let adb_directory = repo.join(".tools/adb/windows");
    println!("cargo:rerun-if-changed={}", adb_directory.display());
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        for name in [
            "adb.exe",
            "AdbWinApi.dll",
            "AdbWinUsbApi.dll",
            "NOTICE.txt",
            "source.properties",
        ] {
            let path = adb_directory.join(name);
            if path.is_file() {
                entries.push((format!("tools/adb/{name}"), path));
            } else if env::var("FH6_REQUIRE_ADB").as_deref() == Ok("1") {
                panic!("Required USB component missing: {name}. Run scripts/prepare_adb.ps1.");
            }
        }
    }
    for (relative, prefix) in [
        ("hud_overlay", "hud"),
        ("lang", "lang"),
        ("backend/car_params", "car_params"),
        ("frontend/dist/companion", "companion"),
        ("frontend/dist/assets", "assets"),
    ] {
        let directory = repo.join(relative);
        println!("cargo:rerun-if-changed={}", directory.display());
        collect(&directory, &directory, prefix, &mut entries);
    }
    for file in ["backend/car_database.json"] {
        let path = repo.join(file);
        println!("cargo:rerun-if-changed={}", path.display());
        if path.is_file() {
            entries.push((file.trim_start_matches("backend/").to_string(), path));
        }
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let mut source = String::from("pub static EMBEDDED: &[(&str, &[u8])] = &[\n");
    for (key, path) in entries {
        source.push_str(&format!(
            "({key:?}, include_bytes!({:?})),\n",
            path.to_string_lossy()
        ));
    }
    source.push_str("];\n");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("assets.rs"),
        source,
    )
    .unwrap();
}
fn valid_id(value: &str) -> bool {
    let value = value.trim();
    (17..=20).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit())
}
