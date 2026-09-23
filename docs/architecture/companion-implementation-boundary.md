# HorizonTuner Companion APP architecture and acceptance boundary

This document records the current implementation boundary. It separates what is present in the checkout from transport and device capabilities that remain planned.

## Implemented shape

The Android application is a native Jetpack Compose connection shell with an embedded Android `WebView`. The WebView loads the shared React entrypoint `/companion/index.html`, which is emitted by the frontend build. The page uses the existing frontend telemetry cards and tuning workflow. Android HUD display is deferred for a later iteration; the desktop HUD remains independent.

The Rust sidecar embeds `frontend/dist/companion` and shared `frontend/dist/assets` at build time. `PC TuneSessionProvider` is the sole owner of tuning calculations and engine measurement. The Companion boundary carries:

- profile, workflow, and measurement commands;
- queued command acknowledgements and current workflow state;
- `profileKey` checks that reject stale profile results;
- a host lease and client heartbeat for ownership and liveness.

The user-facing workflow has four steps:

1. Goal & Setup
2. Chassis & Tires
3. Engine data & gearing
4. Setup verification

The Android app targets `minSdk 33` and `targetSdk 36`. Its foreground service keeps the connected-device session alive while the user is viewing the Companion page. This is a lifecycle mechanism; it is not evidence of a tested 60 Hz physical-device session.

## Current connection modes

The PC's main HTTP API remains bound to loopback. A separate Companion LAN listener binds to port `8002` (or a free port if occupied) and exposes only the pairing endpoint, Companion page/assets, workflow read/command endpoints, and telemetry WebSocket. The PC Companion settings create a five-minute, one-time pairing code and QR. The versioned QR contains the token, actual port, host name, Unix expiry, and every currently detected non-loopback IPv4 interface address. The Android Connection page defaults to LAN mode and scans the QR with its live camera. It validates the schema and expiry, then tries the listed addresses in sequence until one pairs. Manual address, port, and code entry remains available. The Android app keeps its device ID and session in private storage and restores the session on reconnect. The LAN listener checks a session cookie on every page, API, and WebSocket request; removing a paired device revokes that session. Use this HTTP mode only on a trusted local network.

USB remains a debugging mode. The PC Companion settings list connected Android devices; the user selects one when multiple are present and presses **Connect USB device**. The PC sidecar uses its bundled ADB runtime to map Android `tcp:8001` to the actual PC loopback HTTP port and launches the Android app. The Android screen connects to `127.0.0.1:8001` automatically. The Connection page can switch between LAN and USB. Keep the PC Full app open while using Companion.

The Android screen remains free to rotate. Telemetry shows one focused card at a time; width-based responsive rules stack the Driver and Dynamics internals on narrow screens and make the four Tire/Suspension subcards scroll vertically. Tuning fields collapse to one column on narrow screens. Width is used because Android WebView may retain a stale CSS orientation media result after `configChanges` rotation.

mDNS discovery, Bluetooth Classic RFCOMM, and a native offline HUD cache are planned work. QR scanning is camera-only in the product; no image-file import is exposed. Existing protocol abstractions or documentation for other transports are reservations, not acceptance evidence.

## Build and test boundary

The Android validation command is:

```text
./gradlew :protocol-core:test :app:lintDebug :app:assembleDebug
```

Use generic `JAVA_HOME` and `ANDROID_HOME` environment variables; product documentation does not prescribe a machine-specific SDK path. The desktop frontend build emits the Companion page and shared assets before Rust sidecar compilation. A CI sidecar build may consume a verified frontend artifact, but must fail clearly when `frontend/dist/companion/index.html` or its shared assets are absent.

These checks cover Kotlin/JVM protocol tests, Android lint, and debug packaging. They do not prove USB permissions, ADB setup, physical-device rendering, LAN reachability, QR scanning, mDNS, RFCOMM, or gameplay telemetry acceptance. Those require a separately recorded device test with the PC Full app, actual HTTP port, connection path, and observed logs.

## Acceptance checklist

For a physical-device acceptance run, record:

1. The Android and PC build commands and their results.
2. The actual PC loopback and LAN listener ports, selected LAN address, and whether `adb reverse` is absent during the LAN run.
3. The Android Connection mode, successful pairing, authenticated page/API/WebSocket access, reconnect, and revocation behavior. For USB debugging, record the exact `adb reverse` mapping and Android endpoint (`127.0.0.1:8001`).
4. Host lease, heartbeat, command acknowledgement, and stale `profileKey` behavior.
5. The four workflow steps and telemetry cards as observed on a physical device. Android HUD display is outside this iteration's acceptance scope.

Do not mark LAN, QR, mDNS, RFCOMM, native cache, or full gameplay readiness from a build-only result.
