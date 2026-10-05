# Rust native services handoff

Task: Rust native services migration
Status: done
Owner: `/root/native_services`
Branch: `codex/rust-backend`
Scope: `backend-rust/src/native/**`, `backend-rust/tests/native_contract.rs`

The façade is `NativeServices`. It exposes JSON-compatible audio devices,
32-band spectrum, GSMTC media, thumbnail bytes, and Discord Rich Presence
status/submit/clear operations (plus `stop_audio_spectrum` for orderly
shutdown). Each potentially blocking native family owns a
single bounded worker and a cache. `Drop` sends a stop command and joins the
worker. Non-Windows keeps the Python contract's default device and unavailable
media/audio fallbacks. Windows uses MMDevice/WASAPI endpoint enumeration,
WinRT GSMTC, WinRT thumbnail streams, and Discord IPC named pipes. PCM samples
can be supplied by the capture layer with `update_audio_pcm` while the capture
worker remains outside the HTTP/WS boundary.

Required manifest entries for the Windows implementation:

- `windows = "0.62.2"` features `Win32_Media_Audio`,
  `Win32_Devices_FunctionDiscovery`, `Win32_System_Com`,
  `Win32_System_Com_StructuredStorage`, `Win32_System_Variant`,
  `Win32_UI_Shell_PropertiesSystem`, `Media_Control`, `Storage_Streams`.
- `rustfft = "6.4.1"` for the bounded 32-band FFT.
- `sha2 = "0.11.0"` for the same 16-character SHA-256
  thumbnail version used by the Python HTTP endpoint.

`thumbnail()` returns `(hash, bytes)` for the requested façade contract;
`thumbnail_metadata()` additionally returns `(content_type, bytes, hash)` so
the HTTP adapter can preserve `Content-Type`, ETag, and versioned `v=` URLs.

Validation: contract tests cover fallback JSON shape, device selection,
bounded spectrum updates, and façade construction without hardware. Real
WASAPI/GSMTC/Discord hardware acceptance remains pending and must be reported
separately from local contract tests.

Next action: root should `pub mod native;`, add the manifest features above,
run `cargo fmt -- backend-rust/src/native backend-rust/tests/native_contract.rs`
and `cargo test -p fh6-backend --test native_contract` on the integrated crate.
