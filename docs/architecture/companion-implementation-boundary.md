# HorizonTuner Companion APP architecture and acceptance boundary

This document records the current implementation boundary. It separates what is present in the checkout from transport and device capabilities that remain planned.

## Implemented shape

Android uses native Jetpack Compose connection, tuning, telemetry navigation and detail pages. It no longer loads the shared React Companion page or inherits desktop layouts. A restricted local WebView draws only the selected main HUD instrument from verified PC-downloaded assets. The native selector receives its catalog from the PC, including VFD, BMW, Ford and S650; Android contains no instrument list or artwork. Auxiliary telemetry overlays and gamepad cards are disabled. The browser Companion entrypoint remains available independently.

The Rust sidecar embeds `frontend/dist/companion` and shared `frontend/dist/assets` at build time. `PC TuneSessionProvider` orchestrates tuning and engine measurement; Rust remains the sole calculation owner. The Companion boundary carries:

- profile, workflow, measurement and explicit persisted save commands;
- queued command acknowledgements and current workflow state;
- `profileKey` checks that reject stale profile results;
- a host lease and client heartbeat for ownership and liveness;
- a versioned visual projection from ConfigService outside the tuning snapshot, received by Web/native without settings POST. See [the theme contract](../../companion/theme/README.md) for cache, generation and validation boundaries.

The user-facing workflow has four steps:

1. Goal & Setup
2. Chassis & Tires
3. Engine data & gearing
4. Setup verification

The Android app targets `minSdk 33` and `targetSdk 36`. Its foreground service keeps the connected-device session alive while the user is viewing the Companion page. This is a lifecycle mechanism; it is not evidence of a tested 60 Hz physical-device session.

## Current connection modes

The PC's main HTTP API remains bound to loopback. A separate Companion LAN listener binds to port `8002` (or a free port if occupied) and exposes only the pairing endpoint, Companion page/assets, workflow read/command endpoints, and telemetry WebSocket. The PC Companion settings create a five-minute, one-time pairing code and QR. The versioned QR contains the token, actual port, host name, Unix expiry, and every currently detected non-loopback IPv4 interface address. The Android Connection page defaults to LAN mode and scans the QR with its live camera. It validates the schema and expiry, then tries the listed addresses in sequence until one pairs. Manual address, port, and code entry remains available. The Android app keeps its device ID and session in private storage and restores the session on reconnect. The LAN listener checks a session cookie on every page, API, and WebSocket request; removing a paired device revokes that session. Use this HTTP mode only on a trusted local network.

USB remains a debugging mode. The PC Companion settings list connected Android devices; the user selects one when multiple are present and presses **Connect USB device**. The PC sidecar uses its bundled ADB runtime to map Android `tcp:8001` to the actual PC loopback HTTP port and launches the Android app. The Android screen connects to `127.0.0.1:8001` automatically. The Connection page can switch between LAN and USB. Keep the PC Full app open while using Companion.

Telemetry overview requests sensor landscape and displays one native pager card at a time. Swipes and previous/next buttons change cards. The selected card’s detail view permits portrait or landscape; Back restores the landscape overview. Connection and Tuning permit either orientation. The local main-instrument renderer uses the existing HUD coordinator and asset definitions; it has no JavaScript bridge, file/content access, external navigation or network requests. Its catalog excludes auxiliary modules and WIP styles.

The native editor retains its original `profileKey` while editing, so host changes require an explicit reload. `save` writes a single vehicle document with `tuningTarget` before returning an applied acknowledgement. Failed writes are rejected. The host does not replace a newer desktop draft after the save finishes. The persistent target is restored when loading a vehicle; these operations run independently of the selected PC workspace.

mDNS discovery and Bluetooth Classic RFCOMM remain planned work. The instrument asset cache is implemented, while physical-device cache and reconnect acceptance remains pending. QR scanning is camera-only in the product; no image-file import is exposed. Existing protocol abstractions or documentation for other transports are reservations, not acceptance evidence.

## Build and test boundary

The Android validation command is:

```text
./gradlew :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Use generic `JAVA_HOME` and `ANDROID_HOME` environment variables; product documentation does not prescribe a machine-specific SDK path. The desktop frontend build emits the Companion page and shared assets before Rust sidecar compilation. A CI sidecar build may consume a verified frontend artifact, but must fail clearly when `frontend/dist/companion/index.html` or its shared assets are absent.

These checks cover protocol, visual contract/cache unit tests, Android lint, and debug packaging. They do not prove USB permissions, ADB setup, physical-device rendering, LAN reachability, QR scanning, mDNS, RFCOMM, or gameplay telemetry acceptance. Those require a separately recorded device test with the PC Full app, actual HTTP port, connection path, and observed logs.

## Acceptance checklist

For a physical-device acceptance run, record:

1. The Android and PC build commands and their results.
2. The actual PC loopback and LAN listener ports, selected LAN address, and whether `adb reverse` is absent during the LAN run.
3. The Android Connection mode, successful pairing, authenticated page/API/WebSocket access, reconnect, and revocation behavior. For USB debugging, record the exact `adb reverse` mapping and Android endpoint (`127.0.0.1:8001`).
4. Host lease, heartbeat, command acknowledgement, and stale `profileKey` behavior.
5. The four workflow steps and telemetry cards as observed on a physical device. Android HUD display is outside this iteration's acceptance scope.

Do not mark LAN, QR, mDNS, RFCOMM, native cache, or full gameplay readiness from a build-only result.

## Upstream PadLink protocol alignment

The core protocol, transport abstractions, and connection lifecycle implementations in this repository maintain bi-directional alignment with the upstream `PadLink` project (`D:\padlink`).

- **Unified transport abstraction (`ITransport`)**: Standardized across Bluetooth Classic RFCOMM, USB ADB reverse forwarding, and local network Wi-Fi/WebSocket.
- **Connection state machine & watchdog**: Implements the canonical 5-state lifecycle (`DISCONNECTED`, `CONNECTING`, `PAIRED`, `STREAMING`, `RECONNECTING`) with exponential backoff and dual-direction heartbeat monitoring.
- **QR pairing & session contract**: Standardized 5-minute single-use token payload, multi-interface IPv4 probe, and revocable session cookie/token management.
- **Asset caching**: Dynamic SHA-256 asset manifest contract supporting client-side cache-first verification.

Upstream PadLink has incorporated these refinements from HorizonTuner, ensuring that protocol contracts and test suites remain compatible and standardized across both projects.

## PC-owned instrument delivery

The PC owns the public main-instrument catalog in `hud_overlay/shared/companion-instruments.json`, also consumed by the desktop selector. Its build embeds the catalog, rendering wrapper and assets. Android obtains `/companion/hud/catalog.json`, then `/companion/hud/manifests/{style}.json` on first use or refresh. The versioned `companion-hud/v1` manifest describes each file's path, byte count and SHA-256. Downloads use `/companion/hud/assets/{sha256}/{path}` through the existing authenticated Companion prefix; the LAN API whitelist is unchanged. Non-HUD hosts return an empty catalog.

Android verifies the manifest revision and every asset before committing a complete cache directory. Content-addressed objects avoid downloading unchanged shared files across styles and updates. Cache directories are scoped by PC origin; failed, corrupt or interrupted downloads retain the last complete revision. Old per-style revisions are pruned while retaining the current and previous complete versions. The renderer serves only files listed in the verified manifest and cannot make network requests. The native **Update / Retry** control refreshes the PC catalog and retries acquisition. The APK does not contain HUD artwork or a duplicated catalog.
