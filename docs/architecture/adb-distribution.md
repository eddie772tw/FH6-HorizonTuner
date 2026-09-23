# Windows ADB distribution provenance

FH6-HorizonTuner uses only the Windows ADB runtime files needed for USB port forwarding:

- `adb.exe`
- `AdbWinApi.dll`
- `AdbWinUsbApi.dll`
- `NOTICE.txt`
- `source.properties`

The pinned source is Android SDK Platform-Tools `37.0.1` from the official Google download:

```text
https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip
```

The archive SHA-256 and each staged file SHA-256 are recorded in [`config/adb-windows.json`](../../config/adb-windows.json). `scripts/prepare_adb.ps1` downloads the archive only when the local cache is absent or invalid, verifies the archive before extraction, verifies every staged file, and rejects unexpected files in `.tools/adb/windows`. The cache is outside Git; the three binaries and notices are not repository artifacts.

The Windows sidecar build invokes this staging step before Cargo unless `FH6_REQUIRE_ADB=0` is explicitly set. A failed download, archive hash check, file hash check, or cache validation stops the build before Rust compilation. CI and release jobs therefore use the same fixed provenance through `scripts/build_backend.ps1`.

## License boundary

The Android SDK license terms state that SDK components distributed under an open-source license are governed solely by that component's open-source license (section 3.5), while the general SDK agreement has broader restrictions elsewhere. The AOSP ADB module identifies its Apache-licensed module and publishes a `NOTICE`; the Platform-Tools package NOTICE also contains notices for bundled third-party components. This repository preserves the complete official `NOTICE.txt` with the runtime files and does not relabel the whole package as Apache-2.0.

The implementation relies on the official package and its supplied notices. It does not redistribute the rest of the Android SDK, platform images, build-tools, fastboot, or USB drivers. License scope and the intended release channel should still be reviewed by the project maintainer for the concrete distribution context.

Official references:

- [Android SDK License Agreement](https://developer.android.com/studio/terms)
- [Android SDK Platform-Tools release notes and downloads](https://developer.android.com/tools/releases/platform-tools)
- [Android Debug Bridge documentation](https://developer.android.com/tools/adb)
- [AOSP ADB Windows build dependencies](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/Android.bp)
- [AOSP ADB NOTICE](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/NOTICE)
