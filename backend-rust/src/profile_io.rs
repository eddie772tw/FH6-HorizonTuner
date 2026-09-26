//! Coalesced profile I/O: disk never runs on the live telemetry worker.
use crate::{assets, config_service::lock, storage};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
};

pub(crate) enum Lookup {
    Ready(Value),
    Missing,
    Pending,
    Failed,
}
enum Work {
    Load,
    Save(Value),
}
#[derive(Clone, Copy)]
enum LoadState {
    Pending,
    Missing,
    Failed,
}
#[derive(Default)]
struct State {
    pending: BTreeMap<String, Work>,
    loads: BTreeMap<String, LoadState>,
    active: bool,
    writing: bool,
    closed: bool,
    failures: u64,
    error: Option<String>,
}
#[derive(Default)]
struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}
pub(crate) struct ProfileIo {
    shared: Arc<Shared>,
    profiles: Arc<Mutex<BTreeMap<String, Value>>>,
    worker: Option<JoinHandle<()>>,
}
impl ProfileIo {
    pub fn new(
        root: PathBuf,
        profiles: Arc<Mutex<BTreeMap<String, Value>>>,
    ) -> Result<Self, String> {
        Self::start(profiles, move |id, work| {
            let path = storage::safe_path(&root.join("car_params"), &format!("{id}.json"))
                .map_err(|e| e.to_string())?;
            match work {
                Work::Load => {
                    if path.exists() {
                        storage::read_json(&path)
                            .map(Some)
                            .map_err(|e| e.to_string())
                    } else {
                        Ok(assets::json(&format!("car_params/{id}.json")))
                    }
                }
                Work::Save(value) => storage::atomic_json(&path, &value)
                    .map(|_| None)
                    .map_err(|e| e.to_string()),
            }
        })
    }
    fn start(
        profiles: Arc<Mutex<BTreeMap<String, Value>>>,
        mut io: impl FnMut(&str, Work) -> Result<Option<Value>, String> + Send + 'static,
    ) -> Result<Self, String> {
        let shared = Arc::new(Shared::default());
        let work = shared.clone();
        let cache = profiles.clone();
        let worker = thread::Builder::new()
            .name("fh6-profile-io".into())
            .spawn(move || loop {
                let mut state = lock(&work.state);
                while state.pending.is_empty() && !state.closed {
                    state = work.changed.wait(state).unwrap_or_else(|e| e.into_inner());
                }
                let Some((id, job)) = state.pending.pop_first() else {
                    break;
                };
                let loading = matches!(job, Work::Load);
                state.active = true;
                state.writing = !loading;
                drop(state);
                let result =
                    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| io(&id, job)))
                        .unwrap_or_else(|_| Err("Profile worker panicked".into()));
                let mut state = lock(&work.state);
                match result {
                    Ok(Some(value)) if loading => {
                        // A newer explicit save must win over a slow initial load.
                        let mut cache = lock(&cache);
                        cache.entry(id.clone()).or_insert(value);
                        if cache.len() > 20 {
                            if let Some(old) = cache.keys().find(|key| **key != id).cloned() {
                                cache.remove(&old);
                            }
                        }
                        state.loads.remove(&id);
                    }
                    Ok(None) if loading => {
                        state.loads.insert(id, LoadState::Missing);
                    }
                    Ok(_) => {}
                    Err(error) => {
                        eprintln!("Profile I/O: {error}");
                        if loading {
                            state.loads.insert(id, LoadState::Failed);
                        } else {
                            state.failures += 1;
                            state.error = Some(error);
                        }
                    }
                }
                state.active = false;
                state.writing = false;
                work.changed.notify_all();
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            profiles,
            worker: Some(worker),
        })
    }
    pub fn resolve(&self, id: &str) -> Lookup {
        if let Some(value) = lock(&self.profiles).get(id).cloned() {
            return Lookup::Ready(value);
        }
        let mut state = lock(&self.shared.state);
        match state.loads.get(id) {
            Some(LoadState::Missing) => return Lookup::Missing,
            Some(LoadState::Failed) => return Lookup::Failed,
            Some(LoadState::Pending) => return Lookup::Pending,
            None => {}
        }
        if state.closed {
            return Lookup::Failed;
        }
        if state.pending.len() >= 20 {
            return Lookup::Pending;
        }
        // Bound negative lookups too; evicted cars may be loaded again later.
        if state.loads.len() >= 20 {
            if let Some(old) = state
                .loads
                .iter()
                .find(|(_, v)| !matches!(v, LoadState::Pending))
                .map(|(k, _)| k.clone())
            {
                state.loads.remove(&old);
            } else {
                return Lookup::Pending;
            }
        }
        state.loads.insert(id.into(), LoadState::Pending);
        state.pending.insert(id.into(), Work::Load);
        self.shared.changed.notify_one();
        Lookup::Pending
    }
    pub fn save(&self, id: &str, value: Value) -> Result<(), String> {
        let mut state = lock(&self.shared.state);
        if state.closed || (state.pending.len() >= 20 && !state.pending.contains_key(id)) {
            state.failures += 1;
            return Err("Profile write queue is full or closed".into());
        }
        state.loads.remove(id);
        state.pending.insert(id.into(), Work::Save(value));
        self.shared.changed.notify_one();
        Ok(())
    }
    pub fn flush(&self) -> Result<(), String> {
        let mut state = lock(&self.shared.state);
        while !state.pending.is_empty() || state.active {
            state = self
                .shared
                .changed
                .wait(state)
                .unwrap_or_else(|e| e.into_inner());
        }
        state.error.take().map_or(Ok(()), Err)
    }
    pub fn snapshot(&self) -> Value {
        let state = lock(&self.shared.state);
        json!({"pendingWrites":state.pending.values().filter(|v|matches!(v,Work::Save(_))).count()+usize::from(state.writing),"failedWrites":state.failures})
    }
}
impl Drop for ProfileIo {
    fn drop(&mut self) {
        lock(&self.shared.state).closed = true;
        self.shared.changed.notify_one();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    #[test]
    fn slow_load_cannot_replace_newer_cache_and_saves_coalesce_then_drain() {
        let cache = Arc::new(Mutex::new(BTreeMap::new()));
        let (entered, entry) = mpsc::channel();
        let (release, gate) = mpsc::channel();
        let (saved, saves) = mpsc::channel();
        let worker = ProfileIo::start(cache.clone(), move |_, work| match work {
            Work::Load => {
                entered.send(()).unwrap();
                gate.recv_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
                Ok(Some(json!({"v":0})))
            }
            Work::Save(value) => {
                saved.send(value).unwrap();
                Ok(None)
            }
        })
        .unwrap();
        assert!(matches!(worker.resolve("42"), Lookup::Pending));
        entry
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        for v in 1..=5 {
            lock(&cache).insert("42".into(), json!({"v":v}));
            worker.save("42", json!({"v":v})).unwrap();
        }
        release.send(()).unwrap();
        worker.flush().unwrap();
        assert_eq!(lock(&cache)["42"], json!({"v":5}));
        assert_eq!(saves.try_iter().collect::<Vec<_>>(), vec![json!({"v":5})]);
        assert_eq!(worker.snapshot()["pendingWrites"], 0);
    }
    #[test]
    fn missing_and_failed_loads_stay_distinct_and_write_errors_surface_at_flush() {
        let worker = ProfileIo::start(
            Arc::new(Mutex::new(BTreeMap::new())),
            |id, work| match work {
                Work::Load if id == "missing" => Ok(None),
                _ => Err("disk error".into()),
            },
        )
        .unwrap();
        assert!(matches!(worker.resolve("missing"), Lookup::Pending));
        assert!(matches!(worker.resolve("broken"), Lookup::Pending));
        worker.flush().unwrap();
        assert!(matches!(worker.resolve("missing"), Lookup::Missing));
        assert!(matches!(worker.resolve("broken"), Lookup::Failed));
        worker.save("42", json!({})).unwrap();
        assert!(worker.flush().is_err());
        assert_eq!(worker.snapshot()["failedWrites"], 1);
    }
}
