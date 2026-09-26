#[cfg(windows)]
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
    in_flight: Option<Instant>,
    query_timed_out: bool,
    retry_at: Instant,
    last_error: Option<String>,
}

enum MediaCommand {
    Query,
    Stop,
}

struct MediaWorker {
    tx: mpsc::SyncSender<MediaCommand>,
    join: Option<JoinHandle<()>>,
}

impl MediaWorker {
    fn new(
        state: Arc<Mutex<MediaState>>,
        mut query: impl FnMut() -> Result<MediaResult, String> + Send + 'static,
    ) -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let join = thread::Builder::new()
            .name("fh6-gsmtc".into())
            .spawn(move || {
                while let Ok(command) = rx.recv() {
                    match command {
                        MediaCommand::Query => {
                            let result = query();
                            if let Ok(mut state) = state.lock() {
                                state.in_flight = None;
                                state.query_timed_out = false;
                                state.last_check = Instant::now();
                                match result {
                                    Ok(result) => {
                                        state.snapshot = result.snapshot;
                                        state.thumbnail = result.thumbnail;
                                        state.last_valid = Some(Instant::now());
                                        state.failure_count = 0;
                                        state.last_error = None;
                                        state.retry_at = Instant::now();
                                    }
                                    Err(error) => state.fail(error),
                                }
                            }
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
}

impl MediaState {
    fn fail(&mut self, error: String) {
        self.failure_count = self.failure_count.saturating_add(1);
        self.last_error = Some(error);
        let seconds = [1, 2, 5, 10][usize::from(self.failure_count.saturating_sub(1)).min(3)];
        self.retry_at = Instant::now() + Duration::from_secs(seconds);
    }

    fn expire(&mut self) {
        if self
            .in_flight
            .is_some_and(|at| at.elapsed() >= QUERY_TIMEOUT)
            && !self.query_timed_out
        {
            self.query_timed_out = true;
            self.fail("GSMTC query timed out".into());
        }
        if self.last_error.is_some() {
            if self
                .last_valid
                .is_some_and(|at| at.elapsed() <= STALE_GRACE)
            {
                self.snapshot["state"] = json!("stale");
                self.snapshot["source"] = json!("stale");
            } else {
                self.snapshot = media_fallback();
                self.thumbnail = None;
            }
        }
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
        Self::with_query(query_platform)
    }

    fn with_query(query: impl FnMut() -> Result<MediaResult, String> + Send + 'static) -> Self {
        let state = Arc::new(Mutex::new(MediaState {
            snapshot: media_fallback(),
            thumbnail: None,
            last_check: Instant::now() - CACHE_TTL,
            last_valid: None,
            failure_count: 0,
            in_flight: None,
            query_timed_out: false,
            retry_at: Instant::now(),
            last_error: None,
        }));
        Self {
            worker: MediaWorker::new(state.clone(), query),
            state,
        }
    }

    pub fn snapshot(&self) -> Value {
        self.refresh();
        self.state
            .lock()
            .map(|s| s.snapshot.clone())
            .unwrap_or_else(|_| media_fallback())
    }

    pub fn refresh(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.expire();
            // A hung native call never queues another query or blocks HTTP/audio.
            if state.in_flight.is_some()
                || state.last_check.elapsed() < CACHE_TTL
                || Instant::now() < state.retry_at
            {
                return;
            }
            state.last_check = Instant::now();
            match self.worker.tx.try_send(MediaCommand::Query) {
                Ok(()) => state.in_flight = Some(Instant::now()),
                Err(_) => state.fail("GSMTC worker unavailable".into()),
            }
        }
    }

    pub fn diagnostics(&self) -> Value {
        let Ok(mut state) = self.state.lock() else {
            return json!({"state":"unavailable","error":"GSMTC state unavailable"});
        };
        state.expire();
        json!({"state":state.snapshot["state"],"source":state.snapshot["source"],
            "queryInFlight":state.in_flight.is_some(),"failures":state.failure_count,
            "error":state.last_error})
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
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    struct WinRtGuard;
    impl Drop for WinRtGuard {
        fn drop(&mut self) {
            unsafe {
                RoUninitialize();
            }
        }
    }
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).map_err(|e| e.to_string())?;
    }
    let _winrt = WinRtGuard;
    let manager = wait_winrt(
        "GSMTC manager",
        QUERY_TIMEOUT,
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| format!("GSMTC manager: {e}"))?
            .into_future(),
    )?;
    let current = manager.GetCurrentSession().ok();
    let sessions = manager.GetSessions();
    let mut candidates = Vec::new();
    let mut inspection_error = None;
    if let Some(session) = current.clone() {
        candidates.push(session);
    }
    match sessions {
        Ok(view) => match view.Size() {
            Ok(count) => {
                for i in 0..count {
                    match view.GetAt(i) {
                        Ok(session) if current.as_ref() != Some(&session) => {
                            candidates.push(session)
                        }
                        Err(error) => inspection_error = Some(format!("GSMTC session: {error}")),
                        _ => (),
                    }
                }
            }
            Err(error) => inspection_error = Some(format!("GSMTC session count: {error}")),
        },
        Err(error) => inspection_error = Some(format!("GSMTC sessions: {error}")),
    }
    let mut chosen = None;
    for session in candidates {
        let info = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("GSMTC properties: {e}"))
            .and_then(|op| wait_winrt("GSMTC properties", QUERY_TIMEOUT, op.into_future()));
        let info = match info {
            Ok(info) => info,
            Err(error) => {
                inspection_error = Some(error);
                continue;
            }
        };
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
        if playing {
            chosen = Some((session, info, playback, timeline));
            break;
        }
        if chosen.is_none() {
            chosen = Some((session, info, playback, timeline));
        }
    }
    chosen
        .map(|(session, info, playback, timeline)| {
            // Artwork failure must not hide otherwise valid title/album metadata.
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
            Ok(MediaResult {
                snapshot,
                thumbnail,
            })
        })
        .unwrap_or_else(|| {
            if let Some(error) = inspection_error {
                return Err(error);
            }
            Ok(MediaResult {
                snapshot: media_fallback_with("winrt", "none"),
                thumbnail: None,
            })
        })
}

#[cfg(windows)]
fn wait_winrt<T>(
    stage: &str,
    timeout: Duration,
    future: impl std::future::Future<Output = windows::core::Result<T>>,
) -> Result<T, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(async {
            tokio::time::timeout(timeout, future)
                .await
                .map_err(|_| format!("{stage} timed out"))?
                .map_err(|e| format!("{stage}: {e}"))
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
    let stream = wait_winrt(
        "GSMTC thumbnail open",
        Duration::from_millis(500),
        reference
            .OpenReadAsync()
            .map_err(|e| e.to_string())?
            .into_future(),
    )?;
    let size = stream.Size().map_err(|e| e.to_string())?;
    if size == 0 || size > 10 * 1024 * 1024 {
        return Ok(None);
    }
    let input = stream.GetInputStreamAt(0).map_err(|e| e.to_string())?;
    let reader = DataReader::CreateDataReader(&input).map_err(|e| e.to_string())?;
    let loaded = wait_winrt(
        "GSMTC thumbnail read",
        Duration::from_millis(500),
        reader
            .LoadAsync(size as u32)
            .map_err(|e| e.to_string())?
            .into_future(),
    )?;
    if u64::from(loaded) != size {
        return Err("GSMTC thumbnail stream was truncated".into());
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hung_provider_keeps_snapshots_nonblocking_and_does_not_queue_queries() {
        let (started, entered) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let service = MediaService::with_query(move || {
            started.send(()).unwrap();
            wait.recv().unwrap();
            Ok(MediaResult {
                snapshot: media_fallback_with("winrt", "none"),
                thumbnail: None,
            })
        });
        let before = Instant::now();
        assert_eq!(service.snapshot()["state"], "unavailable");
        assert!(before.elapsed() < Duration::from_millis(100));
        entered.recv_timeout(Duration::from_secs(1)).unwrap();
        {
            let mut state = service.state.lock().unwrap();
            state.in_flight = Some(Instant::now() - QUERY_TIMEOUT);
        }
        for _ in 0..10 {
            service.snapshot();
        }
        assert_eq!(service.diagnostics()["failures"], 1);
        assert_eq!(service.diagnostics()["queryInFlight"], true);
        release.send(()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(1);
        while service.diagnostics()["queryInFlight"] == true {
            assert!(Instant::now() < deadline);
            thread::yield_now();
        }
        assert_eq!(service.snapshot()["source"], "winrt");
        assert_eq!(service.diagnostics()["error"], Value::Null);
        assert!(entered.try_recv().is_err());
    }

    #[test]
    fn failed_media_expires_stale_metadata_and_artwork() {
        let service = MediaService::with_query(|| unreachable!());
        let mut state = service.state.lock().unwrap();
        state.snapshot["has_media"] = json!(true);
        state.last_valid = Some(Instant::now());
        state.thumbnail = Some(ThumbnailData {
            content_type: "image/png".into(),
            hash: "test".into(),
            bytes: vec![1],
        });
        state.fail("provider disconnected".into());
        state.expire();
        assert_eq!(state.snapshot["state"], "stale");
        assert!(state.thumbnail.is_some());
        state.last_valid = Some(Instant::now() - STALE_GRACE - Duration::from_secs(1));
        state.expire();
        assert_eq!(state.snapshot["has_media"], false);
        assert_eq!(state.snapshot["state"], "unavailable");
        assert!(state.thumbnail.is_none());
    }
}
