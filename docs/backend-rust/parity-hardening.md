# Rust 後端完整接替驗證紀錄

## 範圍與基準

- 工作分支：`codex/rust-backend-parity`，起點 `ec7d769`（V1.6.1 後的 main）。
- 目標：補齊 Rust 後端、MCP 與 Agent CLI 的功能契約，確認可接替後移除 Python 後端。
- 使用者指定：不啟動前端，以 API、WebSocket、後端程序與測試驗證。
- 採用技能：`ponytail`、`modular-refactoring`、`portable-release-validation`、`physics-tuning-math`、`agent-governance-audit`。
- MCP 在基準已具 Rust 實作；此次核對 26 個 tools 與 resources，補上車名／Preset／輸入驗證差異，再移除 Python 參考。新增 Rust Agent CLI，保留離線與線上入口。

## 執行順序

1. 建立原始測試基準與 API／MCP／CLI 清單，對照既有 Python 行為及消費端型別。
2. 優先重現與修復 Windows WASAPI／GSMTC、VFD 音訊與媒體資料通路；補上錯誤可觀測性與故障恢復測試。
3. 補足其他端點、持久化、遙測、診斷與分支功能的差異；有效回應包含明確的 unavailable／unsupported 及驗證錯誤，不以 HTTP 200 取代功能驗證。
4. 將仍依賴 Python 後端的 Agent CLI／工具入口接至 Rust，保存必要資料與黃金契約後，移除 Python 後端與過時包裝。
5. 執行有 HUD／無 HUD 後端測試、API 程序測試、相關工具與建置檢查；記錄端點覆盖與實機限制。

## 已重現與修正

| 通路 | 基準問題與證據 | 修改 |
| --- | --- | --- |
| WASAPI | 將已選裝置設為不存在的 ID，基準持續 unavailable／sequence 0；Python 原本會退回預設裝置 | 回退系統預設；每秒檢查裝置恢復／預設變更；控制命令採共享 desired state 與有界喚醒，避免快速切換遺失命令 |
| 音訊狀態 | 原生錯誤遭忽略，失效快取可能保留舊頻譜 | 提供 resolved device／fallback／error 診斷；過期頻譜歸零；停止擷取使用 RAII |
| GSMTC | 同步 snapshot 最多阻塞 overlay worker 1.5 秒；查詢／列舉錯誤可能被視為沒有工作階段 | snapshot 立即回快取；single flight、timeout、退避及 3 秒 stale grace；使用 RoInitialize／RoUninitialize；封面錯誤不隱藏有效 metadata |
| HUD WebSocket | 新連線只有 config，去重後的 steady audio／media 可能等不到初始狀態 | 依序發送 config、cached audio、media；後續事件維持原契約 |
| Road／analysis HTTP | 查無 Road 文件時 409 vs Python 422；刪除不存在 session 的冪等語義不同 | GET 錯誤回 422；analysis DELETE 保留冪等成功；寫入衝突仍為 409 |
| MCP 車庫與 Preset | 真實車庫使用 display_name；API 保存 car-name.json，但 MCP 以單一 stem 尋找；legacy fallback 可跨車輛；遞迴掃描跟隨 junction | 支援實際車名欄位、camelCase metadata 與 filename identity；只讀同車 Preset，通過 safe_path；跳過 symlink／junction，並以真實 Windows junction 測試隔離 |
| MCP 錯誤輸入 | arguments 型別錯誤被忽略；輪胎 null／字串變成 0；無上限齒數可造成大量配置 | 無效 params／arguments／四輪數值回錯誤；快速齒比求解限制 1–10 齒及有效有限值 |
| Agent CLI | Python runtime；status 讀取過時欄位；diagnose 無資料時使用 85°C | Rust 執行檔；使用實際 runtime UDP port／live snapshot；缺少測量資料明確失敗；Preset 原子寫入與包含性檢查 |

原生 WinRT 初始化依 [Microsoft RoInitialize 文件](https://learn.microsoft.com/en-us/windows/win32/api/roapi/nf-roapi-roinitialize)。CLI HTTP 使用 ureq 3.4.2（MIT／Apache-2.0），已執行 crates.io `cargo search`／`cargo info` 查證；避免自行實作 HTTP／TLS／chunked parser，且保留 HTTPS override。此相依只用於 CLI，UDP 接收循環不呼叫它。

## Python 移除與契約保存

`backend/` 的 Python HTTP、MCP、原生 providers、CLI、PyInstaller specs／wrapper、依賴它們的 Python 實作測試與 fixture generators 已移除。維護車庫的工具移至 `scripts/update_car_db.py`，相應測試移至 `scripts/tests/`。requirements 只保留選用維護／診斷工具。版本檢查改由 Rust／Tauri manifests 與 locks 驗證；Cargo 預設 binary 明確指定 sidecar，既有 `cargo run` 入口仍可用。

車庫與預設車輛 JSON 留在 `backend/` 供 build.rs 嵌入；開發及 release 資料目錄合約沿用，沒有刪除使用者的 settings、tunings、sessions、SQLite 或 logs。歷史參考與產生器可從 `ec7d769` 的獨立 checkout 取回，不需留一份可啟動的舊後端。

| 原 Python 功能 | 現行驗證入口 |
| --- | --- |
| 75 個 HTTP method/path | `tests/fixtures/http_inventory.json` + `process_contract::every_legacy_http_endpoint_has_a_typed_response`；逐一實際呼叫，檢查狀態、型別、必要鍵；合法錯誤與 native unavailable 分開驗證 |
| 設定／HUD／Preset／路徑隔離 | `config_contract.rs` 與 HTTP／WS／重啟／備份恢復測試 |
| 封包／binary／race／drag／dyno／SQLite | `telemetry_contract.rs`、`telemetry_canonical_contract.rs` 及凍結的 `tests/fixtures/telemetry/`；程序測試另送真實 loopback UDP |
| Road／引擎觀察／capture／comparison | `road_contract.rs` 的生命週期、append-only、單變量候選、比較、決策及恢復測試 |
| MoTeC | `motec_contract.rs` 的 CSV／debrief 黃金輸出、程序 multipart import |
| MCP | `mcp_contract.rs` 的全部 26 tools／resources 固定輸出，加上 HTTP initialize／notifications、REST→MCP persistence、live access settings 測試 |
| 原生音訊／媒體／Discord／diagnostics | `native_contract.rs`、provider 故障注入測試、Windows opt-in host test；Discord 只驗證契約與 IPC 模擬，未聲稱外部 client 驗收 |
| CLI | `agent_cli_contract.rs` 的 28 組 Python 數值／匯出 oracle、離線指令、安全邊界；`process_contract` 的動態埠、即時遙測與 REST→MCP 往返 |

CLI oracle 直接呼叫基準 `TuningMathSolver.calculate_chassis`／`calculate_gearing`／`export_applied_setup`／`export_preset_format`，輸入列在 `agent_cli_golden.json`；僅去除動態 createdAt。MCP 舊黃金資料只校正 7 個原先為 null 的車名位置（來自實際車庫 display_name），數值未重算。CLI 與 MCP 的 legacy solver 保留原有職責，正式調校核心與 TypeScript golden fixtures 未改寫。

## 驗證狀態

- 基準 Rust：56 項通過；移除前 Python：372 項通過、11 項宿主／發行測試排除。
- Rust 完整組態：65 項通過、1 項原生宿主測試預設 ignored。
- Rust `--no-default-features`：57 項通過；HUD endpoints 明確 501，HUD assets／workers 不啟用。
- Windows opt-in：真實 Spotify GSMTC metadata、216,118 bytes 封面、ETag 304／舊 hash 404、連續 WASAPI 頻譜與失效裝置恢復通過。第一次使用基準 binary 時也能讀到 Spotify，故不把原回報概括為「WinRT 全部漏移植」。
- release 原生驗證的首次重跑遇到 Spotify 已暫停；HTTP 仍可取得 paused metadata／封面，音訊沒有可供驗收的串流，因此該次「連續音訊」驗收失敗。宿主測試已改為顯示 playback 狀態及 native diagnostics，不以裸 WebSocket timeout 混淆故障原因；不放寬音訊斷言。
- 前端既有測試：141 files／996 tests 通過；TypeScript／Vite build 通過，未啟動前端。
- 維護／發行工具：83 項通過、8 項宿主／executable 測試排除；Ruff check／format 及版本契約通過。
- release binaries：Cargo `--release --bins -j 2` 建置成功；`server-sidecar.exe` 約 20.5 MiB、`fh6-agent.exe` 約 13.7 MiB。設定 `FH6_TEST_BACKEND_EXE`／`FH6_TEST_AGENT_EXE` 指向 release 產物後，完整 65 項 Rust 契約通過（含 75 HTTP 路徑與 CLI／MCP 往返）。
- 最後 MCP junction 修正後重建 release，MCP 4 項與程序 5 項再次通過；Spotify 暫停時不以不存在的音訊當作 release 頻譜驗收通過。
- 使用者授權控制 Spotify 後，以 Windows GSMTC `TryPlayAsync` 將已暫停的 Spotify 恢復播放，明確指定 release `server-sidecar.exe`／`fh6-agent.exe` 重跑 `windows_native_audio_media_and_removed_device_recovery`：1 passed、0 failed，測試耗時 1.48 秒。驗證連續至少 3 筆具有非零值的 32 頻帶 WASAPI 事件、WinRT 專輯資訊、124,176 bytes 封面、ETag 304／舊 hash 404，以及失效裝置回退預設輸出後恢復音訊且原生錯誤為 null。完成後以 `TryPauseAsync` 恢復原本暫停狀態，另一次 GSMTC 查詢確認 paused；未改變音量或主動切歌。臨時控制工具只用現有 Rust／Windows 相依，驗證後移除。

可重跑命令（PowerShell；測試不啟動前端）：

```powershell
cargo test --locked -j 2 --manifest-path backend-rust/Cargo.toml
cargo test --locked -j 2 --manifest-path backend-rust/Cargo.toml --no-default-features
cargo build --locked -j 2 --release --manifest-path backend-rust/Cargo.toml --bins
$env:FH6_TEST_BACKEND_EXE = (Resolve-Path backend-rust/target/release/server-sidecar.exe).Path
$env:FH6_TEST_AGENT_EXE = (Resolve-Path backend-rust/target/release/fh6-agent.exe).Path
cargo test --locked -j 2 --manifest-path backend-rust/Cargo.toml --test process_contract --test agent_cli_contract
# 需要播放器正在輸出音訊並提供 GSMTC 與專輯封面：
cargo test --locked -j 2 --manifest-path backend-rust/Cargo.toml --test process_contract windows_native -- --ignored --nocapture
Remove-Item Env:FH6_TEST_BACKEND_EXE, Env:FH6_TEST_AGENT_EXE
```

## 證據邊界

本次覆蓋後端 API、WS、檔案與程序契約，以及此 Windows 主機的 Spotify／預設音訊裝置。沒有啟動 GUI、實際遊戲、Discord client、Android 裝置或執行乾淨 Windows 安裝驗收；也未在 Linux 主機重跑原生程序。跨平台無 HUD 的本機組態已驗證，Linux runner 由 CI 接續。這些結果不能推論所有播放器／驅動、HUD 畫面或實車調校均已驗收。

初次全平行 Rust 連結遇到 Windows paging-file 不足（os 1455）；改用 `-j 2` 後完成，不更改系統設定。測試後端皆使用隔離暫存資料目錄與動態 HTTP／UDP 埠，stdin EOF 結束程序。
