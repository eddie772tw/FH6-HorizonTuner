# 開發人員選項與 Tuning 視覺審查

2026-11-26（Asia/Taipei），以 `8a7d5656` 為基底擷取本次 PR 的實作。使用 Debian Linux 上的 Chromium 151，Windows-target Vite build 使用正式 AppShell、設定資料、語系、主題和 Tuning providers。1280 × 720 與 320 × 720 均為 CSS viewport。

| 設計系統 | 一般設定與開發人員選項 | Step 1 |
| --- | --- | --- |
| Halfmoon | [日間／英文](settings-default-light-en-us-1280.jpg)、[夜間／繁中](settings-default-dark-zh-tw-1280.jpg) | [日間](tune-default-light-en-us.jpg)、[夜間](tune-default-dark-zh-tw.jpg) |
| Swiss | [日間／繁中](settings-swiss-light-zh-tw-1280.jpg)、[夜間／日文](settings-swiss-dark-ja-jp-1280.jpg) | [日間](tune-swiss-light-zh-tw.jpg)、[夜間](tune-swiss-dark-ja-jp.jpg) |
| Rhine Lab | [日間／英文](settings-rhine-lab-light-en-us-1280.jpg)、[夜間／日文](settings-rhine-lab-dark-ja-jp-1280.jpg)、[320px／繁中](settings-rhine-lab-light-zh-tw-320.jpg) | [日間](tune-rhine-lab-light-en-us.jpg)、[夜間](tune-rhine-lab-dark-ja-jp.jpg) |

- 調校成功進入 Step 2 後的 [唯讀中性基準](tune-read-only-diagnostics.jpg)，以及開關停用時的 [EV](tune-ev-off.jpg) 和 [CVT](tune-cvt-off.jpg) 步驟 3 提示。
- [MCP 展開](settings-mcp-expanded.jpg)、[Android Companion 管理](companion-enabled.jpg)、[賽事分析原生匯出](sessions-experimental-export.jpg)、[可顯示 WIP 樣式的主儀表選單](hud-wip-styles.jpg)。
- 直線加速報告的 [預設折疊](drag-report-collapsed.jpg) 和 [展開](drag-report-expanded.jpg)。

## 重現

1. 執行 `FH6_PLATFORM=windows pnpm -C frontend run build`。以獨立資料目錄啟動 Rust sidecar 並讓 Vite Preview 指向該後端。
2. 以 `/api/settings` 選擇對應語系、主題與日夜模式。初始關閉各實驗開關，開啟應用程式選單的設定並捲動到開發人員選項。
3. 在儲存的車輛中使用包含有效重量、配重、引擎功率和彈簧範圍的測試設定檔。打開 Tune，將目標改為 Rally 後按「儲存並繼續」。透過 `GET /api/car_params/{id}` 核對已存的 `tuningTarget.goal` 與畫面上的 Step 2。開啟調校診斷後，核對唯讀面板。另使用 EV 與 CVT 測試設定檔查看 Step 3。
4. 分別開啟 MCP、Companion、MoTeC 和 WIP HUD 選項以檢查對應畫面。檢查直線加速時讓測試狀態為 finished，查看結果的折疊與展開。

測試車輛與直線加速結果使用合成資料，Step 1 儲存與計算經實際 Rust API。Companion 管理與 Windows MoTeC 控制項的能力使用瀏覽器 fixture，Companion 狀態為示意。這批畫面涵蓋表單、步驟切換、展開及停用呈現。Modern、Elegant、Swiss Editorial 和 Swiss Contrast 在 320px 日夜模式均通過設定表單尺寸檢查。Lite 的 WIP HUD 開關可見，Full 專屬開關隱藏。實體 Android、Windows 原生安裝與真實遊戲驗收待測。
