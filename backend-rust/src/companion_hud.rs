//! Read-only, versioned instrument delivery through the existing authenticated Companion prefix.
//! Catalog and artwork are owned by the PC build; Android only implements this cache protocol.
use crate::{
    assets,
    error::{ApiError, ApiResult},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, sync::LazyLock};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub path: String,
    pub sha256: String,
    pub size_bytes: usize,
}
#[derive(Clone, Serialize)]
pub struct Style {
    pub id: String,
    pub label: String,
    pub revision: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub schema_version: &'static str,
    pub revision: String,
    pub styles: Vec<Style>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: &'static str,
    pub style: String,
    pub revision: String,
    pub assets: Vec<Asset>,
}
struct Delivery {
    catalog: Catalog,
    manifests: BTreeMap<String, Manifest>,
    files: BTreeMap<String, (String, &'static [u8])>,
}
fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn asset_revision(entries: &[Asset]) -> String {
    digest(
        entries
            .iter()
            .map(|a| format!("{}\0{}\0{}\n", a.path, a.sha256, a.size_bytes))
            .collect::<String>()
            .as_bytes(),
    )
}
static DELIVERY: LazyLock<Delivery> = LazyLock::new(|| {
    let names: BTreeMap<String, String> = assets::json("hud/shared/companion-instruments.json")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mut files = BTreeMap::new();
    let mut descriptors = Vec::new();
    for (key, bytes) in assets::EMBEDDED {
        let Some(path) = key.strip_prefix("hud/") else {
            continue;
        };
        let Some((directory, _)) = path.split_once('/') else {
            continue;
        };
        if directory != "shared" && !names.contains_key(directory) {
            continue;
        }
        let hash = digest(bytes);
        descriptors.push(Asset {
            path: path.into(),
            sha256: hash.clone(),
            size_bytes: bytes.len(),
        });
        files.insert(path.to_string(), (hash, *bytes));
    }
    descriptors.sort_by(|a, b| a.path.cmp(&b.path));
    let mut manifests = BTreeMap::new();
    let mut styles = Vec::new();
    for (id, label) in names {
        if !files.contains_key(&format!("{id}/index.html")) {
            continue;
        }
        let entries: Vec<_> = descriptors
            .iter()
            .filter(|a| a.path.starts_with("shared/") || a.path.starts_with(&format!("{id}/")))
            .cloned()
            .collect();
        let revision = asset_revision(&entries);
        styles.push(Style {
            id: id.clone(),
            label,
            revision: revision.clone(),
        });
        manifests.insert(
            id.clone(),
            Manifest {
                schema_version: "companion-hud/v1",
                style: id,
                revision,
                assets: entries,
            },
        );
    }
    let revision = digest(&serde_json::to_vec(&styles).expect("serialize instrument catalog"));
    Delivery {
        catalog: Catalog {
            schema_version: "companion-hud/v1",
            revision,
            styles,
        },
        manifests,
        files,
    }
});

pub fn catalog() -> &'static Catalog {
    &DELIVERY.catalog
}
pub fn manifest(style: &str) -> ApiResult<&'static Manifest> {
    DELIVERY
        .manifests
        .get(style)
        .ok_or_else(|| ApiError::new(404, "Unknown main instrument"))
}
pub fn asset(hash: &str, path: &str) -> ApiResult<&'static [u8]> {
    let (expected, bytes) = DELIVERY
        .files
        .get(path)
        .ok_or_else(|| ApiError::new(404, "Unknown instrument asset"))?;
    if hash != expected {
        return Err(ApiError::conflict(
            "Instrument assets changed; refresh the catalog",
        ));
    }
    Ok(bytes)
}
