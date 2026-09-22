//! Durable JSON and path containment shared by all low-rate API adapters.
use crate::error::{ApiError, ApiResult};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

pub const DIRECTORIES: &[&str] = &[
    "logs",
    "lang",
    "tunings",
    "car_params",
    "hud_overlay",
    "sessions",
    "drag_sessions",
    "user_configs",
    "captures",
];

pub fn safe_path(base: &Path, relative: &str) -> ApiResult<PathBuf> {
    if relative.is_empty() || relative.contains(['\0', '\\', ':']) {
        return Err(ApiError::new(400, "Invalid path"));
    }
    let path = Path::new(relative);
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(ApiError::new(400, "Invalid path"));
    }
    // Win32 strips these suffixes before resolving a component. Reject aliases
    // before matching directory entries, even on non-Windows contract runners.
    if path
        .components()
        .any(|c| c.as_os_str().to_string_lossy().ends_with(['.', ' ']))
    {
        return Err(ApiError::new(400, "Invalid path"));
    }
    let base = base.canonicalize()?;
    let mut directory = base.clone();
    let mut components = path.components();
    while let Some(component) = components.next() {
        // Resolve an enumerated entry, never a user-composed path. In particular,
        // a dangling symlink must be rejected, not treated as a new file.
        let mut found = None;
        for entry in fs::read_dir(&directory)? {
            let entry = entry?;
            if file_name_matches(&entry.file_name(), component.as_os_str()) {
                found = Some(entry.path());
                break;
            }
        }
        if let Some(entry) = found {
            let resolved = entry.canonicalize()?;
            if !resolved.starts_with(&base) {
                return Err(ApiError::new(400, "Invalid path"));
            }
            directory = resolved;
        } else {
            let mut target = directory.join(component);
            for remaining in components {
                target.push(remaining);
            }
            if !target.starts_with(&base) {
                return Err(ApiError::new(400, "Invalid path"));
            }
            return Ok(target);
        }
    }
    Ok(directory)
}

#[cfg(not(windows))]
fn file_name_matches(actual: &std::ffi::OsStr, requested: &std::ffi::OsStr) -> bool {
    actual == requested
}
#[cfg(windows)]
fn file_name_matches(actual: &std::ffi::OsStr, requested: &std::ffi::OsStr) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Globalization::{CompareStringOrdinal, CSTR_EQUAL};
    let actual: Vec<u16> = actual.encode_wide().collect();
    let requested: Vec<u16> = requested.encode_wide().collect();
    unsafe { CompareStringOrdinal(&actual, &requested, true) == CSTR_EQUAL }
}
pub fn read_json(path: &Path) -> ApiResult<Value> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}
pub fn atomic_json(path: &Path, value: &Value) -> ApiResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| ApiError::new(400, "Invalid path"))?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temporary, value)?;
    temporary.write_all(b"\n")?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|e| e.error)?;
    Ok(())
}
pub fn initialize(root: &Path) -> ApiResult<()> {
    for directory in DIRECTORIES {
        fs::create_dir_all(root.join(directory))?;
    }
    for (name, bytes) in crate::assets::EMBEDDED {
        if name.starts_with("lang/") {
            let path = safe_path(root, name)?;
            if !path.exists() {
                fs::write(path, bytes)?;
            }
        }
    }
    Ok(())
}
fn upgrade(mut settings: Value) -> ApiResult<Value> {
    if !settings.is_object() {
        return Err(ApiError::new(
            500,
            "Settings document must be a JSON object",
        ));
    }
    let version = settings
        .get("settings_schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(if settings.get("settings_schema_version").is_some() {
            0
        } else {
            1
        });
    if !(1..=2).contains(&version) {
        return Err(ApiError::new(500, "Unsupported settings schema version"));
    }
    settings["settings_schema_version"] = json!(2);
    Ok(settings)
}
pub fn save_settings(root: &Path, value: &Value) -> ApiResult<()> {
    let value = upgrade(value.clone())?;
    let primary = root.join("settings.json");
    if primary.exists() {
        atomic_json(&root.join("settings.json.bak"), &read_json(&primary)?)?;
    }
    atomic_json(&primary, &value)
}
pub fn load_settings(root: &Path, defaults: &Value) -> ApiResult<Value> {
    let primary = root.join("settings.json");
    if !primary.exists() {
        save_settings(root, defaults)?;
        return upgrade(defaults.clone());
    }
    match read_json(&primary).and_then(|original| {
        let value = upgrade(original.clone())?;
        Ok((original, value))
    }) {
        Ok((original, value)) => {
            if original != value {
                save_settings(root, &value)?;
            }
            Ok(value)
        }
        Err(_) => {
            let backup = read_json(&root.join("settings.json.bak")).and_then(upgrade)?;
            atomic_json(&primary, &backup)?;
            Ok(backup)
        }
    }
}
fn directory_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return 0;
    };
    if metadata.file_type().is_symlink() {
        return 0;
    }
    if metadata.is_file() {
        return metadata.len();
    }
    fs::read_dir(path)
        .map(|entries| entries.flatten().map(|e| directory_size(&e.path())).sum())
        .unwrap_or(0)
}
pub fn storage_overview(root: &Path) -> Value {
    let names = [
        "settings.json",
        "settings.json.bak",
        "layout.json",
        "hud_config.json",
        "car_learning.json",
    ];
    let entries: Vec<Value> = names
        .iter()
        .chain(DIRECTORIES)
        .map(|name| json!({"relative_path": name, "bytes": directory_size(&root.join(name))}))
        .collect();
    let total: u64 = entries.iter().filter_map(|e| e["bytes"].as_u64()).sum();
    let last_backup = fs::metadata(root.join("settings.json.bak"))
        .and_then(|m| m.modified())
        .ok()
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());
    json!({"format":"fh6-settings/v2","schema_version":2,"data_root":"Application data directory","total_bytes":total,"entries":entries,"last_backup":last_backup,"capabilities":{"settings_backup_recovery":"available","settings_export":"not_available","settings_restore":"not_available","sqlite_migration":"not_planned"}})
}
