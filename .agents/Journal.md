# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

本文件用於記錄每一次 Agent 在 FH6-HorizonTuner 開發過程中的**關鍵學習點（Critical Learnings）**。

## 記錄準則
只有在遇到以下情況時才新增日誌紀錄：
1. 發現 Forza UDP 遙測數據的包結構或位元偏移 (Byte Offset) 陷阱。
2. 嘗試了某種懸吊/齒輪調校演算法優化，但結果不如預期（如出現物理奇異點）。
3. 發現 Tauri / WebSockets 高頻數據傳遞造成的 UI 影格率（FPS）下降問題。
4. 前後端跨語言數據對齊的 Anti-pattern。

---

## 2026-07-23 - 全面轉向 Pure Rust (Tauri v2) 原生後端架構

**學習點 (Learning):**
- **Python FastAPI + PyInstaller 包裹 Sidecar 架構痛點徹底解決**：舊架構使用 PyInstaller 包裹 Python 產生 FastAPI Sidecar 再讓 Tauri 調用，帶來了較高的安裝包體積、舊進程 Port 8000/8001 衝突、stdin EOF 重導向崩潰以及 CI 必須配置 Python 環境與 Approval 審核的龐大開銷。
- **Pure Rust UDP Socket 60Hz 零拷貝解析與 Async Runtime**：改用 Rust `tokio::net::UdpSocket` 搭配 `byteorder` 進行二進位結構解構 (232-byte V1 & 324-byte V2 Dash Data)，直接透由 Tauri v2 的 `AppHandle::emit("telemetry-data", &data)` 廣播至 Webview。在 Tauri `setup` 鉤子中派生非同步任務時，必須使用 `tauri::async_runtime::spawn` 替代標準 `tokio::spawn`，以正確掛載至 Tauri 管理的 Tokio Async Reactor，防止 `there is no reactor running` panic 錯誤。
- **Tauri WindowEvent::Destroyed 致命閃退避坑 (Webview Reload Crash Trap)**：在 Tauri 2 `on_window_event` 鉤子中，當 Vite 發生 dependency optimization、HMR 或頁面刷新時，Webview 內部會拋出 `WindowEvent::Destroyed`。若將其誤視為「視窗關閉」並觸發 `exit(0)`，會導致應用程式在啟動載入數秒後突然閃退崩潰！必須僅對 `WindowEvent::CloseRequested` 做出 `exit(0)` 回應。
- **Windows CMD 批次檔語法解析崩潰 (`這個時候不應有 to`)**：CMD 在多行 `if (...)` / `for (...)` 區塊內若含有 `echo` 訊息或 `::` 註解且帶有右括號 `)`（例如 `https://rustup.rs/)`），解譯器會將第一個 `)` 誤認為區塊結束標記，將後續文字 `to build...` 解析為無效指令引發語法崩潰。必須將 `::` 註解改為安全的 `REM` 標記並移除 `echo` 內的括號。
- **批次檔絕對路徑切換與 Auto UAC 權限提升**：在 CMD 腳本中，多次調用相對路徑 `cd frontend` 會引發 `系統找不到指定的路徑` 錯誤，統一改以 `cd /D "!ROOT_DIR!frontend"` 進行絕對定位。非系統管理員身分雙擊批次檔時，`taskkill` 與 `netstat` 操作會因 Access is denied 拋錯引發連鎖閃退，於腳本開頭加入 `net session` 檢測與 PowerShell `-Verb RunAs` 自動引導請求 UAC 管理員授權。
- **HUD 儀表板控制中心設定持久化與 API 轉譯**：重構 `OverlayView.tsx` 與 `TelemetryView.tsx` 中殘留的硬編碼 `fetch("http://127.0.0.1:8001/api/overlay/config")` 網絡請求，全數替換為 Pure Rust Tauri IPC 通訊 `apiClient.getOverlayConfig()` 與 `saveOverlayConfig()`，使設定變更 100% 持久化寫入至 `hud_config.json`，解決重啟後恢復預設值的問題。
- **連線狀態視覺語意明確化 (Two-Tier Status Indicator)**：重構連線燈號，區分內嵌 Pure Rust 後端 Core 狀態與 Forza Horizon UDP 遙測串流狀態（綠燈 `FORZA TELEMETRY LIVE 60Hz` vs 黃燈 `WAITING FOR FORZA UDP`），擺脫無效的 WebSocket 迴連警報並提供極致的連線明確性。
- **工作流漏洞檢討與強制門檻升級 (Workflows & Mandatory Gateways)**：深刻檢討先前的 Task Completion Checklist。單純執行 `cargo test` 無法阻斷符合語法但帶有 warnings 的 Rust 代碼溜至 CI。已全面升級 `AGENTS.md` 的 Task Completion Checklist 與 `build_release.bat` 本地腳本，將 `cargo clippy --all-targets -- -D warnings` 與 `npm run lint` 提升為宣佈任務完成前不可豁免的 Mandatory 本地卡關門檻。
- **GitHub Actions CI Linux 依賴與工作目錄修正**：在 Linux (`ubuntu-latest`) 上編譯與檢驗 `glib-sys` 時補全 `libgtk-3-dev` 與 `libwebkit2gtk-4.1-dev` 等 C/GTK 原生套件。針對子目錄前端 Job 明確設置 `defaults.run.working-directory: frontend`，徹底防止 Windows pwsh 平台執行 npm 時因根目錄無 `package.json` 引發的 ENOENT 錯位。

**後續行動 (Action):**
- 後續新增或維護專案資源時，必須同步檢查並更新 `.pkgdirignore` 與 `.gitignore`，維持打包品質與 Repository 純潔。
- 前端與 Rust 後端之間新增通訊時，透過 `apiClient.ts` 與 `commands.rs` 定義明確的型別合約。
