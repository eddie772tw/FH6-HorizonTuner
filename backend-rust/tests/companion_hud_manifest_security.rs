use fh6_backend::companion::CompanionService;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[test]
fn hud_manifest_enforces_root_containment_symlink_blocking_and_bounds() {
    let base = tempfile::tempdir().unwrap();
    let p = base.path();
    let (out, data, rlink) = (p.join("out"), p.join("data"), p.join("rlink"));
    let hud = data.join("hud_overlay");
    for d in [&out, &data, &rlink, &p.join("hud_overlay")] {
        fs::create_dir_all(d).unwrap();
    }
    fs::write(out.join("secret.txt"), b"secret").unwrap();
    fs::write(p.join("hud_overlay").join("parent.txt"), b"up").unwrap();
    let run = |dir: &Path| CompanionService::new(dir, 8001).generate_hud_manifest();
    assert!(run(&data).is_empty());
    for sub in ["custom", "tests", "node_modules"] {
        fs::create_dir_all(hud.join(sub)).unwrap();
    }
    fs::write(hud.join("custom").join("index.html"), b"<h1>ok</h1>").unwrap();
    fs::write(hud.join("tests").join("skip.html"), b"skip").unwrap();
    fs::write(hud.join("node_modules").join("skip.js"), b"skip").unwrap();
    let big = fs::File::create(hud.join("big.bin")).unwrap();
    big.set_len((32 << 20) + 1).unwrap();
    let deep = (0..18).fold(hud.clone(), |d, i| d.join(format!("d{i}")));
    fs::create_dir_all(&deep).unwrap();
    fs::write(deep.join("too_deep.txt"), b"deep").unwrap();
    let links = [
        hud.join("e"),
        hud.join("custom").join("l"),
        rlink.join("hud_overlay"),
    ];
    for (l, t) in [(&links[0], &out), (&links[1], &hud), (&links[2], &out)] {
        #[cfg(windows)]
        assert!(std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .args([l, t])
            .status()
            .unwrap()
            .success());
        #[cfg(unix)]
        std::os::unix::fs::symlink(t, l).unwrap();
    }
    let items = run(&data);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].path, "custom/index.html");
    assert_eq!(items[0].size_bytes, 11);
    let exp: String = Sha256::digest(b"<h1>ok</h1>")
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(items[0].sha256, exp);
    assert!(run(&rlink).is_empty());
    for l in &links {
        let _ = fs::remove_dir(l).or_else(|_| fs::remove_file(l));
    }
}
