//! User-selected export destinations; the IPC caller never supplies a write path.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(windows))]
use tauri::Manager;

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
static SAVING: AtomicBool = AtomicBool::new(false);

struct SaveGuard;
impl Drop for SaveGuard {
    fn drop(&mut self) {
        SAVING.store(false, Ordering::Release);
    }
}

fn validate_export(name: &str, size: usize) -> Result<&str, String> {
    if size > MAX_EXPORT_BYTES {
        return Err("Export exceeds the 64 MiB limit.".into());
    }
    if name.is_empty()
        || name.len() > 240
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Invalid export filename.".into());
    }
    match name.rsplit('.').next() {
        Some(extension @ ("json" | "csv" | "xml" | "zip")) => Ok(extension),
        _ => Err("Unsupported export file type.".into()),
    }
}

/// Commit only a completely written temporary sibling, preserving an old file on write failure.
fn write_export(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("The export destination has no parent directory.")?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary = parent.join(format!(".fh6-export-{}-{nonce}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = file.write_all(data).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| fs::rename(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|e| format!("Unable to save export: {e}"))
}

#[cfg(target_os = "windows")]
fn choose_and_save(owner: isize, name: &str, data: &[u8]) -> Result<Option<String>, String> {
    use std::os::windows::ffi::OsStringExt;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Controls::Dialogs::{
        CommDlgExtendedError, GetSaveFileNameW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT,
        OFN_PATHMUSTEXIST, OPENFILENAMEW,
    };
    let extension = validate_export(name, data.len())?;
    let filter: Vec<u16> = format!(
        "{} (*.{extension})\0*.{extension}\0All files (*.*)\0*.*\0\0",
        extension.to_uppercase()
    )
    .encode_utf16()
    .collect();
    let default_extension: Vec<u16> = extension.encode_utf16().chain(Some(0)).collect();
    let mut filename = vec![0u16; 32768];
    for (target, value) in filename.iter_mut().zip(name.encode_utf16()) {
        *target = value;
    }
    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        hwndOwner: HWND(owner as *mut std::ffi::c_void),
        lpstrFilter: PCWSTR(filter.as_ptr()),
        nFilterIndex: 1,
        lpstrFile: PWSTR(filename.as_mut_ptr()),
        nMaxFile: filename.len() as u32,
        lpstrDefExt: PCWSTR(default_extension.as_ptr()),
        Flags: OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST,
        ..Default::default()
    };
    // All buffers above live until this synchronous native dialog returns.
    if !unsafe { GetSaveFileNameW(&mut dialog) }.as_bool() {
        let error = unsafe { CommDlgExtendedError() }.0;
        return if error == 0 {
            Ok(None)
        } else {
            Err(format!("Save dialog failed (Windows error {error})."))
        };
    }
    let end = filename
        .iter()
        .position(|value| *value == 0)
        .ok_or("Invalid destination from save dialog.")?;
    let path = std::path::PathBuf::from(std::ffi::OsString::from_wide(&filename[..end]));
    write_export(&path, data)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn save_export_file(
    window: tauri::WebviewWindow,
    suggested_name: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    if window.label() != "main" {
        return Err("Exports require the main application window.".into());
    }
    validate_export(&suggested_name, data.len())?;
    #[cfg(target_os = "windows")]
    {
        let owner = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        if SAVING.swap(true, Ordering::AcqRel) {
            return Err("Another save dialog is already open.".into());
        }
        let guard = SaveGuard;
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = guard;
            choose_and_save(owner, &suggested_name, &data)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_dialog::DialogExt;
        if SAVING.swap(true, Ordering::AcqRel) {
            return Err("Another save dialog is already open.".into());
        }
        let guard = SaveGuard;
        let app = window.app_handle().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = guard;
            let extension = validate_export(&suggested_name, data.len())?;
            let chosen = app
                .dialog()
                .file()
                .set_file_name(&suggested_name)
                .add_filter(extension.to_uppercase(), &[extension])
                .blocking_save_file();
            let Some(chosen) = chosen else {
                return Ok(None);
            };
            let path = chosen.into_path().map_err(|error| error.to_string())?;
            write_export(&path, &data)?;
            Ok(Some(path.to_string_lossy().into_owned()))
        })
        .await
        .map_err(|error| error.to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_export_boundary() {
        assert_eq!(validate_export("測試.csv", 4).unwrap(), "csv");
        for name in ["", "../bad.json", "C:\\bad.json", "bad\0.json", "bad.exe"] {
            assert!(validate_export(name, 1).is_err());
        }
        assert!(validate_export("data.json", MAX_EXPORT_BYTES + 1).is_err());
    }

    #[test]
    fn writes_binary_bytes_and_replaces_only_the_chosen_file() {
        let root = std::env::temp_dir().join(format!(
            "fh6-export-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let path = root.join("測試.zip");
        fs::write(&path, b"old").unwrap();
        write_export(&path, &[0, 1, 128, 255]).unwrap();
        assert_eq!(fs::read(&path).unwrap(), [0, 1, 128, 255]);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        assert!(write_export(&root.join("missing/data.csv"), b"new").is_err());
        assert_eq!(fs::read(&path).unwrap(), [0, 1, 128, 255]);
        fs::remove_dir_all(root).unwrap();
    }
}
