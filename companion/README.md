# HorizonTuner Companion APP

Android uses native Jetpack Compose connection, tuning, telemetry navigation and detail pages. It no longer loads the shared React Companion page or inherits desktop layouts. A restricted local WebView draws only the selected main HUD instrument from verified PC-downloaded assets. The native selector receives its catalog from the PC, including VFD, BMW, Ford and S650; Android contains no instrument list or artwork. Auxiliary telemetry overlays and gamepad cards are disabled. The browser Companion entrypoint remains available independently.

The Android client is a thin client. Rust owns tuning formulas; `PC TuneSessionProvider` orchestrates the tuning state and engine measurement. The client sends validated profile, workflow, measurement and save commands and renders the acknowledged state. The save command persists one vehicle document containing parameters and `tuningTarget` (goal/season), then acknowledges disk success. `CompanionHostBridge` and `TuneSessionProvider` stay mounted outside desktop workspaces; the PC Full app must remain open, but need not display Tuning. Vehicle selection/reload restores the saved target. A `profileKey` prevents stale profile results from being applied. The host lease and client heartbeat protect ownership and liveness.

## Current connection contract

For normal use, keep HorizonTuner Full open on the PC and put the PC and Android device on the same trusted local network. In the PC Companion settings, generate a five-minute pairing QR code. The Android Connection page scans it with the live camera, tries every advertised PC IPv4 address in turn, and pairs with the first reachable address. The QR contains the actual LAN port, a one-time code, host name, and expiration time; the PC independently checks the code and its five-minute lifetime. Manual address, port, and code entry remains available when scanning is unavailable. The Android app saves the paired endpoint and session for reconnecting.

The main PC HTTP API remains loopback-only. A separate Companion LAN listener exposes only the pairing, Companion page/assets, workflow, and telemetry WebSocket routes; authenticated routes require the paired session. The PC LAN listener normally uses port `8002`, with an available-port fallback. The QR always contains the actual port.

USB debugging remains available. Install the Companion APK, enable USB debugging on the tablet, and accept Android's authorization prompt. In the PC app's Companion settings, refresh the device list, select the tablet if more than one device is present, and press **Connect USB device**. The PC app uses its bundled ADB runtime to set up reverse port mapping and launch the Android app, which loads `127.0.0.1:8001`. The Connection page switches between LAN and USB modes. Keep the Full PC app running while using Companion.

mDNS discovery and Bluetooth Classic RFCOMM remain planned contracts. Instrument assets use an implemented endpoint-scoped cache; this does not provide telemetry without a PC connection. QR pairing accepts only live camera scans in the app; no image-file import is provided.

## Modules

- `:protocol-core` is a pure Kotlin/JVM module for transport abstractions, framing, telemetry decoding, connection liveness, and protocol tests. It maintains bi-directional synchronization with the upstream PadLink protocol (`ITransport`, 5-state `ConnectionStateMachine`, `HeartbeatWatchdog`, and pairing manager). It does not own tuning formulas.
- `:theme` provides validated visual settings and centralized Compose tokens for all seven cores; the backend workflow GET supplies receive-only synchronization. See [the theme contract](theme/README.md).
- `:app` provides Android 13+ native pages, authenticated HTTP workflow requests, telemetry WebSocket consumption, a local instrument renderer, connection validation and the `connectedDevice` foreground service.
- `frontend/companion` and `frontend/src/features/companion` provide the shared Companion page, five telemetry cards, and four-step remote workflow.

The PC workflow remains four steps. Android provides an independent native editor, explicit **Save vehicle and target**, engine measurement controls and grouped tuning results. Drafts survive tab changes; a changed vehicle/profile requires explicit reload before saving. Telemetry overview uses sensor landscape and a single-card pager with previous/next buttons; its detail view, Tuning and Connection support portrait and landscape. Stale telemetry is concealed after two seconds. Android 16 large screens opt into the compatibility orientation restriction; physical-device acceptance remains required.

## Theme integration follow-up

The native shell receives the bounded backend visual projection directly through the workflow poll. The local HUD renderer retains each instrument’s own artwork. The first theme slice adds endpoint-scoped native cache/bootstrap, generation checks, centralized native tokens and shared section navigation. Native typography/material fidelity and device acceptance still require verification. See [the theme contract](theme/README.md). [Issue #485](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485) tracks this work alongside Companion feature completion, including Swiss Technical, Editorial and Contrast. Follow the [shared design-system guide](../docs/frontend/design-systems.md); desktop browser checks do not establish Android acceptance.

## Toolchain and validation

Use `JAVA_HOME` and `ANDROID_HOME` (or the Android Studio equivalents) rather than hard-coding machine-specific SDK paths. The project targets Android `minSdk 33` and `targetSdk 36`, uses the checked-in Gradle Wrapper (8.13), AGP 8.13.2, and Kotlin 2.2.21.

From this directory, the Android gate is:

```text
./gradlew :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Desktop development builds the frontend distribution before compiling the Rust sidecar so the current Companion page and assets are embedded. CI may pass a previously verified frontend distribution to the sidecar build; the sidecar must reject a missing `frontend/dist/companion/index.html` instead of embedding stale or incomplete assets.

The Android build and protocol tests are validation gates. They do not constitute physical-device, USB, LAN, QR, mDNS, RFCOMM, or end-to-end gameplay acceptance.

Release APK delivery uses the [explicit signing, version, and provenance contract](../docs/guides/companion-apk-delivery.md). Run `scripts/build_companion_apk.py --mode production` from the repository root with maintainer-provided settings. Missing signing configuration fails closed; release builds no longer fall back to debug signing. Debug/local CI validation is unchanged. CI contract APKs use a separate `.contracttest` package and `-test-only` version and are **TEST-ONLY**, not production releases. Android/WebView/TalkBack device acceptance remains **NOT_RUN**.

See [the implementation boundary](../docs/architecture/companion-implementation-boundary.md) for current behavior and pending work. The [architecture evaluation](../docs/architecture/companion-app-evaluation.md) preserves the original design study.

## PC-owned instrument delivery

The PC owns the public main-instrument catalog in `hud_overlay/shared/companion-instruments.json`, also consumed by the desktop selector. Its build embeds the catalog, rendering wrapper and assets. Android obtains `/companion/hud/catalog.json`, then `/companion/hud/manifests/{style}.json` on first use or refresh. The versioned `companion-hud/v1` manifest describes each file's path, byte count and SHA-256. Downloads use `/companion/hud/assets/{sha256}/{path}` through the existing authenticated Companion prefix; the LAN API whitelist is unchanged. Non-HUD hosts return an empty catalog.

Android verifies the manifest revision and every asset before committing a complete cache directory. Content-addressed objects avoid downloading unchanged shared files across styles and updates. Cache directories are scoped by PC origin; failed, corrupt or interrupted downloads retain the last complete revision. Old per-style revisions are pruned while retaining the current and previous complete versions. The renderer serves only files listed in the verified manifest and cannot make network requests. The native **Update / Retry** control refreshes the PC catalog and retries acquisition. The APK does not contain HUD artwork or a duplicated catalog.
