# HorizonTuner Companion APP

`companion/` contains the Android Companion shell. The current implementation is a native Jetpack Compose connection screen with an Android `WebView`. After connecting, the WebView loads the shared React page at `/companion/index.html`; the page reuses the desktop telemetry cards and tuning workflow. The Rust sidecar embeds the built `frontend/dist/companion` page and its shared assets. HUD display on Android is deferred for a later iteration.

The Android client is a thin client. `PC TuneSessionProvider` remains the only owner of tuning calculations and engine measurement. The client sends validated profile, workflow, and measurement commands and renders the acknowledged state. A `profileKey` prevents stale profile results from being applied. The host lease and client heartbeat protect ownership and liveness.

## Current connection contract

The supported development path is a PC HorizonTuner Full app listening on its actual HTTP port. The current host is loopback-only. Install the Companion APK, enable USB debugging on the tablet, and accept Android's authorization prompt. In the PC app's Companion settings, refresh the device list, select the tablet if more than one device is present, and press **Connect USB device**. The PC app uses its bundled ADB runtime to set up the reverse port mapping and launch the Android app. The Android app loads `127.0.0.1:8001` automatically after this action. Keep the Full PC app running while using Companion.

LAN access, QR scanning, mDNS discovery, Bluetooth Classic RFCOMM, and a native offline HUD cache are planned contracts. They are not connected end to end yet and must not be described as available transports.

## Modules

- `:protocol-core` is a pure Kotlin/JVM module for transport abstractions, framing, telemetry decoding, connection liveness, and protocol tests. It does not own tuning formulas.
- `:theme` maps the shared visual tokens to Compose.
- `:app` provides the Android 13+ Compose shell, WebView, connection validation, and the `connectedDevice` foreground service.
- `frontend/companion` and `frontend/src/features/companion` provide the shared Companion page, five telemetry cards, and four-step remote workflow.

The current workflow is four steps: **Goal & Setup**, **Chassis & Tires**, **Engine data & gearing**, and **Setup verification**.

## Toolchain and validation

Use `JAVA_HOME` and `ANDROID_HOME` (or the Android Studio equivalents) rather than hard-coding machine-specific SDK paths. The project targets Android `minSdk 33` and `targetSdk 36`, uses the checked-in Gradle Wrapper (8.13), AGP 8.13.2, and Kotlin 2.2.21.

From this directory, the Android gate is:

```text
./gradlew :protocol-core:test :app:lintDebug :app:assembleDebug
```

Desktop development builds the frontend distribution before compiling the Rust sidecar so the current Companion page and assets are embedded. CI may pass a previously verified frontend distribution to the sidecar build; the sidecar must reject a missing `frontend/dist/companion/index.html` instead of embedding stale or incomplete assets.

The Android build and protocol tests are validation gates. They do not constitute physical-device, USB, LAN, QR, mDNS, RFCOMM, or end-to-end gameplay acceptance.

See [the implementation boundary](../docs/architecture/companion-implementation-boundary.md) for current behavior and pending work. The [architecture evaluation](../docs/architecture/companion-app-evaluation.md) preserves the original design study.
