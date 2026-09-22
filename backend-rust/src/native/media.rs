use std::future::IntoFuture;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const CACHE_TTL: Duration = Duration::from_secs(1);
const QUERY_TIMEOUT: Duration = Duration::from_millis(1500);
const STALE_GRACE: Duration = Duration::from_secs(3);

pub fn media_fallback() -> Value {
    json!({
        "title": "Turbo Fire", "artist": "TANTRON", "album_title": null,
        "album_artist": null, "subtitle": null, "genres": [],
        "track_number": null, "album_track_count": null, "playback_type": null,
        "thumbnail": null, "thumbnail_url": null, "thumbnail_available": false,
        "status": "none", "position_seconds": null, "start_seconds": null,
        "duration_seconds": null, "min_seek_seconds": null, "max_seek_seconds": null,
        "timeline_last_updated_ms": null, "can_seek": false,
        "is_shuffle_active": false, "repeat_mode": "none", "playback_rate": 1.0,
        "playback_controls": playback_controls(), "source_app_user_model_id": null,
        "has_media": false, "state": "unavailable", "source": "unavailable",
        "success": true
    })
}

fn playback_controls() -> Value {
    let fields = [
        "is_channel_down_enabled",
        "is_channel_up_enabled",
        "is_fast_forward_enabled",
        "is_next_enabled",
        "is_pause_enabled",
        "is_playback_position_enabled",
        "is_playback_rate_enabled",
        "is_play_enabled",
        "is_play_pause_toggle_enabled",
        "is_previous_enabled",
        "is_record_enabled",
        "is_repeat_enabled",
        "is_rewind_enabled",
        "is_shuffle_enabled",
        "is_stop_enabled",
    ];
    let mut out = serde_json::Map::new();
    for field in fields {
        out.insert(field.to_owned(), Value::Bool(false));
    }
    Value::Object(out)
}

#[derive(Clone)]
struct MediaState {
    snapshot: Value,
    thumbnail: Option<ThumbnailData>,
    last_check: Instant,
    last_valid: Option<Instant>,
    failure_count: u8,
}

enum MediaCommand {
    Query(mpsc::SyncSender<Result<MediaResult, String>>),
    Stop,
}

struct MediaWorker {
    tx: mpsc::SyncSender<MediaCommand>,
    join: Option<JoinHandle<()>>,
}

impl MediaWorker {
    fn new() -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let join = thread::Builder::new()
            .name("fh6-gsmtc".into())
            .spawn(move || {
                while let Ok(command) = rx.recv() {
                    match command {
                        MediaCommand::Query(reply) => {
                            let _ = reply.send(query_platform());
                        }
                        MediaCommand::Stop => break,
                    }
                }
            })
            .expect("native media worker must start");
        Self {
            tx,
            join: Some(join),
        }
    }

    fn query(&self) -> Option<MediaResult> {
        let (reply, rx) = mpsc::sync_channel(1);
        self.tx.try_send(MediaCommand::Query(reply)).ok()?;
        rx.recv_timeout(QUERY_TIMEOUT).ok()?.ok()
    }
}

impl Drop for MediaWorker {
    fn drop(&mut self) {
        let _ = self.tx.try_send(MediaCommand::Stop);
        if let Some(join) = self.join.take() {
            super::finish_worker(join);
        }
    }
}

#[derive(Clone)]
struct ThumbnailData {
    content_type: String,
    hash: String,
    bytes: Vec<u8>,
}

struct MediaResult {
    snapshot: Value,
    thumbnail: Option<ThumbnailData>,
}

pub struct MediaService {
    state: Arc<Mutex<MediaState>>,
    worker: MediaWorker,
}

impl MediaService {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(MediaState {
                snapshot: media_fallback(),
                thumbnail: None,
                last_check: Instant::now() - CACHE_TTL,
                last_valid: None,
                failure_count: 0,
            })),
            worker: MediaWorker::new(),
        }
    }

    pub fn snapshot(&self) -> Value {
        let refresh = self
            .state
            .lock()
            .map(|s| s.last_check.elapsed() >= CACHE_TTL)
            .unwrap_or(false);
        if refresh {
            self.refresh();
        }
        self.state
            .lock()
            .map(|s| s.snapshot.clone())
            .unwrap_or_else(|_| media_fallback())
    }

    pub fn refresh(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.last_check = Instant::now();
        }
        if let Some(result) = self.worker.query() {
            if let Ok(mut state) = self.state.lock() {
                if result
                    .snapshot
                    .get("has_media")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    state.snapshot = result.snapshot;
                    state.last_valid = Some(Instant::now());
                    state.failure_count = 0;
                    state.thumbnail = result.thumbnail;
                } else {
                    state.snapshot = media_fallback_with("winrt", "none");
                    state.last_valid = Some(Instant::now());
                    state.failure_count = 0;
                    state.thumbnail = None;
                }
            }
        } else if let Ok(mut state) = self.state.lock() {
            state.failure_count = state.failure_count.saturating_add(1);
            if state
                .last_valid
                .map(|t| t.elapsed() <= STALE_GRACE)
                .unwrap_or(false)
            {
                if let Some(object) = state.snapshot.as_object_mut() {
                    object.insert("state".into(), Value::String("stale".into()));
                    object.insert("source".into(), Value::String("stale".into()));
                }
            } else {
                state.snapshot = media_fallback();
                state.thumbnail = None;
            }
        }
    }

    pub fn thumbnail(&self) -> Option<(String, Vec<u8>)> {
        self.snapshot();
        self.state
            .lock()
            .ok()
            .and_then(|s| s.thumbnail.clone())
            .map(|thumbnail| (thumbnail.hash, thumbnail.bytes))
    }

    /// Returns `(content_type, bytes, sha256_prefix)` for the HTTP thumbnail
    /// adapter.  The two-element façade above remains compatible with the
    /// migration contract requested by the Rust backend.
    pub fn thumbnail_metadata(&self) -> Option<(String, Vec<u8>, String)> {
        self.snapshot();
        self.state
            .lock()
            .ok()
            .and_then(|s| s.thumbnail.clone())
            .map(|thumbnail| (thumbnail.content_type, thumbnail.bytes, thumbnail.hash))
    }
}

impl Default for MediaService {
    fn default() -> Self {
        Self::new()
    }
}

fn media_fallback_with(source: &str, state: &str) -> Value {
    let mut value = media_fallback();
    if let Some(object) = value.as_object_mut() {
        object.insert("source".into(), Value::String(source.into()));
        object.insert("state".into(), Value::String(state.into()));
    }
    value
}

#[cfg(not(windows))]
fn query_platform() -> Result<MediaResult, String> {
    Err("GSMTC is only available on Windows".into())
}

#[cfg(windows)]
fn query_platform() -> Result<MediaResult, String> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
    }
    let _com = ComGuard;
    let manager = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(
            GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .map_err(|e| e.to_string())?
                .into_future(),
        )
        .map_err(|e| e.to_string())?;
    let current = manager.GetCurrentSession().ok();
    let sessions = manager.GetSessions().ok();
    let mut candidates = Vec::new();
    if let Some(session) = current.clone() {
        candidates.push(session);
    }
    if let Some(view) = sessions {
        for i in 0..view.Size().unwrap_or(0) {
            if let Ok(session) = view.GetAt(i) {
                if current.as_ref() != Some(&session) {
                    candidates.push(session);
                }
            }
        }
    }
    let mut chosen = None;
    for session in candidates {
        let info = session.TryGetMediaPropertiesAsync().ok().and_then(|op| {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .ok()?
                .block_on(op.into_future())
                .ok()
        });
        let Some(info) = info else { continue };
        let title = info.Title().map(|v| v.to_string()).unwrap_or_default();
        let artist = info.Artist().map(|v| v.to_string()).unwrap_or_default();
        if title.trim().is_empty() && artist.trim().is_empty() {
            continue;
        }
        let playback = session.GetPlaybackInfo().ok();
        let playing = playback
            .as_ref()
            .and_then(|p| p.PlaybackStatus().ok())
            .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false);
        let timeline = session.GetTimelineProperties().ok();
        let thumbnail = info
            .Thumbnail()
            .ok()
            .and_then(|reference| extract_thumbnail(&reference).ok())
            .flatten();
        let snapshot = build_media_snapshot(
            &session,
            &info,
            playback.as_ref(),
            timeline.as_ref(),
            thumbnail.as_ref(),
        );
        if playing {
            chosen = Some((snapshot, thumbnail));
            break;
        }
        if chosen.is_none() {
            chosen = Some((snapshot, thumbnail));
        }
    }
    chosen
        .map(|(snapshot, thumbnail)| {
            Ok(MediaResult {
                snapshot,
                thumbnail,
            })
        })
        .unwrap_or_else(|| {
            Ok(MediaResult {
                snapshot: media_fallback_with("winrt", "none"),
                thumbnail: None,
            })
        })
}

#[cfg(windows)]
fn span_seconds(span: windows::Foundation::TimeSpan) -> Option<f64> {
    (span.Duration >= 0).then(|| crate::diagnostics::round(span.Duration as f64 / 10_000_000.0, 3))
}
#[cfg(windows)]
fn media_text(value: windows::core::Result<windows::core::HSTRING>) -> Option<String> {
    value
        .ok()
        .map(|value| value.to_string().trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(windows)]
fn playback_controls_json(
    controls: Option<
        &windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackControls,
    >,
) -> Value {
    let Some(controls) = controls else {
        return playback_controls();
    };
    json!({
        "is_channel_down_enabled": controls.IsChannelDownEnabled().unwrap_or(false),
        "is_channel_up_enabled": controls.IsChannelUpEnabled().unwrap_or(false),
        "is_fast_forward_enabled": controls.IsFastForwardEnabled().unwrap_or(false),
        "is_next_enabled": controls.IsNextEnabled().unwrap_or(false),
        "is_pause_enabled": controls.IsPauseEnabled().unwrap_or(false),
        "is_playback_position_enabled": controls.IsPlaybackPositionEnabled().unwrap_or(false),
        "is_playback_rate_enabled": controls.IsPlaybackRateEnabled().unwrap_or(false),
        "is_play_enabled": controls.IsPlayEnabled().unwrap_or(false),
        "is_play_pause_toggle_enabled": controls.IsPlayPauseToggleEnabled().unwrap_or(false),
        "is_previous_enabled": controls.IsPreviousEnabled().unwrap_or(false),
        "is_record_enabled": controls.IsRecordEnabled().unwrap_or(false),
        "is_repeat_enabled": controls.IsRepeatEnabled().unwrap_or(false),
        "is_rewind_enabled": controls.IsRewindEnabled().unwrap_or(false),
        "is_shuffle_enabled": controls.IsShuffleEnabled().unwrap_or(false),
        "is_stop_enabled": controls.IsStopEnabled().unwrap_or(false)
    })
}

#[cfg(windows)]
fn build_media_snapshot(
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
    info: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
    playback: Option<
        &windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackInfo,
    >,
    timeline: Option<
        &windows::Media::Control::GlobalSystemMediaTransportControlsSessionTimelineProperties,
    >,
    thumbnail: Option<&ThumbnailData>,
) -> Value {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
    let title = media_text(info.Title()).unwrap_or_else(|| "Turbo Fire".into());
    let artist = media_text(info.Artist()).unwrap_or_else(|| "TANTRON".into());
    let status = playback
        .and_then(|p| p.PlaybackStatus().ok())
        .map(|s| match s {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed => "closed",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Opened => "opened",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Changing => "changing",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => "stopped",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "paused",
            _ => "playing",
        })
        .unwrap_or("playing");
    let position = timeline
        .and_then(|t| t.Position().ok())
        .and_then(span_seconds);
    let start = timeline
        .and_then(|t| t.StartTime().ok())
        .and_then(span_seconds);
    let end = timeline
        .and_then(|t| t.EndTime().ok())
        .and_then(span_seconds);
    let duration = match (start, end) {
        (Some(s), Some(e)) => Some((e - s).max(0.0)),
        (_, e) => e,
    };
    let thumb_url =
        thumbnail.map(|thumbnail| format!("/api/overlay/media/thumbnail?v={}", thumbnail.hash));
    let playback_type = info
        .PlaybackType()
        .ok()
        .and_then(|value| value.Value().ok())
        .map(|value| match value {
            windows::Media::MediaPlaybackType::Music => "music",
            windows::Media::MediaPlaybackType::Video => "video",
            windows::Media::MediaPlaybackType::Image => "image",
            _ => "unknown",
        })
        .unwrap_or("unknown");
    let repeat_mode = playback
        .and_then(|value| value.AutoRepeatMode().ok())
        .and_then(|value| value.Value().ok())
        .map(|value| match value {
            windows::Media::MediaPlaybackAutoRepeatMode::Track => "track",
            windows::Media::MediaPlaybackAutoRepeatMode::List => "list",
            _ => "none",
        })
        .unwrap_or("none");
    let controls = playback.and_then(|value| value.Controls().ok());
    let genres = info
        .Genres()
        .ok()
        .map(|values| {
            (0..values.Size().unwrap_or(0).min(8))
                .filter_map(|index| values.GetAt(index).ok().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let timeline_last_updated_ms = timeline
        .and_then(|value| value.LastUpdatedTime().ok())
        .map(|value| value.UniversalTime / 10_000 - 11_644_473_600_000);
    json!({"title": title.trim(), "artist": artist.trim(), "album_title": media_text(info.AlbumTitle()), "album_artist": media_text(info.AlbumArtist()), "subtitle": media_text(info.Subtitle()), "genres": genres, "track_number": info.TrackNumber().ok(), "album_track_count": info.AlbumTrackCount().ok(), "playback_type": playback_type, "thumbnail": thumb_url, "thumbnail_url": thumb_url, "thumbnail_available": thumbnail.is_some() || info.Thumbnail().is_ok(), "status": status, "position_seconds": position, "start_seconds": start, "duration_seconds": duration, "min_seek_seconds": timeline.and_then(|t| t.MinSeekTime().ok()).and_then(span_seconds), "max_seek_seconds": timeline.and_then(|t| t.MaxSeekTime().ok()).and_then(span_seconds), "timeline_last_updated_ms": timeline_last_updated_ms, "can_seek": controls.as_ref().and_then(|c| c.IsPlaybackPositionEnabled().ok()).unwrap_or(false), "is_shuffle_active": playback.and_then(|p| p.IsShuffleActive().ok()).and_then(|v| v.Value().ok()).unwrap_or(false), "repeat_mode": repeat_mode, "playback_rate": playback.and_then(|p| p.PlaybackRate().ok()).and_then(|v| v.Value().ok()).unwrap_or(1.0), "playback_controls": playback_controls_json(controls.as_ref()), "source_app_user_model_id": media_text(session.SourceAppUserModelId()), "has_media": true, "state": "live", "source": "winrt", "success": true})
}

#[cfg(windows)]
fn extract_thumbnail(
    reference: &windows::Storage::Streams::IRandomAccessStreamReference,
) -> Result<Option<ThumbnailData>, String> {
    use sha2::{Digest, Sha256};
    use windows::Storage::Streams::DataReader;
    let stream = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(
            reference
                .OpenReadAsync()
                .map_err(|e| e.to_string())?
                .into_future(),
        )
        .map_err(|e| e.to_string())?;
    let size = stream.Size().map_err(|e| e.to_string())?;
    if size == 0 || size > 10 * 1024 * 1024 {
        return Ok(None);
    }
    let input = stream.GetInputStreamAt(0).map_err(|e| e.to_string())?;
    let reader = DataReader::CreateDataReader(&input).map_err(|e| e.to_string())?;
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(
            reader
                .LoadAsync(size as u32)
                .map_err(|e| e.to_string())?
                .into_future(),
        )
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![0; size as usize];
    reader.ReadBytes(&mut bytes).map_err(|e| e.to_string())?;
    let digest = Sha256::digest(&bytes);
    let hash = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()[..16]
        .to_owned();
    let content_type = stream
        .ContentType()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "image/jpeg".into());
    Ok(Some(ThumbnailData {
        content_type,
        hash,
        bytes,
    }))
}
