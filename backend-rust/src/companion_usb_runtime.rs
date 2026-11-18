use crate::{
    assets,
    companion_usb::AdbClient,
    error::{ApiError, ApiResult},
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Extract only build-time verified, bundled components. No HTTP-supplied paths.
pub fn packaged_client(root: &Path) -> ApiResult<AdbClient> {
    let executable = assets::get("tools/adb/adb.exe").ok_or_else(|| {
        ApiError::new(
            503,
            "This build does not include Windows USB tools. Rebuild with scripts/prepare_adb.ps1.",
        )
    })?;
    if !cfg!(windows) {
        return Err(ApiError::new(
            503,
            "Bundled USB connection is available on Windows.",
        ));
    }
    let version = Sha256::digest(executable)[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let mut files = Vec::with_capacity(5);
    for name in [
        "adb.exe",
        "AdbWinApi.dll",
        "AdbWinUsbApi.dll",
        "NOTICE.txt",
        "source.properties",
    ] {
        let data = assets::get(&format!("tools/adb/{name}"))
            .ok_or_else(|| ApiError::new(503, "The bundled USB tools are incomplete."))?;
        files.push((name, data));
    }
    AdbClient::new(stage_tools(root, &version, &files)?)
        .map_err(|e| ApiError::unavailable("AdbClient initialize", e))
}

fn ensure_safe_dir(path: &Path) -> ApiResult<PathBuf> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() || !m.is_dir() => {
            return Err(ApiError::new(503, "Refusing unsafe USB tool directory."));
        }
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => fs::create_dir_all(path)?,
        Err(e) => return Err(e.into()),
    }
    Ok(path.canonicalize()?)
}

// Reject symlinks/junctions, stage atomically, and verify exact bytes before executing ADB.
fn stage_tools(root: &Path, version: &str, files: &[(&str, &[u8])]) -> ApiResult<PathBuf> {
    let canonical_root = ensure_safe_dir(root)?;
    let mut dir = canonical_root.clone();
    for segment in ["tools", "adb", version] {
        dir = ensure_safe_dir(&dir.join(segment))?;
    }
    if !dir.starts_with(&canonical_root) {
        return Err(ApiError::new(503, "Refusing unsafe USB tool directory."));
    }
    for (name, data) in files {
        let path = dir.join(name);
        match fs::symlink_metadata(&path) {
            Ok(m) if m.file_type().is_symlink() || !m.is_file() => {
                return Err(ApiError::new(503, "Refusing unsafe USB tool path."));
            }
            Ok(m) if m.len() != data.len() as u64 || fs::read(&path)? != *data => {
                return Err(ApiError::new(
                    503,
                    "USB tool integrity check failed. Restore the bundled tools before retrying.",
                ));
            }
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                let mut temp = tempfile::NamedTempFile::new_in(&dir)?;
                temp.write_all(data)?;
                temp.as_file().sync_all()?;
                temp.persist(&path).map_err(|e| e.error)?;
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(dir.join("adb.exe"))
}

#[cfg(test)]
mod tests {
    use super::stage_tools;
    use std::{fs, path::Path};

    fn stage_adb(root: &Path) -> u16 {
        stage_tools(root, "v1", &[("adb.exe", b"MZ-adb"), ("NOTICE.txt", b"ok")])
            .unwrap_err()
            .status
    }
    #[test]
    fn stages_verifies_and_rejects_tampered_or_non_file_targets() {
        let root = tempfile::tempdir().unwrap();
        let files = [("adb.exe", b"MZ-adb".as_slice()), ("NOTICE.txt", b"ok")];
        let exe = stage_tools(root.path(), "v1", &files).unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"MZ-adb");
        assert_eq!(stage_tools(root.path(), "v1", &files).unwrap(), exe);
        fs::write(&exe, b"MZ-bad").unwrap();
        assert_eq!(stage_adb(root.path()), 503);
        fs::remove_file(&exe).unwrap();
        fs::create_dir(&exe).unwrap();
        assert_eq!(stage_adb(root.path()), 503);
    }
    #[cfg(windows)]
    #[test]
    fn rejects_ntfs_junction_directories_without_writing_outside_root() {
        let base = tempfile::tempdir().unwrap();
        let (outside, root) = (base.path().join("outside"), base.path().join("root"));
        fs::create_dir_all(&outside).unwrap();
        fs::create_dir_all(root.join("tools").join("adb")).unwrap();
        let link = root.join("tools").join("adb").join("v1");
        let cmd = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .args([&link, &outside])
            .status()
            .unwrap();
        assert!(cmd.success());
        assert_eq!(stage_adb(&root), 503);
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_without_touching_targets() {
        use std::os::unix::fs::symlink;
        let base = tempfile::tempdir().unwrap();
        let (outside, root) = (base.path().join("outside"), base.path().join("root"));
        fs::create_dir_all(&outside).unwrap();
        fs::create_dir_all(root.join("tools/adb/v1")).unwrap();
        let trusted = outside.join("trusted.exe");
        fs::write(&trusted, b"MZ-adb").unwrap();
        let link = root.join("tools/adb/v1/adb.exe");
        symlink(&trusted, &link).unwrap();
        assert_eq!(stage_adb(&root), 503);
        fs::remove_file(&link).unwrap();
        symlink(outside.join("dangling.exe"), &link).unwrap();
        assert_eq!(stage_adb(&root), 503);
        assert!(!outside.join("dangling.exe").exists());
    }
}
