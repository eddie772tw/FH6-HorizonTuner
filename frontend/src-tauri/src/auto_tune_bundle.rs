//! The portable EXE owns both its OCR assets and its isolated controller runtime.
//! No network bootstrap, PATH interpreter lookup or user-supplied environment.
use std::fs;
use std::path::{Path, PathBuf};

const RUNTIME: &[(&str, &[u8])] = include!(concat!(env!("OUT_DIR"), "/auto_tune_runtime.rs"));
const WORKER: &[(&str, &[u8])] = include!(concat!(env!("OUT_DIR"), "/worker_resources.rs"));

pub struct Bundle {
    pub python: PathBuf,
    pub worker: PathBuf,
    guards: Vec<fs::File>,
}

#[derive(Default)]
pub struct RuntimeGuards(std::sync::Mutex<Vec<fs::File>>);

pub fn configure_backend(app: &tauri::AppHandle, base: &Path, command: &mut std::process::Command) {
    use tauri::Manager;
    command.env_remove("FH6_AUTO_TUNE_RUNTIME");
    match prepare(base) {
        Ok(bundle) => {
            if let Ok(mut guards) = app.state::<RuntimeGuards>().0.lock() {
                command.env(
                    "FH6_AUTO_TUNE_RUNTIME",
                    bundle.python.parent().unwrap().parent().unwrap(),
                );
                *guards = bundle.guards;
            }
        }
        Err(error) => eprintln!("Automated tuning is unavailable: {error}"),
    }
}

fn materialize(root: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    let target = root.join(name);
    let mut directory = root.to_path_buf();
    super::ensure_safe_dir(&directory)?;
    for component in Path::new(name).parent().unwrap().components() {
        directory.push(component);
        super::ensure_safe_dir(&directory)?;
    }
    if fs::symlink_metadata(&target)
        .is_ok_and(|meta| meta.file_type().is_symlink() || !meta.is_file())
    {
        return Err(format!("Refusing unsafe runtime asset {target:?}"));
    }
    if fs::read(&target).ok().as_deref() == Some(bytes) {
        return Ok(());
    }
    fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
    use std::io::Write;
    let sequence = super::SIDECAR_TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let temporary = target.with_extension(format!("{}-{sequence}.tmp", std::process::id()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&temporary, &target).map_err(|e| format!("{}: {e}", target.display()))
}

pub fn prepare(base: &Path) -> Result<Bundle, String> {
    if RUNTIME.is_empty() {
        return Err(
            "Build the offline Auto Tune payload with scripts/prepare_auto_tune_runtime.py first."
                .into(),
        );
    }
    let root = base.join("runtime").join(env!("FH6_AUTO_TUNE_BUNDLE"));
    super::ensure_safe_dir(base)?;
    super::ensure_safe_dir(&base.join("runtime"))?;
    for (name, bytes) in RUNTIME {
        materialize(&root, name, bytes)?;
    }
    let scripts = root.join("auto_tune");
    for (name, bytes) in WORKER {
        materialize(&scripts, name, bytes)?;
    }
    #[allow(unused_mut)]
    let mut guards = Vec::new();
    #[cfg(windows)]
    for (name, bytes) in RUNTIME {
        guards.extend(super::pin_extracted_sidecar(&root.join(name), bytes)?);
    }
    #[cfg(windows)]
    for (name, bytes) in WORKER {
        guards.extend(super::pin_extracted_sidecar(&scripts.join(name), bytes)?);
    }
    Ok(Bundle {
        python: root.join("python/python.exe"),
        worker: scripts.join("worker.py"),
        guards,
    })
}

/// Read-only artifact acceptance, before Tauri/WebView/backend startup. The
/// explicit CLI has no game input capability and invokes only our embedded code.
pub fn verification_cli() -> Option<i32> {
    let args = std::env::args_os().skip(1).collect::<Vec<_>>();
    if args.first().is_none_or(|arg| arg != "--auto-tune-verify") {
        return None;
    }
    if args.len() != 4 {
        eprintln!("Usage: --auto-tune-verify <corpus> <manifest.json> <report.json>");
        return Some(2);
    }
    let output = PathBuf::from(&args[3]);
    let result = (|| -> Result<i32, String> {
        let parent = match output.parent() {
            Some(path) if path.as_os_str().is_empty() => Path::new("."),
            Some(path) => path,
            None => return Err("Report needs a parent directory".into()),
        };
        let bundle = prepare(&parent.join("auto-tune-verification"))?;
        let mut command = std::process::Command::new(&bundle.python);
        command
            .args(["-I", "-B", "-X", "utf8"])
            .arg(bundle.worker.with_file_name("replay.py"))
            .arg("--corpus")
            .arg(&args[1])
            .arg("--manifest")
            .arg(&args[2])
            .current_dir(parent)
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
            .env_remove("FH6_OCR_ENGINE")
            .env_remove("FH6_OCR_RUNTIME")
            .env("PATH", "");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let started = std::time::Instant::now();
        let child = command.output().map_err(|e| e.to_string())?;
        let report = serde_json::json!({
            "success": child.status.success(),
            "workerSeconds": started.elapsed().as_secs_f64(),
            "result": serde_json::from_slice::<serde_json::Value>(&child.stdout).ok(),
            "stderr": String::from_utf8_lossy(&child.stderr),
        });
        fs::write(&output, report.to_string()).map_err(|e| e.to_string())?;
        Ok(if child.status.success() { 0 } else { 1 })
    })();
    Some(match result {
        Ok(code) => code,
        Err(error) => {
            let _ = fs::write(
                output,
                serde_json::json!({"success": false, "error": error}).to_string(),
            );
            1
        }
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn restores_a_corrupt_cached_asset() {
        let root = std::env::temp_dir().join(format!("fh6-bundle-test-{}", std::process::id()));
        super::materialize(&root, "nested/model", b"expected").unwrap();
        std::fs::write(root.join("nested/model"), b"corrupt").unwrap();
        super::materialize(&root, "nested/model", b"expected").unwrap();
        assert_eq!(
            std::fs::read(root.join("nested/model")).unwrap(),
            b"expected"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
