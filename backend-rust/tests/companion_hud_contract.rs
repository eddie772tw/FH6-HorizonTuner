use fh6_backend::companion_hud;
use sha2::{Digest, Sha256};

#[test]
fn host_catalog_delivers_versioned_main_instruments_with_verified_assets() {
    let catalog = companion_hud::catalog();
    assert_eq!(catalog.schema_version, "companion-hud/v1");
    if !fh6_backend::platform::HUD_ENABLED {
        assert!(catalog.styles.is_empty());
        return;
    }
    assert!(!catalog.styles.is_empty());
    for style in &catalog.styles {
        let manifest = companion_hud::manifest(&style.id).unwrap();
        assert_eq!(manifest.revision, style.revision);
        assert!(manifest
            .assets
            .iter()
            .any(|a| a.path == format!("{}/index.html", style.id)));
        assert!(manifest
            .assets
            .iter()
            .any(|a| a.path == "shared/companion.html"));
        for asset in &manifest.assets {
            assert!(
                asset.path.starts_with("shared/")
                    || asset.path.starts_with(&format!("{}/", style.id))
            );
            let bytes = companion_hud::asset(&asset.sha256, &asset.path).unwrap();
            assert_eq!(bytes.len(), asset.size_bytes);
            assert_eq!(
                Sha256::digest(bytes)
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>(),
                asset.sha256
            );
        }
    }
}

#[test]
fn delivery_rejects_auxiliary_modules_stale_hashes_and_unknown_paths() {
    for id in [
        "gamepad_overlay",
        "minimap_overlay",
        "telemetry_cards",
        "../vfd",
        "unknown",
    ] {
        assert!(companion_hud::manifest(id).is_err());
    }
    assert!(companion_hud::asset("anything", "../config.json").is_err());
    if let Some(style) = companion_hud::catalog().styles.first() {
        let asset = &companion_hud::manifest(&style.id).unwrap().assets[0];
        assert_eq!(
            companion_hud::asset("outdated", &asset.path)
                .unwrap_err()
                .status,
            409
        );
    }
}
