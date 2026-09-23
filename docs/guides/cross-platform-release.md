# 跨平台 Release 與 OTA

本次擴充從 `main` 的 Rust backend 架構出發。macOS／Linux 是完整調校及分析工作台，遊戲在 LAN 其他裝置執行；不依賴 Windows HUD，也不另推出 Lite。

## 平台與產物

| 平台 | 建置環境 | 使用者下載 | OTA payload／manifest |
| --- | --- | --- | --- |
| Windows x86_64 Full／Lite | windows-latest | 既有 Installer.exe、Portable.exe 與 ZIP | 各自 Installer.exe + `.sig`；`latest.json`、`latest-lite.json`，key `windows-x86_64` |
| macOS 14+ ARM64 Full | macos-14 ARM64 | `FH6-HorizonTuner-Full-macOS-arm64.dmg` | `FH6-HorizonTuner-Full-macOS-arm64.app.tar.gz` + `.sig`；`latest-macos.json`，key `darwin-aarch64` |
| Linux x86_64 Full | ubuntu-22.04 | `FH6-HorizonTuner-Full-Linux-x86_64.AppImage` | 同一 AppImage + `.sig`；`latest-linux.json`，key `linux-x86_64` |

macOS 目前採 ad-hoc code signing，未做 Developer ID 或 notarization，屬實驗性版本。安裝後從可寫的 Applications 位置啟動，不能在唯讀 DMG 內進行 OTA。Gatekeeper 可能要求依系統「隱私權與安全性」流程明確允許開啟。Linux AppImage 請放在使用者可寫位置、授予執行權限；可能需要 FUSE 或 AppImage extraction 模式，以及相容的 WebKitGTK／GTK／圖形環境。Ubuntu 22.04 是建置的 glibc 基線，並不代表所有 Linux 發行版均已驗證。第一階段不提供 Intel Mac、Linux ARM、DEB 或 RPM。

## 功能與資料路徑

- Windows 保留 HUD、Full／Lite 與既有 portable 路徑。
- macOS／Linux 的 backend 以 `--no-default-features` 編譯，省略 `hud` Cargo feature、`rustfft`、HUD 資源及音訊／媒體 worker；Windows API 套件是 Windows 專屬依賴。
- 前端 `FH6_PLATFORM=lan` 使用獨立 HUD 入口，不輸出 Lite 頁面。建置階段檢查模組圖，拒絕包含 `hud_overlay`／`overlay_control` 的 LAN bundle。
- `/api/health` 提供不依賴 HUD 的 readiness；`/api/runtime` 回報編譯 capabilities 與實際 UDP bind 地址。HUD API／WS 回覆 unsupported，HUD 資源回覆 404。舊 HUD 導航選項會回到 Live。
- 調校、Live、錄製、SQLite、分析、CSV／JSON／XML／ZIP 匯出及 localhost MCP 保留。macOS／Linux 使用原生另存新檔視窗；本機啟動 MoTeC 是 Windows 專屬能力，不影響檔案匯出。
- 原生 sidecar 隨 `.app`／AppImage 放在 `sidecar/server-sidecar` 資源目錄。macOS／Linux 使用 Tauri `app_data_dir`（identifier `com.eddie772tw.frontend`）；不寫入唯讀 app bundle／AppImage mount。明確的 `--data-dir` 仍可覆寫。
- Discord 保留，可從 XDG_RUNTIME_DIR／TMPDIR／TMP／TEMP／`/tmp` 尋找 Unix IPC；對服務無回應有 timeout，不把未連線視為已連接。

## 遊戲端設定

1. Tuner 與遊戲裝置接上相同 LAN，開啟 Tuner 的 Data Out 引導。
2. 遊戲啟用 Data Out，目的 IP 選擇引導列出的接收電腦地址，UDP port 使用畫面回報值。多網卡時挑選與遊戲裝置同網段的地址。
3. 允許接收電腦防火牆上的該 UDP port，短暫駕駛並檢查有效封包數。跨機不能填 `127.0.0.1`，HTTP port 也不是遊戲目的 port。
4. 換網路後重啟 Tuner 更新 bind 地址。沒有可用 LAN 地址時 UI 會說明 unavailable，不猜測地址。

`TELEMETRY_PORT` 環境變數優先於設定檔，並在儲存其他設定後保持。HTTP 使用 localhost 動態 port，前端由 Tauri readiness 取得；不開放 LAN HTTP／MCP 存取。

## 發布與補發

1. 維護者建立並發布 GitHub Release，或手動執行 Release Action 並明確指定**已發布的 tag**。Action 解析 annotated／lightweight tag 為 commit SHA；所有平台 checkout 同一 SHA。不存在的 tag／Release 不會退回 `main` 建置。
2. metadata job 先將此前最高成功 runtime version 的各平台 manifest 複製到新 Release；版本、舊 URL 與簽章保持原樣。不存在成功歷史的 channel 不會建立。carry-forward 失敗會顯示 summary，需修正後重跑；不阻止 Windows 建置。
3. 各平台獨立建置、簽署與驗證。Windows 不依賴 macOS／Linux 成功。建置 job 僅有 contents read；獨立 publisher 才有 contents write。macOS ad-hoc 簽署與 OTA minisign 是兩種不同簽署，OTA 仍使用相同正式金鑰並核對設定中的公鑰身份。
4. publisher 檢查平台、tag、payload、`.sig`，上傳缺少的二進位與簽章，核對 GitHub SHA-256／下載 bytes 後才更新 manifest。已存在且 bytes 相同的資產可重用；不同 bytes 的同名資產一律拒絕覆寫，必須提升 runtime version 並建立新 Release。manifest 不允許版本倒退。
5. 只重跑失敗的 publisher 時沿用該建置產物；重建的簽署 bytes 可能不同，不能假定可覆寫同一 Release。失敗平台之後首次成功即可替換其保留的舊 manifest，不修改其他平台 channel。

Runtime version 以 `frontend/src-tauri/tauri.conf.json` 為 SSOT，版本驗證器核對 package／Cargo，Release tag 僅是 URL 及標記。不同 tag 並不自動提升 OTA version。應用程式先完成下載及簽章驗證，再停止 sidecar、安裝、重新啟動；安裝失敗時嘗試恢復 backend。

GitHub 沒有原子替換 asset API，因此 manifest 的刪除／上傳間有短暫空窗；失敗後以相同已簽署產物重跑 publisher 可恢復。發布當下到 metadata job 完成也存在新 Release 尚未附上 manifest 的空窗，client 必須能重試。並行重跑同 tag 由 workflow concurrency 序列化。

## 驗證與證據

`Release Packaging Test` 在 PR 路徑命中或手動啟動時，呼叫同一個 native reusable workflow，使用臨時 OTA key，不取得正式 key、不上傳 Release。產物與 smoke evidence 保存為 Actions artifacts。正式 Release 才要求 production key；臨時 key 在 job 結束清除。

### Linux x86_64 本機建置與驗證

Native workflow 使用 Ubuntu 22.04。建議在 x86_64 Ubuntu 22.04 環境重現；較新的 Linux 主機可用 `ubuntu:22.04` 容器執行建置。容器內要提供 Node 22、pnpm 11.27.0、Rust stable、`uv`，以及下列系統套件：

```sh
sudo apt-get update
sudo apt-get install -y build-essential libwebkit2gtk-4.1-dev libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2
```

以下命令與 native packaging job 同路徑；測試簽章只使用臨時 key，不要替換成正式 OTA key。`UV_PYTHON_PREFERENCE=only-managed` 不能與 `uv venv --managed-python` 同時使用，因此建立環境時只對該命令移除此變數：

```sh
set -euo pipefail
export FH6_PLATFORM=lan PLATFORM=linux APPIMAGE_EXTRACT_AND_RUN=1
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
export RUNNER_TEMP="$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/fh6-native-linux.XXXXXX")"
mkdir -p "$RUNNER_TEMP"
export GITHUB_ENV="$RUNNER_TEMP/github.env"
: > "$GITHUB_ENV"

uv python install 3.13
if [ ! -x .venv/bin/python ]; then
  env -u UV_PYTHON_PREFERENCE uv venv --python 3.13 --managed-python .venv
fi
uv pip install --python .venv/bin/python pytest
pnpm --prefix frontend install --frozen-lockfile

uv run --no-project --python .venv/bin/python python scripts/validate_version_consistency.py
cargo fmt --manifest-path backend-rust/Cargo.toml -- --check
cargo test --locked --manifest-path backend-rust/Cargo.toml --no-default-features
pnpm --prefix frontend run test
uv run --no-project --python .venv/bin/python python -m pytest \
  scripts/tests/test_platform_release.py \
  scripts/tests/test_publish_release_assets.py \
  scripts/tests/test_prepare_native_signing.py
pnpm --prefix frontend run build
uv run --no-project --python .venv/bin/python python scripts/build_native_backend.py --platform linux

cleanup_native_signing() {
  uv run --no-project --python .venv/bin/python python scripts/prepare_native_signing.py --cleanup || true
}
trap cleanup_native_signing EXIT
uv run --no-project --python .venv/bin/python python scripts/prepare_native_signing.py
set -a
. "$GITHUB_ENV"
set +a
cargo test --locked --manifest-path frontend/src-tauri/Cargo.toml --lib
pnpm --prefix frontend exec tauri build --config "$RUNNER_TEMP/fh6-native-build.json"
uv run --no-project --python .venv/bin/python python scripts/smoke_native_release.py \
  --platform linux \
  --bundle-root frontend/src-tauri/target/release/bundle \
  --evidence-dir "$RUNNER_TEMP/smoke-evidence"
```

這個 smoke 驗證打包後的 sidecar、UDP 遙測、HTTP port fallback 與正常關閉；它不代替在實際桌面環境確認 GUI 互動。測試 key 與臨時 Tauri config 會在 shell 結束時清除。

```powershell
cargo test --locked --manifest-path backend-rust/Cargo.toml
cargo test --locked --manifest-path backend-rust/Cargo.toml --no-default-features
cargo test --locked --manifest-path frontend/src-tauri/Cargo.toml --lib
cmd /c "pnpm -C frontend run test"
uv run --no-project --python .venv/Scripts/python.exe python -m pytest scripts/tests/test_platform_release.py scripts/tests/test_publish_release_assets.py tests/test_release_workflow_contract.py tests/test_tauri_updater_keypair.py
$env:FH6_PLATFORM = 'lan'
pnpm -C frontend run build
Remove-Item Env:FH6_PLATFORM
```

Native CI 從實際 `.app`／AppImage 取得 sidecar，檢查架構、HUD embedded count、HTTP port 衝突 fallback、UDP 合成封包、stdin EOF 關閉與 UDP port 釋放；macOS 另執行 codesign verification。這些證據不等於 GUI 開窗、原生另存視窗互動、完整 OTA 安裝或真實遊戲跨機驗收。發布候選仍需在 macOS／Linux 目標機器驗證前述互動，並測試由另一台 Windows／遊戲主機傳送 Data Out。不要把 Windows 上的 no-HUD 測試標示為原生平台驗收。

參考：[Tauri updater 格式與簽章](https://v2.tauri.app/plugin/updater/)、[macOS 簽署](https://v2.tauri.app/distribute/sign/macos/)、[Linux AppImage](https://v2.tauri.app/distribute/appimage/)。
