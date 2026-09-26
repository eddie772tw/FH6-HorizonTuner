//! Native services kept behind the Rust backend's HTTP/WebSocket boundary.
//!
//! The public methods intentionally return the JSON objects used by the Python
//! sidecar.  Native calls are routed through one bounded worker per service so
//! a slow WASAPI/GSMTC/Discord provider cannot hold the request thread.

#[cfg(feature = "hud")]
mod audio;
mod discord;
#[cfg(feature = "hud")]
mod media;
#[cfg(not(feature = "hud"))]
mod unsupported;
#[cfg(not(feature = "hud"))]
use unsupported::{audio, media};

use std::sync::Arc;

use serde_json::Value;
/// A broken driver/IPC provider must not hold sidecar shutdown indefinitely.
#[cfg(feature = "hud")]
fn finish_worker(join: std::thread::JoinHandle<()>) {
    finish_worker_with_timeout(join, std::time::Duration::from_millis(100));
}
fn finish_worker_with_timeout(join: std::thread::JoinHandle<()>, timeout: std::time::Duration) {
    let deadline = std::time::Instant::now() + timeout;
    while !join.is_finished() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    if join.is_finished() {
        let _ = join.join();
    }
}

#[cfg(feature = "hud")]
pub use audio::{default_audio_devices, AudioDevice};
pub use discord::{DiscordPresence, PresenceSnapshot};
#[cfg(not(feature = "hud"))]
use media::MediaService;
#[cfg(feature = "hud")]
pub use media::{media_fallback, MediaService};

/// Error returned when a native command cannot be accepted or completed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NativeError {
    InvalidDeviceId,
    WorkerUnavailable,
    Native(String),
}

impl std::fmt::Display for NativeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDeviceId => f.write_str("audio device id is empty"),
            Self::WorkerUnavailable => f.write_str("native worker unavailable"),
            Self::Native(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for NativeError {}

/// Façade consumed by the Rust HTTP and WebSocket layers.
pub struct NativeServices {
    audio: audio::AudioService,
    media: MediaService,
    discord: Arc<DiscordPresence>,
}

impl NativeServices {
    pub fn new() -> Self {
        Self {
            audio: audio::AudioService::new(),
            media: MediaService::new(),
            discord: Arc::new(DiscordPresence::new()),
        }
    }
    pub fn for_data_root(root: &std::path::Path) -> Self {
        Self {
            audio: audio::AudioService::new(),
            media: MediaService::new(),
            discord: Arc::new(DiscordPresence::for_data_root(Some(root))),
        }
    }

    pub fn get_audio_devices(&self) -> Value {
        self.audio.get_devices()
    }

    pub fn set_audio_device(&self, device_id: &str) -> Result<Value, NativeError> {
        self.audio.set_device(device_id)
    }

    pub fn audio_spectrum(&self) -> Value {
        self.audio.spectrum()
    }

    pub fn cached_audio_spectrum(&self) -> Value {
        self.audio.cached_spectrum()
    }

    pub fn update_audio_pcm(&self, samples: &[f32]) {
        self.audio.update_pcm(samples)
    }

    pub fn stop_audio_spectrum(&self) {
        self.audio.stop_capture()
    }

    pub fn system_media(&self) -> Value {
        self.media.snapshot()
    }

    pub fn refresh_system_media(&self) {
        self.media.refresh()
    }

    pub fn diagnostics(&self) -> Value {
        serde_json::json!({"audio":self.audio.diagnostics(),"media":self.media.diagnostics()})
    }

    pub fn thumbnail(&self) -> Option<(String, Vec<u8>)> {
        self.media.thumbnail()
    }

    pub fn thumbnail_metadata(&self) -> Option<(String, Vec<u8>, String)> {
        self.media.thumbnail_metadata()
    }

    pub fn discord_start(&self) {
        self.discord.start()
    }

    pub fn discord_stop(&self) {
        self.discord.stop()
    }

    pub fn discord_submit(&self, telemetry: Value) {
        self.discord.submit(telemetry)
    }

    pub fn discord_status(&self) -> Value {
        self.discord.status()
    }

    pub fn discord_clear(&self) {
        self.discord.clear()
    }
}

impl Default for NativeServices {
    fn default() -> Self {
        Self::new()
    }
}
