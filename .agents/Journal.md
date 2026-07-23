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
- **Ruff 規範精確繼承與工具鏈移轉**：原先 `pyproject.toml` 中的 Ruff 規範標竿（88 字元最大行寬、雙引號、isort 自動 Import 排序）透過新增 `rustfmt.toml` (`max_width = 88`) 與前端 `biome.json` (`lineWidth: 88`) 完全繼承與對齊。
  - `start_all.bat`：一鍵啟動開發生態，包含 UAC 自動提權、Port 1420/8000 清理、絕對路徑切換與格式自動修復。
  - `build_release.bat`：一鍵打包原生檔，100% 保留未註冊資源目錄 (`.pkgdirignore`) 自動掃描機制與發行檔產出驗證。
- **工作流漏洞檢討與強制門檻升級 (Workflows & Mandatory Gateways)**：深刻檢討先前的 Task Completion Checklist。單純執行 `cargo test` 無法阻斷符合語法但帶有 warnings 的 Rust 代碼溜至 CI。已全面升級 `AGENTS.md` 的 Task Completion Checklist 與 `build_release.bat` 本地腳本，將 `cargo clippy --all-targets -- -D warnings` 與 `npm run lint` 提升為宣佈任務完成前不可豁免的 Mandatory 本地卡關門檻。

**後續行動 (Action):**
- 後續新增或維護專案資源時，必須同步檢查並更新 `.pkgdirignore` 與 `.gitignore`，維持打包品質與 Repository 純潔。
- 前端與 Rust 後端之間新增通訊時，透過 `apiClient.ts` 與 `commands.rs` 定義明確的型別合約。

---

## 2026-07-22 - 初次建立 tuningMath.ts Vitest 測試套件

**學習點 (Learning):**
- 專案原先並未安裝 Vitest，也沒有 `test` script。Vite 7.x 搭配 Vitest 4.x 可以零設定直接運行 `.test.ts` 測試檔，無需額外的 `vitest.config.ts`。
- `tuningMath.ts` 共 11 個導出函數，全部為純函數，不依賴任何 React state 或外部全域變數，非常適合單元測試。
- `calculateSpringsByFrequency` 有 anti-squat 邏輯 (hpWeightRatio > 200)，需注意 `_hp` 參數名稱帶底線但實際有使用。
- `calculateDampersCritical` 使用 `CALIBRATION_CONST = 0.00135` 這個由遙測逆向工程得出的校準常數，測試時不應硬編碼期望值，而是驗證範圍與相對關係。
- `calculateAEGOGearing` 的 `carParams` 可能為 `null`，函數內部有完整的 fallback 處理。

**後續行動 (Action):**
- 後續修改任何 `tuningMath.ts` 的公式時，務必同步更新或新增對應的測試案例。

---

## 2026-07-22 - Windows PowerShell 執行前端 Vitest 測試的 ExecutionPolicy 避坑處理

**學習點 (Learning):**
- 在 Windows PowerShell 環境中，直接執行 `npm --prefix frontend run test` 或 `npx` 時，可能觸發 `PSSecurityException` (UnauthorizedAccess)，主因是系統網域或執行策略管制阻擋了 `.ps1` 腳本執行。
- 包裹命令為 `cmd /c "npm --prefix frontend run test"` 可繞過 PowerShell 限制，穩定順利啟動 Vitest 並完成全數測試運算。

---

## 2026-07-22 - 追加 tuningDiagnosis.ts 前端遙測診斷測試套件

**學習點 (Learning):**
- `tuningDiagnosis.ts` 內部的數據結構解析同時支援舊版遙測欄位名（如 `SuspTravel`、`TireSlipAngle`）與單位轉換（如弧度轉角度 `* (180 / Math.PI)`）。

---

## 2026-07-22 - HUD Overlay 全螢幕中央半透明對稱儀表 (Central Telemetry Cluster) 重構

**學習點 (Learning):**
- **螢幕相對比例 (vh) 響應性**：將 HUD 中央 G-Force 雷達基準尺寸定為 `75vh`，四角輪胎與懸吊圖表定為 `12.5vh`。
- **對稱鏡像佈局 (Symmetric Mirroring)**：左側二輪與右側二輪對稱鏡像。
- **獨立通道控制 (Independent Controls)**：將 HUD 競賽弧形/圓形儀表與中央遙測儀表解耦。

---

## 2026-07-22 - 修復 TypeScript Release Build 未使用變數與測試型別錯誤

**學習點 (Learning):**
- **TS6133 Unused Code Build Protection**：Tauri Release Build 執行 `tsc && vite build` 時在嚴格 TS 配置下會因 `noUnusedLocals` 擋下所有未讀取的變數。

---

## 2026-07-22 - Vite Rollup manualChunks 策略性分包優化

**學習點 (Learning):**
- **Vite 500 kB Chunk 警告**：使用 `manualChunks(id)` 函數判斷 `id.includes('node_modules')` 能更精確、乾淨地隔離 `recharts`。

---

## 2026-07-22 - 修正 Vite manualChunks 循環模組依賴 (Circular Dependency) 導致執行檔無法啟動問題

**學習點 (Learning):**
- **循環依賴崩潰陷阱**：將所有 `node_modules` 統一歸類劃分為 `vendor` Chunk，徹底避免模組間的循環相依。

---

## 2026-07-22 - HUD Layout 與 Telemetry 頁面 6 大優化與雷達圖極限邊界防護

**學習點 (Learning):**
- **圓形雷達圖向量 Clamp (Euclidean Radius Clamping)**：導入 `dist = Math.sqrt(dx*dx + dy*dy)` 與極限半徑極化縮放，100% 確保點始終沿著圓形邊線移動且不消失。

---

## 2026-07-22 - 修復 HUD Overlay 胎溫跳動 180 度與 31°C 轉譯顯示為 88°C/90°F 之 Bug

**學習點 (Learning):**
- **胎溫跳動與公英制轉譯**：校正原生華氏對應攝氏轉譯公式與色彩邊界。

---

## 2026-07-22 - 60Hz UDP 遙測效能優化與雷達圖彈跳跳動修復

**學習點 (Learning):**
- **零記憶體分配 (Zero-Allocation Canvas Loop)**：原地走訪極值替代 `Math.min(...hist.map())` 陣列分配，消除 V8 垃圾回收停頓。

---

## 2026-07-23 - 修復 Advanced HUD 速度 3.6 倍二次換算與增壓 (Boost) 單位邏輯

**學習點 (Learning):**
- **速度與增壓單位**：釐清 Ingestion 層與 DOM 渲染層之間數據單位的責任劃分。

---

## 2026-07-23 - 修復 PyInstaller 發行版遺失 FastAPI / 後端模組致命錯誤

**學習點 (Learning):**
- 歷史經驗備查（Python 後端時期之 PyInstaller 相依性問題已於全 Rust 重構中徹底解決）。
