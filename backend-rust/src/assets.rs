use serde_json::Value;
use std::collections::BTreeMap;

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

pub fn get(path: &str) -> Option<&'static [u8]> {
    EMBEDDED
        .binary_search_by_key(&path, |(key, _)| *key)
        .ok()
        .map(|i| EMBEDDED[i].1)
}
pub fn json(path: &str) -> Option<Value> {
    serde_json::from_slice(get(path)?).ok()
}
pub fn languages() -> BTreeMap<String, Value> {
    EMBEDDED
        .iter()
        .filter_map(|(key, bytes)| {
            let name = key.strip_prefix("lang/")?.strip_suffix(".json")?;
            if name == "iso639" {
                return None;
            }
            Some((name.to_string(), serde_json::from_slice(bytes).ok()?))
        })
        .collect()
}
