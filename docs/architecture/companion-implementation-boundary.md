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

## Current connection mode

The host currently binds to loopback. The usable development path is USB ADB reverse forwarding. The PC Companion settings list connected Android devices; the user selects one when multiple are present and presses **Connect USB device**. The PC sidecar uses its bundled ADB runtime to map Android `tcp:8001` to the actual PC HTTP port and launches the Android app. The Android screen connects to `127.0.0.1:8001` automatically. Keep the PC Full app open while using Companion.

The Android screen remains free to rotate. Telemetry shows one focused card at a time; width-based responsive rules stack the Driver and Dynamics internals on narrow screens and make the four Tire/Suspension subcards scroll vertically. Tuning fields collapse to one column on narrow screens. Width is used because Android WebView may retain a stale CSS orientation media result after `configChanges` rotation.

LAN and QR pairing are not connected end to end. mDNS discovery, Bluetooth Classic RFCOMM, QR scanning, and a native offline HUD cache are planned work. Existing protocol abstractions or documentation for those transports are reservations, not acceptance evidence.

## Build and test boundary

The Android validation command is:

```text
./gradlew :protocol-core:test :app:lintDebug :app:assembleDebug
```

Use generic `JAVA_HOME` and `ANDROID_HOME` environment variables; product documentation does not prescribe a machine-specific SDK path. The desktop frontend build emits the Companion page and shared assets before Rust sidecar compilation. A CI sidecar build may consume a verified frontend artifact, but must fail clearly when `frontend/dist/companion/index.html` or its shared assets are absent.

These checks cover Kotlin/JVM protocol tests, Android lint, and debug packaging. They do not prove USB permissions, ADB setup, physical-device rendering, LAN reachability, QR scanning, mDNS, RFCOMM, or gameplay telemetry acceptance. Those require a separately recorded device test with the PC Full app, actual HTTP port, connection path, and observed logs.

## Acceptance checklist

For the currently supported USB development mode, record:

1. The Android and PC build commands and their results.
2. The actual PC HTTP port and the exact `adb reverse` mapping.
3. The Android endpoint values (`127.0.0.1` and `8001`).
4. Host lease, heartbeat, command acknowledgement, and stale `profileKey` behavior.
5. The four workflow steps and telemetry cards as observed on a physical device. Android HUD display is outside this iteration's acceptance scope.

Do not mark LAN, QR, mDNS, RFCOMM, native cache, or full gameplay readiness from a build-only result.
