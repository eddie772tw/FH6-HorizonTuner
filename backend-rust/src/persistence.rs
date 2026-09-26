//! Ordered, bounded recorder writes isolated from live telemetry processing.
use crate::{
    config_service::lock,
    telemetry::{RecorderCommand, TelemetryStore},
};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
    time::Instant,
};

#[derive(Default)]
struct Loss {
    samples: usize,
    writes: usize,
}
struct Work {
    command: RecorderCommand,
    after: Option<Box<dyn FnOnce() -> Result<(), String> + Send>>,
}
#[derive(Default)]
struct State {
    queue: VecDeque<Work>,
    // Each accepted start reserves a slot for its finalizer, even at saturation.
    finalizers: HashSet<String>,
    sessions: HashMap<String, Loss>,
    active: bool,
    closed: bool,
    peak: usize,
    completed: usize,
    dropped_batches: usize,
    dropped_samples: usize,
    failures: usize,
    rejected: usize,
    last_ms: f64,
    error: Option<String>,
}
#[derive(Default)]
struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}
pub(crate) struct Persistence {
    shared: Arc<Shared>,
    capacity: usize,
    worker: Option<JoinHandle<()>>,
}
impl Persistence {
    pub fn new(database: Arc<TelemetryStore>) -> Result<Self, String> {
        Self::start(64, move |command| match command {
            RecorderCommand::CreateSession {
                session_id,
                car_ordinal,
                car_name,
                car_class,
                car_pi,
                start_time,
            } => database.create_session(
                &session_id,
                car_ordinal,
                &car_name,
                car_class,
                car_pi,
                start_time,
            ),
            RecorderCommand::WritePoints { session_id, points } => {
                database.insert_points_batch(&session_id, &points)
            }
            RecorderCommand::Finalize {
                session_id,
                metadata,
            } => database.finalize_session(&session_id, metadata).map(|_| ()),
        })
    }

    fn start(
        capacity: usize,
        mut write: impl FnMut(RecorderCommand) -> Result<(), String> + Send + 'static,
    ) -> Result<Self, String> {
        let shared = Arc::new(Shared::default());
        let work = shared.clone();
        let worker = thread::Builder::new()
            .name("fh6-recorder-writer".into())
            .spawn(move || loop {
                let mut state = lock(&work.state);
                while state.queue.is_empty() && !state.closed {
                    state = work.changed.wait(state).unwrap_or_else(|e| e.into_inner());
                }
                let Some(Work { mut command, after }) = state.queue.pop_front() else {
                    break;
                };
                state.active = true;
                let id = session_id(&command).to_owned();
                let batch = matches!(command, RecorderCommand::WritePoints { .. });
                let finalizing = matches!(command, RecorderCommand::Finalize { .. });
                if let RecorderCommand::Finalize { metadata, .. } = &mut command {
                    if let Some(loss) = state.sessions.get(&id) {
                        if loss.samples > 0 || loss.writes > 0 {
                            metadata["droppedSamples"] = json!(
                                metadata["droppedSamples"].as_u64().unwrap_or(0)
                                    + loss.samples as u64
                            );
                            metadata["failedWrites"] = json!(loss.writes);
                            metadata["incompletePersistence"] = json!(true);
                        }
                    }
                }
                drop(state);
                let started = Instant::now();
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    write(command)?;
                    if let Some(after) = after {
                        after()?;
                    }
                    Ok(())
                }))
                .unwrap_or_else(|_| Err("Recorder writer panicked".into()));
                let mut state = lock(&work.state);
                state.last_ms = started.elapsed().as_secs_f64() * 1000.0;
                state.active = false;
                if let Err(error) = result {
                    eprintln!("Recording persistence: {error}");
                    state.error = Some(error);
                    state.failures += 1;
                    if let Some(loss) = state.sessions.get_mut(&id) {
                        loss.writes += 1;
                    }
                } else if batch {
                    state.completed += 1;
                }
                if finalizing {
                    state.sessions.remove(&id);
                }
                work.changed.notify_all();
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            capacity,
            worker: Some(worker),
        })
    }

    pub fn submit(&self, command: RecorderCommand) -> Result<(), String> {
        self.enqueue(command, None)
    }
    pub fn finalize(
        &self,
        session_id: String,
        metadata: Value,
        after: impl FnOnce() -> Result<(), String> + Send + 'static,
    ) -> Result<(), String> {
        self.enqueue(
            RecorderCommand::Finalize {
                session_id,
                metadata,
            },
            Some(Box::new(after)),
        )
    }
    fn enqueue(
        &self,
        command: RecorderCommand,
        after: Option<Box<dyn FnOnce() -> Result<(), String> + Send>>,
    ) -> Result<(), String> {
        let mut state = lock(&self.shared.state);
        if state.closed {
            return Err("Recorder writer is closed".into());
        }
        let id = session_id(&command).to_owned();
        let occupied = state.queue.len() + state.finalizers.len();
        match &command {
            RecorderCommand::CreateSession { .. } => {
                if state.sessions.contains_key(&id) || occupied + 2 > self.capacity {
                    state.rejected += 1;
                    return Err("Recording queue is full; session was not started".into());
                }
                state.finalizers.insert(id.clone());
                state.sessions.insert(id, Loss::default());
            }
            RecorderCommand::WritePoints { points, .. } => {
                if !state.finalizers.contains(&id) {
                    return Err("Recording session is not accepting samples".into());
                }
                if occupied >= self.capacity {
                    state.dropped_batches += 1;
                    state.dropped_samples += points.len();
                    if let Some(loss) = state.sessions.get_mut(&id) {
                        loss.samples += points.len();
                    }
                    return Err("Recording queue is full; sample batch was dropped".into());
                }
            }
            RecorderCommand::Finalize { .. } => {
                if !state.finalizers.remove(&id) {
                    return Err("Recording session was not started or already finalized".into());
                }
            }
        }
        state.queue.push_back(Work { command, after });
        state.peak = state
            .peak
            .max(state.queue.len() + usize::from(state.active));
        self.shared.changed.notify_one();
        Ok(())
    }

    /// Only control/HTTP/shutdown callers wait here; live telemetry never does.
    pub fn flush(&self) -> Result<(), String> {
        let mut state = lock(&self.shared.state);
        while !state.queue.is_empty() || state.active {
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
        json!({"pendingWork":state.queue.len()+usize::from(state.active),"queuePeak":state.peak,
            "completedBatches":state.completed,"droppedBatches":state.dropped_batches,
            "droppedSamples":state.dropped_samples,"failedWrites":state.failures,
            "rejectedControlWork":state.rejected,"lastWriteDurationMs":state.last_ms})
    }
}
impl Drop for Persistence {
    fn drop(&mut self) {
        lock(&self.shared.state).closed = true;
        self.shared.changed.notify_one();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
fn session_id(command: &RecorderCommand) -> &str {
    match command {
        RecorderCommand::CreateSession { session_id, .. }
        | RecorderCommand::WritePoints { session_id, .. }
        | RecorderCommand::Finalize { session_id, .. } => session_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    fn create(id: &str) -> RecorderCommand {
        RecorderCommand::CreateSession {
            session_id: id.into(),
            car_ordinal: 1,
            car_name: "Test".into(),
            car_class: 1,
            car_pi: 700,
            start_time: 0.0,
        }
    }
    fn batch(id: &str) -> RecorderCommand {
        RecorderCommand::WritePoints {
            session_id: id.into(),
            points: vec![json!({"time":0.0})],
        }
    }
    fn finish(id: &str) -> RecorderCommand {
        RecorderCommand::Finalize {
            session_id: id.into(),
            metadata: json!({"droppedSamples":2}),
        }
    }
    #[test]
    fn saturation_does_not_wait_for_io_and_preserves_finalization_order_and_loss() {
        let (entered, entry) = mpsc::channel();
        let (release, gate) = mpsc::channel();
        let (written, writes) = mpsc::channel();
        let writer = Persistence::start(3, move |command| {
            if matches!(command, RecorderCommand::CreateSession { .. }) {
                entered.send(()).unwrap();
                gate.recv_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
            }
            written.send(command).unwrap();
            Ok(())
        })
        .unwrap();
        writer.submit(create("one")).unwrap();
        entry
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        writer.submit(batch("one")).unwrap();
        writer.submit(batch("one")).unwrap();
        assert!(writer.submit(batch("one")).is_err());
        assert!(writer.submit(create("two")).is_err());
        writer.submit(finish("one")).unwrap();
        assert_eq!(writer.snapshot()["droppedSamples"], 1);
        // The release is sent after submission: blocking on storage would deadlock this test.
        release.send(()).unwrap();
        writer.flush().unwrap();
        let writes: Vec<_> = writes.try_iter().collect();
        assert_eq!(writes.len(), 4);
        let RecorderCommand::Finalize { metadata, .. } = &writes[3] else {
            panic!("finalizer must be last")
        };
        assert_eq!(metadata["incompletePersistence"], true);
        assert_eq!(metadata["droppedSamples"], 3);
        assert_eq!(writer.snapshot()["pendingWork"], 0);
    }
    #[test]
    fn failed_writes_are_reported_on_finalized_session_and_drop_drains_work() {
        let (sent, received) = mpsc::channel();
        let writer = Persistence::start(8, move |command| {
            if matches!(command, RecorderCommand::WritePoints { .. }) {
                return Err("disk unavailable".into());
            }
            sent.send(command).unwrap();
            Ok(())
        })
        .unwrap();
        writer.submit(create("one")).unwrap();
        writer.submit(batch("one")).unwrap();
        writer.submit(finish("one")).unwrap();
        drop(writer);
        let writes: Vec<_> = received.try_iter().collect();
        let RecorderCommand::Finalize { metadata, .. } = &writes[1] else {
            panic!("finalizer missing")
        };
        assert_eq!(metadata["failedWrites"], 1);
        assert_eq!(metadata["incompletePersistence"], true);
    }
}
