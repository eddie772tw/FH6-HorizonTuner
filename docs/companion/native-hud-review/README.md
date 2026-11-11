# Android 主儀表 renderer 視覺備查

擷取日期：2026-11-10。程式碼基準：`9c289468` 的 Companion 實作，加上 `main` 的 `c01bf0a8`；解決 Journal、LAN 測試、CarParamsContext 與 hudStyleScanner 合併衝突，並同步目前主線的 26 款主儀表清單。後續提交僅補入本批證據與驗證紀錄，呈現程式碼相同。

這批圖是 Linux Chromium 151.0.7922.173 執行主程式下載資產的結果，**不是 Android 原生整頁或實機截圖**。每張圖為完整儀表 renderer viewport（880×280 CSS px、DPR 1），中性背景 `#101318`；使用樣式預設色彩，主儀表自動縮放，禁用附加 overlay。各樣式使用原有儀表語言／字形，未新增翻譯。固定儀表配色不跟隨 APP 日／夜主題，因此此批不聲稱驗證原生日／夜模式。

## 重現條件

1. 完成前端 build，再建置啟用 `hud` 的 Rust debug sidecar。避免與 no-default build 共用同一 target 的執行檔並行測試。
2. 從 sidecar 的 `/companion/hud/catalog.json` 取得清單，再下載每款 `/companion/hud/manifests/{style}.json`，以 `/companion/hud/assets/{sha256}/{path}` 取得內容；核對 SHA-256、長度及 manifest revision。本次使用本機 127.0.0.1:18081；配對 LAN 的認證邊界另由 Rust 測試涵蓋。
3. 將已驗證內容以同源 HTTP 靜態服務提供，僅允許 manifest 中的路徑。開啟每款 `shared/companion.html?style={id}`，等 iframe 的 `data-ready=true`。
4. 每 33 ms 呼叫 `window.companionTelemetry(frame)`，等待 4.2 秒讓啟動動畫與平滑穩定後截圖。輸入：`IsRaceOn=1`、`CurrentEngineRpm=4500`、`EngineMaxRpm=8000`、`SpeedMetersPerSecond=40`、`Gear=4`、`AccelInput=150`、`BrakeInput=0`、`TireTemp=[190,190,188,188]`、`PowerWatts=230000`、`TorqueNewtons=400`、`NormalizedSuspensionTravel=[.4,.4,.5,.5]`、三軸加速度均 0，每次供應的 `TimestampMS` 隨 `performance.now()` 前進，避免將固定樣本視為來源停止。未提供的欄位保留 renderer 原有 unavailable 行為。
5. 每款檢查容器是否在 viewport 內、`showTeleMaster=false` 及無 pageerror，再人工檢視圖片。重跑時核對資產下載數與 bytes 都為 0。

## 覆蓋與限制

- 此目錄各 PNG 以主程式 style ID 命名，涵蓋 catalog 的 26 款主儀表。
- 使用既有快取更新至整合後主線：下載 71 個新／變更內容物件，共 2,423,500 bytes；暖快取重跑為 0 個／0 bytes。這是更新量，不是空快取總大小。
- Android 的 WebView 本機攔截、持久快取、取消／失敗保留版本與認證另由 Android／Rust 合約測試覆蓋；Chromium 圖片不等同 Android WebView 驗收。
- **待補**：Connection、Tuning、Telemetry 原生整頁、各卡片／詳細頁與錯誤狀態的日／夜畫面、原生多語與尺寸、旋轉、reduced motion、真實裝置及遊戲輸入。環境沒有連接 Android 裝置或可用的 KVM 模擬器；不以瀏覽器圖替代。視覺交付尚未完整。
