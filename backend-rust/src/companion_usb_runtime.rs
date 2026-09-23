use crate::{
    assets,
    companion_usb::AdbClient,
    error::{ApiError, ApiResult},
};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

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
    let directory = root.join("tools").join("adb").join(version);
    fs::create_dir_all(&directory)?;
    for name in [
        "adb.exe",
        "AdbWinApi.dll",
        "AdbWinUsbApi.dll",
        "NOTICE.txt",
        "source.properties",
    ] {
        let data = assets::get(&format!("tools/adb/{name}"))
            .ok_or_else(|| ApiError::new(503, "The bundled USB tools are incomplete."))?;
        let path = directory.join(name);
        if path.exists() {
            if fs::read(&path)? != data {
                return Err(ApiError::new(
                    503,
                    "USB tool integrity check failed. Restore the bundled tools before retrying.",
                ));
            }
        } else {
            fs::write(&path, data)?;
        }
    }
    AdbClient::new(directory.join("adb.exe")).map_err(|e| ApiError::new(503, &e.to_string()))
}
