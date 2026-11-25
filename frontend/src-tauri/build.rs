use std::hash::{Hash, Hasher};
use std::path::Path;

// The portable distribution is a single executable. Include the same worker and
// recognition assets as the installer, preserving relative import/resource paths.
fn collect_worker(root: &Path, dir: &Path, resources: &mut Vec<String>, hash: &mut impl Hasher) {
    let mut entries = std::fs::read_dir(dir)
        .expect("read worker directory")
        .map(|e| e.expect("read worker entry"))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        let kind = entry.file_type().expect("worker file type");
        if kind.is_dir() && entry.file_name() != "__pycache__" {
            collect_worker(root, &path, resources, hash);
        } else if kind.is_file()
            && matches!(
                path.extension().and_then(|s| s.to_str()),
                Some("py" | "ps1" | "json" | "png")
            )
        {
            let name = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            resources.push(format!("({name:?}, include_bytes!({path:?}))"));
            name.hash(hash);
            std::fs::read(&path).expect("read worker source").hash(hash);
        }
    }
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/auto_tune");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut resources = Vec::new();
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    assert!(
        root.join("worker.py").is_file(),
        "Missing automated tuning worker"
    );
    collect_worker(&root, &root, &mut resources, &mut hash);
    resources.sort();
    let source = format!("&[{}]", resources.join(",\n"));
    std::fs::write(
        Path::new(&std::env::var_os("OUT_DIR").unwrap()).join("worker_resources.rs"),
        source,
    )
    .expect("write embedded worker manifest");
    let runtime = Path::new(env!("CARGO_MANIFEST_DIR")).join("auto-tune-runtime");
    println!("cargo:rerun-if-changed={}", runtime.display());
    let windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
    let release = std::env::var("PROFILE").as_deref() == Ok("release");
    if windows && release {
        assert!(runtime.join("manifest.json").is_file(),
            "Missing offline Auto Tune runtime. Run scripts/prepare_auto_tune_runtime.py using uv before packaging.");
    }
    let mut assets = Vec::new();
    if windows && runtime.is_dir() {
        collect_runtime(&runtime, &runtime, &mut assets, &mut hash);
    }
    assets.sort();
    std::fs::write(
        Path::new(&std::env::var_os("OUT_DIR").unwrap()).join("auto_tune_runtime.rs"),
        format!("&[{}]", assets.join(",\n")),
    )
    .expect("write embedded runtime manifest");
    println!(
        "cargo:rustc-env=FH6_AUTO_TUNE_BUNDLE={:016x}",
        hash.finish()
    );
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=capabilities/default.json");
    tauri_build::build()
}

fn collect_runtime(root: &Path, dir: &Path, assets: &mut Vec<String>, hash: &mut impl Hasher) {
    let mut entries = std::fs::read_dir(dir)
        .expect("read runtime")
        .map(|e| e.unwrap().path())
        .collect::<Vec<_>>();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            collect_runtime(root, &path, assets, hash);
        } else {
            let name = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            name.hash(hash);
            std::fs::read(&path).expect("read runtime asset").hash(hash);
            assets.push(format!("({name:?}, include_bytes!({path:?}))"));
        }
    }
}
