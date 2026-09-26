use crate::assets;
use serde_json::{json, Map, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

static EMBEDDED_LANGUAGES: OnceLock<BTreeMap<String, Value>> = OnceLock::new();

fn embedded_languages() -> &'static BTreeMap<String, Value> {
    EMBEDDED_LANGUAGES.get_or_init(assets::languages)
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct FileVersion {
    modified: Option<SystemTime>,
    len: u64,
}

struct CachedOverride {
    path: PathBuf,
    version: FileVersion,
    value: Option<Value>,
}

pub(crate) struct Languages {
    root: PathBuf,
    overrides: Mutex<HashMap<String, CachedOverride>>,
}

impl Languages {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            overrides: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn list(&self) -> Value {
        let mut languages = Map::new();
        languages.insert("en-us".to_owned(), json!("English (US)"));
        let mut local_codes = HashSet::new();
        let mut cache = self
            .overrides
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Ok(entries) = fs::read_dir(self.root.join("lang")) {
            let mut paths: Vec<_> = entries.flatten().map(|entry| entry.path()).collect();
            paths.sort();
            for path in paths {
                if path.extension().is_none_or(|ext| ext != "json") {
                    continue;
                }
                let Some(code) = path
                    .file_stem()
                    .map(|stem| stem.to_string_lossy().to_lowercase())
                else {
                    continue;
                };
                if code == "iso639" || code == "en-us" {
                    continue;
                }
                let Ok(metadata) = fs::metadata(&path) else {
                    continue;
                };
                if !metadata.is_file() {
                    continue;
                }
                local_codes.insert(code.clone());
                let version = FileVersion {
                    modified: metadata.modified().ok(),
                    len: metadata.len(),
                };
                if let Some(value) = self.cached_override(&mut cache, &code, &path, version) {
                    if let Some(object) = value.as_object() {
                        languages.insert(
                            code.clone(),
                            object
                                .get("__language_name__")
                                .cloned()
                                .unwrap_or_else(|| json!(code)),
                        );
                    }
                }
            }
        }
        cache.retain(|code, _| local_codes.contains(code));
        drop(cache);

        for (code, value) in embedded_languages() {
            languages.entry(code.clone()).or_insert_with(|| {
                value
                    .get("__language_name__")
                    .cloned()
                    .unwrap_or_else(|| json!(code))
            });
        }

        json!(languages
            .into_iter()
            .map(|(code, name)| json!({"code": code, "name": name}))
            .collect::<Vec<_>>())
    }

    pub(crate) fn get(&self, code: &str) -> Value {
        let code = code.to_ascii_lowercase();
        let path = self.root.join("lang").join(format!("{code}.json"));
        let mut cache = self
            .overrides
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() => {
                let version = FileVersion {
                    modified: metadata.modified().ok(),
                    len: metadata.len(),
                };
                let value = self.cached_override(&mut cache, &code, &path, version);
                value
                    .or_else(|| embedded_languages().get(&code).cloned())
                    .unwrap_or_else(|| json!({"error": "Language not found"}))
            }
            _ => {
                cache.remove(&code);
                embedded_languages()
                    .get(&code)
                    .cloned()
                    .unwrap_or_else(|| json!({"error": "Language not found"}))
            }
        }
    }

    fn cached_override(
        &self,
        cache: &mut HashMap<String, CachedOverride>,
        code: &str,
        path: &std::path::Path,
        version: FileVersion,
    ) -> Option<Value> {
        if let Some(entry) = cache
            .get(code)
            .filter(|entry| entry.path == path && entry.version == version)
        {
            return entry.value.clone();
        }
        let value = read_json(path).ok();
        cache.insert(
            code.to_owned(),
            CachedOverride {
                path: path.to_owned(),
                version,
                value: value.clone(),
            },
        );
        value
    }
}

fn read_json(path: &std::path::Path) -> Result<Value, ()> {
    let bytes = fs::read(path).map_err(|_| ())?;
    serde_json::from_slice(&bytes).map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::Languages;
    use serde_json::json;
    use std::{fs, path::Path};
    use tempfile::tempdir;

    fn write_language(path: &Path, value: serde_json::Value) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
    }

    #[test]
    fn overrides_update_and_delete_fall_back_to_embedded_translation() {
        let temp = tempdir().unwrap();
        let languages = Languages::new(temp.path().to_owned());
        let embedded = languages.get("zh-tw");
        let path = temp.path().join("lang/zh-tw.json");

        write_language(&path, json!({"__language_name__":"Local","value":"first"}));
        assert_eq!(languages.get("zh-tw")["value"], "first");

        write_language(
            &path,
            json!({"__language_name__":"Updated local name","value":"updated override"}),
        );
        assert_eq!(languages.get("zh-tw")["value"], "updated override");

        fs::remove_file(path).unwrap();
        assert_eq!(languages.get("zh-tw"), embedded);
    }

    #[test]
    fn list_keeps_english_first_and_reflects_added_and_removed_overrides() {
        let temp = tempdir().unwrap();
        let languages = Languages::new(temp.path().to_owned());
        assert_eq!(languages.list()[0]["code"], "en-us");

        let path = temp.path().join("lang/zz-test.json");
        write_language(&path, json!({"__language_name__":"Test language"}));
        write_language(
            &temp.path().join("lang/aa-test.json"),
            json!({"__language_name__":"Earlier alphabetically"}),
        );
        let list = languages.list();
        assert_eq!(list[0]["code"], "en-us");
        let codes: Vec<_> = list
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["code"].as_str().unwrap())
            .collect();
        assert_eq!(codes, ["en-us", "aa-test", "zz-test", "ja-jp", "zh-tw"]);
        assert!(list
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| { entry["code"] == "zz-test" && entry["name"] == "Test language" }));

        write_language(&path, json!({"__language_name__":"Updated test language"}));
        let updated = languages.list();
        assert!(updated.as_array().unwrap().iter().any(|entry| {
            entry["code"] == "zz-test" && entry["name"] == "Updated test language"
        }));

        fs::remove_file(path).unwrap();
        assert!(!languages
            .list()
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["code"] == "zz-test"));
    }

    #[test]
    fn lookup_is_case_insensitive_and_unknown_codes_are_not_cached_as_missing() {
        let temp = tempdir().unwrap();
        let languages = Languages::new(temp.path().to_owned());
        assert_eq!(languages.get("ZH-TW"), languages.get("zh-tw"));
        assert_eq!(
            languages.get("zz-test"),
            json!({"error":"Language not found"})
        );

        let path = temp.path().join("lang/zz-test.json");
        write_language(&path, json!({"value":"appeared later"}));
        assert_eq!(languages.get("zz-test")["value"], "appeared later");
    }
}
