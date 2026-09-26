use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rustfft::{num_complex::Complex, FftPlanner};
use serde_json::{json, Value};

use super::NativeError;

const BAND_COUNT: usize = 32;
const DISCOVERY_WAIT: Duration = Duration::from_secs(1);
const CACHE_TTL: Duration = Duration::from_secs(30);
const RETRY_BACKOFF: Duration = Duration::from_secs(5);
const STALE_AFTER: Duration = Duration::from_millis(150);
const SILENT_AFTER: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub fn default_audio_devices() -> Vec<AudioDevice> {
    vec![AudioDevice {
        id: "default".to_owned(),
        name: "System Default Speaker / 系統預設輸出裝置".to_owned(),
        is_default: true,
    }]
}

fn devices_json(devices: &[AudioDevice]) -> Value {
    Value::Array(
        devices
            .iter()
            .map(|d| json!({"id": d.id, "name": d.name, "is_default": d.is_default}))
            .collect(),
    )
}

struct DiscoveryWorker {
    tx: mpsc::SyncSender<DiscoveryCommand>,
    join: Option<JoinHandle<()>>,
}

enum DiscoveryCommand {
    Refresh(mpsc::SyncSender<Result<Vec<AudioDevice>, String>>),
    Stop,
}

struct CaptureWorker {
    tx: mpsc::SyncSender<()>,
    stopping: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl CaptureWorker {
    fn new(state: Arc<Mutex<AudioState>>) -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stop = stopping.clone();
        let join = thread::Builder::new()
            .name("fh6-wasapi-loopback".to_owned())
            .spawn(move || capture_worker_loop(state, rx, worker_stop))
            .expect("native WASAPI worker must start");
        Self {
            tx,
            stopping,
            join: Some(join),
        }
    }

    fn wake(&self) {
        // The channel is only a wakeup; the latest requested state cannot be lost.
        let _ = self.tx.try_send(());
    }

    fn stop(&self) {
        self.wake();
    }
}

impl Drop for CaptureWorker {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::Release);
        self.wake();
        if let Some(join) = self.join.take() {
            super::finish_worker(join);
        }
    }
}

impl DiscoveryWorker {
    fn new() -> Self {
        let (tx, rx) = mpsc::sync_channel(1);
        let join = thread::Builder::new()
            .name("fh6-audio-discovery".to_owned())
            .spawn(move || {
                while let Ok(command) = rx.recv() {
                    match command {
                        DiscoveryCommand::Refresh(reply) => {
                            let result = enumerate_platform().map_err(|e| e.to_string());
                            let _ = reply.send(result);
                        }
                        DiscoveryCommand::Stop => break,
                    }
                }
            })
            .expect("native audio discovery worker must start");
        Self {
            tx,
            join: Some(join),
        }
    }

    fn refresh(&self) -> Result<Vec<AudioDevice>, NativeError> {
        let (reply, rx) = mpsc::sync_channel(1);
        self.tx
            .try_send(DiscoveryCommand::Refresh(reply))
            .map_err(|_| NativeError::WorkerUnavailable)?;
        rx.recv_timeout(DISCOVERY_WAIT)
            .map_err(|_| NativeError::WorkerUnavailable)?
            .map_err(NativeError::Native)
    }
}

impl Drop for DiscoveryWorker {
    fn drop(&mut self) {
        let _ = self.tx.try_send(DiscoveryCommand::Stop);
        if let Some(join) = self.join.take() {
            super::finish_worker(join);
        }
    }
}

struct AudioState {
    devices: Vec<AudioDevice>,
    refresh_after: Instant,
    last_error: bool,
    selected_device: String,
    spectrum: [f32; BAND_COUNT],
    vu_left: f32,
    vu_right: f32,
    has_audio: bool,
    last_update: Option<Instant>,
    captured_at_ms: u64,
    sequence: u64,
    source: &'static str,
    active: bool,
    capture_error: Option<String>,
    resolved_device: Option<String>,
    using_default_fallback: bool,
}

pub struct AudioService {
    state: Arc<Mutex<AudioState>>,
    discovery: DiscoveryWorker,
    capture: CaptureWorker,
}

impl AudioService {
    pub fn new() -> Self {
        let state = Arc::new(Mutex::new(AudioState {
            devices: default_audio_devices(),
            refresh_after: Instant::now(),
            last_error: false,
            selected_device: "default".to_owned(),
            spectrum: [0.0; BAND_COUNT],
            vu_left: 0.0,
            vu_right: 0.0,
            has_audio: false,
            last_update: None,
            captured_at_ms: 0,
            sequence: 0,
            source: "unavailable",
            active: false,
            capture_error: None,
            resolved_device: None,
            using_default_fallback: false,
        }));
        Self {
            capture: CaptureWorker::new(state.clone()),
            state,
            discovery: DiscoveryWorker::new(),
        }
    }

    pub fn get_devices(&self) -> Value {
        let should_refresh = self
            .state
            .lock()
            .map(|state| Instant::now() >= state.refresh_after)
            .unwrap_or(false);
        if should_refresh {
            match self.discovery.refresh() {
                Ok(devices) => {
                    if let Ok(mut state) = self.state.lock() {
                        state.devices = devices;
                        state.refresh_after = Instant::now() + CACHE_TTL;
                        state.last_error = false;
                    }
                }
                Err(_) => {
                    if let Ok(mut state) = self.state.lock() {
                        state.refresh_after = Instant::now() + RETRY_BACKOFF;
                        state.last_error = true;
                    }
                }
            }
        }
        self.state
            .lock()
            .map(|state| devices_json(&state.devices))
            .unwrap_or_else(|_| devices_json(&default_audio_devices()))
    }

    pub fn set_device(&self, device_id: &str) -> Result<Value, NativeError> {
        let selected = device_id.trim();
        if selected.is_empty() {
            return Err(NativeError::InvalidDeviceId);
        }
        if let Ok(mut state) = self.state.lock() {
            if state.selected_device == selected {
                return Ok(json!({"device_id":selected,"success":true}));
            }
            state.selected_device = selected.to_owned();
            state.last_update = None;
            state.source = "unavailable";
            state.capture_error = None;
            if state.active {
                self.capture.wake();
            }
        } else {
            return Err(NativeError::WorkerUnavailable);
        }
        Ok(json!({"device_id": selected, "success": true}))
    }

    pub fn update_pcm(&self, samples: &[f32]) {
        let (spectrum, left, right) = compute_fft_bands(samples);
        let has_audio = left > 0.01 || right > 0.01 || spectrum.iter().any(|x| *x > 0.02);
        if let Ok(mut state) = self.state.lock() {
            state.spectrum = spectrum;
            state.vu_left = left;
            state.vu_right = right;
            state.has_audio = has_audio;
            state.last_update = Some(Instant::now());
            state.captured_at_ms = unix_ms();
            state.sequence = state.sequence.saturating_add(1);
            state.source = "external";
        }
    }

    pub fn stop_capture(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.active = false;
        }
        self.capture.stop();
    }

    pub fn spectrum(&self) -> Value {
        let Ok(mut state) = self.state.lock() else {
            return spectrum_unavailable();
        };
        if !state.active && state.source != "external" {
            state.active = true;
            self.capture.wake();
        }
        Self::snapshot(&state)
    }

    pub fn cached_spectrum(&self) -> Value {
        self.state
            .lock()
            .map(|state| Self::snapshot(&state))
            .unwrap_or_else(|_| spectrum_unavailable())
    }

    fn snapshot(state: &AudioState) -> Value {
        let age = state
            .last_update
            .map(|t| t.elapsed())
            .unwrap_or(Duration::MAX);
        let status = if age > SILENT_AFTER {
            "unavailable"
        } else if age > STALE_AFTER {
            "stale"
        } else if state.has_audio {
            "live"
        } else {
            "silence"
        };
        json!({
            "spectrum": if status == "unavailable" { [0.0; BAND_COUNT] } else { state.spectrum },
            "vu_left": if status == "unavailable" { 0.0 } else { state.vu_left },
            "vu_right": if status == "unavailable" { 0.0 } else { state.vu_right },
            "has_audio": state.has_audio && status == "live",
            "state": status,
            "sequence": state.sequence,
            "captured_at_ms": state.captured_at_ms,
            "source": state.source,
            "success": true
        })
    }

    pub fn diagnostics(&self) -> Value {
        let Ok(state) = self.state.lock() else {
            return json!({"state":"unavailable","error":"WASAPI state unavailable"});
        };
        json!({"active":state.active,"selectedDevice":state.selected_device,
            "resolvedDevice":state.resolved_device,"usingDefaultFallback":state.using_default_fallback,
            "source":state.source,"sequence":state.sequence,"error":state.capture_error,
            "discoveryFailed":state.last_error})
    }
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}

fn spectrum_unavailable() -> Value {
    json!({"spectrum": vec![0.0; BAND_COUNT], "vu_left": 0.0, "vu_right": 0.0,
        "has_audio": false, "state": "unavailable", "sequence": 0,
        "captured_at_ms": 0, "source": "unavailable", "success": true})
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn compute_fft_bands(samples: &[f32]) -> ([f32; BAND_COUNT], f32, f32) {
    if samples.len() < 32 {
        return ([0.0; BAND_COUNT], 0.0, 0.0);
    }
    let left: Vec<f32> = samples.iter().step_by(2).copied().collect();
    let right: Vec<f32> = samples.iter().skip(1).step_by(2).copied().collect();
    let rms = |channel: &[f32]| -> f32 {
        if channel.is_empty() {
            return 0.0;
        }
        (channel.iter().map(|x| x * x).sum::<f32>() / channel.len() as f32).sqrt() * 2.8
    };
    let vu_left = rms(&left).max(0.0);
    let vu_right = rms(&right).max(0.0);
    let n = left.len().min(right.len());
    if n < 16 {
        return ([0.0; BAND_COUNT], vu_left, vu_right);
    }
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);
    let mut buffer = (0..n)
        .map(|i| {
            let l = left.get(i).copied().unwrap_or(0.0);
            let r = right.get(i).copied().unwrap_or(l);
            let hann = 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / (n - 1) as f32).cos();
            Complex {
                re: (l + r) * 0.5 * hann,
                im: 0.0,
            }
        })
        .collect::<Vec<_>>();
    fft.process(&mut buffer);
    let bins = n / 2 + 1;
    let mut result = [0.0; BAND_COUNT];
    for band in 0..BAND_COUNT {
        let start = ((band as f32 / BAND_COUNT as f32).powi(2) * bins as f32) as usize;
        let end = ((((band + 1) as f32 / BAND_COUNT as f32).powi(2) * bins as f32) as usize)
            .max(start + 1)
            .min(bins);
        let avg = buffer[start..end].iter().map(|x| x.norm()).sum::<f32>() / (end - start) as f32;
        result[band] = (avg * 6.0).max(0.0).powf(0.75);
    }
    (result, vu_left, vu_right)
}

#[cfg(not(windows))]
fn capture_worker_loop(
    _state: Arc<Mutex<AudioState>>,
    rx: mpsc::Receiver<()>,
    stopping: Arc<AtomicBool>,
) {
    while !stopping.load(Ordering::Acquire) && rx.recv().is_ok() {}
}

#[cfg(windows)]
fn capture_worker_loop(
    state: Arc<Mutex<AudioState>>,
    rx: mpsc::Receiver<()>,
    stopping: Arc<AtomicBool>,
) {
    while !stopping.load(Ordering::Acquire) {
        let selected = state
            .lock()
            .ok()
            .and_then(|s| s.active.then(|| s.selected_device.clone()));
        let Some(device) = selected else {
            if rx.recv().is_err() {
                break;
            }
            continue;
        };
        if let Err(error) = wasapi_capture_once(&state, &device, &stopping) {
            if let Ok(mut state) = state.lock() {
                state.capture_error = Some(error);
            }
            // A control change interrupts backoff; no stale Select can undo Pause.
            let _ = rx.recv_timeout(Duration::from_millis(100));
        }
    }
}

#[cfg(windows)]
fn wasapi_capture_once(
    state: &Arc<Mutex<AudioState>>,
    selected: &str,
    stopping: &AtomicBool,
) -> Result<(), String> {
    use windows::Win32::Media::Audio::{
        IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        WAVEFORMATEX,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

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
    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|e| e.to_string())?;
    let (device, fallback) = resolve_device(&enumerator, selected)?;
    let resolved_id = device_id(&device)?;
    let client: IAudioClient =
        unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(|e| e.to_string())?;
    let format: *mut WAVEFORMATEX = unsafe { client.GetMixFormat() }.map_err(|e| e.to_string())?;
    if format.is_null() {
        return Err("WASAPI returned a null mix format".into());
    }
    let format_guard = FormatGuard(format);
    let mut format_copy = unsafe { *format };
    if format_copy.wFormatTag == 0xfffe && format_copy.cbSize >= 22 {
        let extended = unsafe {
            std::ptr::read_unaligned(
                format.cast::<windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE>(),
            )
        };
        format_copy.wFormatTag = extended.SubFormat.data1 as u16;
    }
    unsafe {
        client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                1_000_000,
                0,
                format,
                None,
            )
            .map_err(|e| e.to_string())?;
    }
    let capture: IAudioCaptureClient = unsafe { client.GetService() }.map_err(|e| e.to_string())?;
    unsafe { client.Start() }.map_err(|e| e.to_string())?;
    struct StartedClient<'a>(&'a IAudioClient);
    impl Drop for StartedClient<'_> {
        fn drop(&mut self) {
            let _ = unsafe { self.0.Stop() };
        }
    }
    let _started = StartedClient(&client);
    if let Ok(mut state) = state.lock() {
        state.resolved_device = Some(resolved_id.clone());
        state.using_default_fallback = fallback;
        state.capture_error = None;
    }
    let mut endpoint_check = Instant::now();
    loop {
        if stopping.load(Ordering::Acquire)
            || state
                .lock()
                .map(|s| !s.active || s.selected_device != selected)
                .unwrap_or(true)
        {
            break;
        }
        // Follow the system default and recover a reconnected explicitly selected device.
        if endpoint_check.elapsed() >= Duration::from_secs(1) {
            let (desired, _) = resolve_device(&enumerator, selected)?;
            if device_id(&desired)? != resolved_id {
                break;
            }
            endpoint_check = Instant::now();
        }
        let mut packet = unsafe { capture.GetNextPacketSize() }.map_err(|e| e.to_string())?;
        while packet > 0 {
            let mut data = std::ptr::null_mut();
            let mut frames = 0;
            let mut flags = 0;
            unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }
                .map_err(|e| e.to_string())?;
            let channels = format_copy.nChannels.max(1) as usize;
            let samples = if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                vec![0.0; frames as usize * 2]
            } else {
                decode_wasapi_samples(data, frames as usize, channels, &format_copy)
            };
            unsafe { capture.ReleaseBuffer(frames) }.map_err(|e| e.to_string())?;
            let (mut spectrum, left, right) = compute_fft_bands(&samples);
            // The historical WASAPI path uses a different meter response and
            // FFT gain from externally supplied PCM. Keep both wire contracts.
            let left = (left / 2.8 * 30.0).powf(0.65);
            let right = (right / 2.8 * 30.0).powf(0.65);
            let has_audio = left > 0.005 || right > 0.005;
            for band in &mut spectrum {
                *band = if has_audio && samples.len() > 64 {
                    *band * (4.5_f32 / 6.0).powf(0.75)
                } else {
                    0.0
                };
            }
            if let Ok(mut current) = state.lock() {
                current.spectrum = spectrum;
                current.vu_left = left;
                current.vu_right = right;
                current.has_audio = has_audio;
                current.last_update = Some(Instant::now());
                current.captured_at_ms = unix_ms();
                current.sequence = current.sequence.saturating_add(1);
                current.source = "wasapi";
            }
            packet = unsafe { capture.GetNextPacketSize() }.map_err(|e| e.to_string())?;
        }
        thread::sleep(Duration::from_millis(10));
    }
    drop(format_guard);
    Ok(())
}

#[cfg(windows)]
fn device_id(device: &windows::Win32::Media::Audio::IMMDevice) -> Result<String, String> {
    unsafe {
        let id = device.GetId().map_err(|e| e.to_string())?;
        let text = id.to_string().map_err(|e| e.to_string());
        windows::Win32::System::Com::CoTaskMemFree(Some(id.0 as _));
        text
    }
}

#[cfg(windows)]
fn resolve_device(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    selected: &str,
) -> Result<(windows::Win32::Media::Audio::IMMDevice, bool), String> {
    use windows::{
        core::HSTRING,
        Win32::Media::Audio::{eConsole, eRender, DEVICE_STATE_ACTIVE},
    };
    unsafe {
        if selected != "default" {
            if let Ok(device) = enumerator.GetDevice(&HSTRING::from(selected)) {
                if device.GetState().is_ok_and(|s| s == DEVICE_STATE_ACTIVE) {
                    return Ok((device, false));
                }
            }
        }
        enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map(|device| (device, selected != "default"))
            .map_err(|e| format!("WASAPI playback endpoint: {e}"))
    }
}

#[cfg(windows)]
struct FormatGuard(*mut windows::Win32::Media::Audio::WAVEFORMATEX);

#[cfg(windows)]
impl Drop for FormatGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::System::Com::CoTaskMemFree(Some(self.0 as _));
        }
    }
}

#[cfg(windows)]
fn decode_wasapi_samples(
    data: *mut u8,
    frames: usize,
    channels: usize,
    format: &windows::Win32::Media::Audio::WAVEFORMATEX,
) -> Vec<f32> {
    let count = frames.saturating_mul(2);
    let mut output = Vec::with_capacity(count);
    let bytes_per_sample = (format.wBitsPerSample / 8).max(1) as usize;
    let stride = format
        .nBlockAlign
        .max((channels as u16).saturating_mul(bytes_per_sample as u16)) as usize;
    unsafe {
        for frame in 0..frames {
            let row = data.add(frame * stride);
            // The Python capture contract uses L/R, duplicating mono. Other
            // surround channels must not be interleaved as extra stereo frames.
            for channel in 0..2 {
                let sample = row.add(channel.min(channels - 1) * bytes_per_sample);
                let value = match (format.wFormatTag, format.wBitsPerSample) {
                    (3, 32) => f32::from_ne_bytes([
                        *sample,
                        *sample.add(1),
                        *sample.add(2),
                        *sample.add(3),
                    ]),
                    (_, 16) => i16::from_ne_bytes([*sample, *sample.add(1)]) as f32 / 32768.0,
                    (_, 24) => {
                        let signed =
                            i32::from_le_bytes([0, *sample, *sample.add(1), *sample.add(2)]);
                        signed as f32 / 2_147_483_648.0
                    }
                    (_, 32) => {
                        i32::from_ne_bytes([
                            *sample,
                            *sample.add(1),
                            *sample.add(2),
                            *sample.add(3),
                        ]) as f32
                            / 2_147_483_648.0
                    }
                    _ => 0.0,
                };
                output.push(value.clamp(-1.0, 1.0));
            }
        }
    }
    output
}

#[cfg(not(windows))]
fn enumerate_platform() -> Result<Vec<AudioDevice>, &'static str> {
    Ok(default_audio_devices())
}

#[cfg(windows)]
fn enumerate_platform() -> Result<Vec<AudioDevice>, Box<dyn std::error::Error + Send + Sync>> {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::{
        eRender, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToString};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
        STGM_READ,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        let _com = ComGuard;
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let collection = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let default_device = enumerator
            .GetDefaultAudioEndpoint(eRender, windows::Win32::Media::Audio::eConsole)
            .ok()
            .and_then(|d| d.GetId().ok())
            .map(|id| {
                let s = id.to_string().unwrap_or_default();
                CoTaskMemFree(Some(id.0 as _));
                s
            });
        let mut devices = default_audio_devices();
        for index in 0..collection.GetCount()? {
            let device = collection.Item(index)?;
            let id_pwstr = device.GetId()?;
            let id = id_pwstr.to_string()?;
            CoTaskMemFree(Some(id_pwstr.0 as _));
            let is_default = default_device.as_deref() == Some(id.as_str());
            let name = device
                .OpenPropertyStore(STGM_READ)
                .ok()
                .and_then(|store: IPropertyStore| store.GetValue(&PKEY_Device_FriendlyName).ok())
                .and_then(|mut value| {
                    let mut buf = [0u16; 256];
                    let out = PropVariantToString(&value, &mut buf).ok().and_then(|_| {
                        String::from_utf16(
                            &buf[..buf.iter().position(|c| *c == 0).unwrap_or(buf.len())],
                        )
                        .ok()
                    });
                    let _ = PropVariantClear(&mut value);
                    out
                })
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| id.clone());
            devices.push(AudioDevice {
                id,
                name: if is_default {
                    format!("{name} [Default]")
                } else {
                    name
                },
                is_default,
            });
        }
        Ok(devices)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expired_audio_cannot_return_a_frozen_nonzero_spectrum() {
        let service = AudioService::new();
        service.update_pcm(&vec![0.5; 1024]);
        assert!(service.spectrum()["has_audio"].as_bool().unwrap());
        service.state.lock().unwrap().last_update =
            Some(Instant::now() - SILENT_AFTER - Duration::from_secs(1));
        let snapshot = service.spectrum();
        assert_eq!(snapshot["state"], "unavailable");
        assert_eq!(snapshot["has_audio"], false);
        assert!(snapshot["spectrum"]
            .as_array()
            .unwrap()
            .iter()
            .all(|n| n.as_f64() == Some(0.0)));
    }
}
