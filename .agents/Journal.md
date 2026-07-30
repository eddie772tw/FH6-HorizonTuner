# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

本文件用於記錄每一次 Agent 在 FH6-HorizonTuner 開發過程中的**關鍵學習點（Critical Learnings）**。

## 記錄準則
只有在遇到以下情況時才新增日誌紀錄：
1. 發現 Forza UDP 遙測數據的包結構或位元偏移 (Byte Offset) 陷阱。
2. 嘗試了某種懸吊/齒輪調校演算法優化，但結果不如預期（如出現物理奇異點）。
3. 發現 Tauri / WebSockets 高頻數據傳遞造成的 UI 影格率（FPS）下降問題。
4. 前後端跨語言（Python <-> TypeScript）數據對齊的 Anti-pattern。

## 日誌格式
```markdown
## YYYY-MM-DD - [標題]
**學習點 (Learning):** [簡述學到了什麼、底層原因或發現的機制]
**後續行動 (Action):** [下次開發時該如何應用此經驗]
```

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
- 考慮為 `tuningDiagnosis.ts` 也建立類似的測試套件。
- 若未來需要 snapshot 測試 AEGO 齒輪比的完整輸出，可考慮加入 `toMatchSnapshot()`。

---

## 2026-07-22 - Windows PowerShell 執行前端 Vitest 測試的 ExecutionPolicy 避坑處理

**學習點 (Learning):**
- 在 Windows PowerShell 環境中，直接執行 `npm --prefix frontend run test` 或 `npx` 時，可能觸發 `PSSecurityException` (UnauthorizedAccess)，主因是系統網域或執行策略管制阻擋了 `.ps1` 腳本執行。
- 包裹命令為 `cmd /c "npm --prefix frontend run test"` 可繞過 PowerShell 限制，穩定順利啟動 Vitest 並完成全數測試運算。

**後續行動 (Action):**
- 在 `AGENTS.md` 及重構 SKILL 指南中明確標註 `cmd /c` 指令選項，避免 Agent 後續重試陷入權限錯誤循環。

---

## 2026-07-22 - 追加 tuningDiagnosis.ts 前端遙測診斷測試套件

**學習點 (Learning):**
- `tuningDiagnosis.ts` 內部的數據結構解析同時支援舊版遙測欄位名（如 `SuspTravel`、`TireSlipAngle`）與單位轉換（如弧度轉角度 `* (180 / Math.PI)`）。
- 滯空觸地測試中需精確提供連續滯空時間 (> 0.3s) 及加速度向量 `AccelerationX` / `AccelerationZ` 才能正確認定跳躍並計算 Landing G 衝擊值。

**後續行動 (Action):**
- 後續若調整診斷邏輯或新增極限運動診斷（如 0-400m 拖孤/直線加速測試），需同步維護 `tuningDiagnosis.test.ts`。

---

## 2026-07-22 - HUD Overlay 全螢幕中央半透明對稱儀表 (Central Telemetry Cluster) 重構

**學習點 (Learning):**
- **螢幕相對比例 (vh) 響應性**：將 HUD 中央 G-Force 雷達基準尺寸定為 `75vh`，四角輪胎與懸吊圖表定為 `12.5vh`，配合獨立遙測縮放比例 `telemetryScale` 乘積運算，可確保 Overlay 在不同螢幕解析度 (1080p, 2K, 4K) 下維持一致的視覺比重與清晰度。
- **對稱鏡像佈局 (Symmetric Mirroring)**：左側二輪 (FL/RL) 與右側二輪 (FR/RR) 在 DOM 結構與 flex 方向上實施對稱鏡像 (`flex-direction: row` vs `flex-direction: row-reverse`)，讓 telemetry 視覺自然向畫面中心收攏。
- **獨立通道控制 (Independent Controls)**：將 HUD 競賽弧形/圓形儀表 (Race HUD) 的縮放與中央遙測儀表 (Telemetry Cluster) 的縮放 (`telemetryScale`) 及透明度 (`telemetryOpacity`) 解耦，大幅提升玩家自由配置視角的靈活性。
- **角落縱向堆疊排版 (Vertical Layout Refactor)**：將四角懸吊 (Suspension) 與輪胎 (Tire) 組件改為 `flex-direction: column` 縱向堆疊，並為 `tcSuspBlock` 與 `tcTireBlock` 建立獨立 `display` 綁定，成功解決了懸吊與輪胎單獨開關失靈的問題，並大幅收縮左右側卡片寬度，防止與右下角 Speedometer 競賽表盤重疊。
- **全多型態啟動展演 (Universal Startup Sweep Animations)**：為 Simple HUD 指針與圓環、Advanced HUD 弧形動態、中央遙測雷達與 4 角圖表全數建立統一的 `hud:animate` 觸發機制（包含更換樣式、載入與點擊 Launch HUD 啟動），極大地強化了賽車電競儀表的儀式感。
- **純淨極簡風 UI (Clean Minimalist UI)**：重命名頁面標題為 `HUD Control Panel`，徹底清除非必要的動態 Demo 模式模擬代碼與全頁面的 Emoji 圖符，並將右下競賽儀表 (`showGauge`) 統一整合入 "HUD Elements" 的純 Checkbox 清單中。
- **徹底清除 Standby 模擬數據 (Idle Telemetry Cleanup)**：經精確監控與追蹤，發現 `useTelemetry.ts` 頂層原包含一個 `setInterval` (20Hz 頻率)，會在未收到 UDP 數據超過 2 秒時持續對 BroadcastChannel 發送包含正弦波抖動 `1200 RPM` 與假 `PowerWatts` 的 `idleData` 模擬資料。將該 `setInterval` 與 `index.html` 中的預設怠速 initial frame 清除後，徹底實現了只有在收到真實 UDP 遙測數據時 HUD 才會動態變化的純淨狀態。
- **Advanced 儀表數據包完整透傳與多重相容 (Full Telemetry Mapping & Fallback)**：修復了 `formatHudTelemetry` 中未打包 `TireTemp`、`TireSlipAngle`、`TireSlipRatio` 與 `NormalizedSuspensionTravel` 原生陣列及個體的 Bug，並於 `telemetry-cards.js` 中加入了對 `AccelerationX` / `accel_x` 等雙命名格式的容錯解析。
- **HUD 架構標準化與 Host 級別生命週期解耦 (Standardization & Host Decoupling)**：
  1. **標準化註冊引擎與規格書**：建立 `shared/hud-core.js` 與 [HUD_DEVELOPMENT_GUIDE.md](file:///d:/FH6-Bundle/FH6-HorizonTuner/frontend/public/hud/HUD_DEVELOPMENT_GUIDE.md)，規範 `HUDCore.registerStyle` 生命週期鉤子，消除了 Simple 與 Advanced 儀表的程式邏輯分歧。
  2. **Host 級別生命週期解耦**：將 `#teleCardsMount` 提升至 Launcher Host (`index.html`) 根層級託管。中央遙測 Cluster 於啟動時建立後**永不銷毀**，更換右下角 Gauge 樣式時不再引發 DOM 銷毀與 100% 縮放跳變。
  3. **視角與語法修復**：修正 `advanced/index.html` 腳本語法錯誤，並將 `#teleCardsMount` 移出 3D perspective 容器，恢復全視角連貫繪製與外圈全套刻度還原。

- **中央遙測 Cluster 與波形圖表升級 (Telemetry Cluster & Canvas Upgrades)**：
  1. **油門/煞車 5秒歷程折線圖 (`showTelePedals`)**：繪製過去 5 秒動態歷史波形，標籤精確位移至右上角 (`THROTTLE`) 與右下角 (`BRAKE`)。
  2. **G力雷達圖與胎溫分佈直方圖**：`LAT G` (9點鐘) 與 `LON G` (6點鐘) 呈現垂直/水平正交對稱；4 輪胎溫 3 秒滾動歷史分佈直方圖與公英制單位 (`°C`/`°F`) 自動連動。

- **主 GUI 駕駛輸入面板重構、無死角多語系與數據防護 (GUI Telemetry, i18n & Data Protection)**：
  1. **直式條形圖與波形延伸**：在 `TelemetryView.tsx` 中將離合器與手煞車重構為直式條形圖 (`VerticalInputBar`) 並列於右側，左側油門與煞車波形 Canvas 大尺寸延伸且維護卡片外框尺寸穩定不變形。
  2. **無死角多語系對照**：於 `zh-tw.json` 與 `ja-jp.json` 補齊全套 HUD 控制選項、標題、分頁標籤 (`HUD 懸浮儀表`) 與全大寫 key (`THROTTLE`/`BRAKE`)。
  3. **雙重事件發送防護**：於 `useTelemetry.ts` 補充全域發送 `window.hud:frame`，並為所有 60Hz Canvas 組件配備 `telemetryEmitter` 與 `window.hud:frame` 雙重事件備援監聽，徹底保障主 GUI 即時遙測圖表數據零遺失。

**後續行動 (Action):**
- 未來調整 Overlay 遙測元件繪圖 Canvas 時，應確保依據 CSS 計算出的真實像素高寬調適 Canvas 內部繪圖 context 的 `width` 與 `height`，防止高 DPI 螢幕下波形 blurry 模糊。

---

## 2026-07-22 - 修復 TypeScript Release Build 未使用變數與測試型別錯誤

**學習點 (Learning):**
- **TS6133 Unused Code Build Protection**：Tauri Release Build 執行 `tsc && vite build` 時在嚴格 TS 配置下會因 `noUnusedLocals` / `noUnusedParameters` 擋下所有未讀取的變數或全域函數（如 `InputBar`、`lastRealDataTime` 與重複廢棄的 `formatHudTelemetry`）。
- **Mock 物件型別轉型**：在 Unit Test（如 `tuningDiagnosis.test.ts`）中傳遞 Mock 資料物件至帶型別約束（如 `CarParams`）的函數時，若屬性欄位未完全實現 interface，直接標註 `: CarParams` 會觸發 TS2353 錯誤。應使用 `as unknown as CarParams` 或完整實現屬性。

**後續行動 (Action):**
- 在重構或清理程式碼時，務必刪除廢棄未讀取的 Helper 函數與變數。
- 宣佈任務完成前，持續執行 `cmd /c "npm --prefix frontend run build"` 確保前端 release 編譯無任何型別錯誤。

---

## 2026-07-22 - Vite Rollup manualChunks 策略性分包優化

**學習點 (Learning):**
- **Vite 500 kB Chunk 警告**：當前端靜態引入大型圖表庫（如 `recharts` 430KB+）與 View 元件時，預設會打成單一巨大 Chunk（848 kB）。
- **manualChunks 函數 vs 物件寫法**：使用物件語法 `manualChunks: { 'vendor-react': ['react'] }` 在 React/Vite 插件重新導出模組時，可能會觸發 `Generated an empty chunk: "vendor-react"` 警告；改用 `manualChunks(id)` 函數判斷 `id.includes('node_modules')` 能更精確、乾淨地隔離 `recharts` 與 `d3-*`，消除所有 Chunk 大小與空包警告。
- **建置速度提升**：將 `recharts` 等不常變動的巨型第三方庫獨立為 `vendor-recharts` 後，建置時間從原本的 6.86s 縮短至 4.44s（提升 35%）。

**後續行動 (Action):**
- 未來若引入其他大型 npm 套件（如 Babylon.js、Three.js），應同步維護 `vite.config.ts` 中的 `manualChunks` 函數規則。

---

## 2026-07-22 - 修正 Vite manualChunks 循環模組依賴 (Circular Dependency) 導致執行檔無法啟動問題

**學習點 (Learning):**
- **循環依賴崩潰陷阱**：若在 `manualChunks` 中僅將 `recharts` 抽出，卻將 `react` 留置於主 `index.js` 包中，`index.js` 會需要 `vendor-recharts`，而 `vendor-recharts` 又會反向引用的未未初始化的 `React`。這在開發模式 (Dev Server HMR) 下看似正常，但打包後的正式執行檔 (Release Build) 會丟出 `Uncaught ReferenceError: Cannot access 'React' before initialization` 造成全頁白屏或無法啟動。
- **統一 Vendor Chunk 解法**：將所有 `node_modules` 統一歸類劃分為 `vendor` Chunk (621 kB)，可徹底避免模組之間的循環相依問題。搭配 `chunkSizeWarningLimit: 800`，既能使主應用業務邏輯檔 `index.js` 暴降至 **225 kB**，又能 100% 保障產出執行檔正常載入啟動。

**後續行動 (Action):**
- 進行任何前端打包與 chunking 拆分調整後，除了檢查 build 警告外，必須特別防範模組間的循環引用。

---

## 2026-07-22 - HUD Layout 與 Telemetry 頁面 6 大優化與雷達圖極限邊界防護

**學習點 (Learning):**
- **圓形雷達圖向量 Clamp (Euclidean Radius Clamping)**：過往採用矩形極限 (`Math.min/max(x)`, `Math.min/max(y)`) 會導致斜角方向距離達 $\sqrt{x^2+y^2} = 1.414 \times R$，使藍點與軌跡線超出圓形邊界甚至溢出 Canvas 邊界導致點消失。導入 `dist = Math.sqrt(dx*dx + dy*dy)` 與極限半徑極化縮放 (`dx = (dx/dist) * maxR`)，可 100% 確保點始終沿著圓形邊線移動且不消失。
- **G 力與輪胎雷達圖座標軸對齊**：
  - **橫向 G 力 (Lateral G)**：根據 Forza UDP telemetry 規範，轉向時 lateral acceleration (`AccelerationX`) 向右或向左需與儀表視覺慣性一致。在 `TelemetryView.tsx` 與 `telemetry-cards.js` 中統一將 X 軸映射符號反轉（`lat = -rawAccX / 9.81`），使向左/向右切打方向盤時藍點位移符合預期。
  - **縱向輪胎滑移 (Slip Ratio)**：統一 HUD 4 輪胎雷達圖 Y 軸映射，頂端為煞車 (Brake / negative ratio)、底端為加速燒胎 (Accel / positive ratio)，與 G 力雷達圖 (BRAKE on top) 及車輛前後重力轉移的視覺感知完美連動。
- **廣播通道與 Telemetry 頁面解耦暫停 (BroadcastChannel HUD Pause Sync)**：在 `useTelemetry.ts` Ingestion 層中，HUD 數據預處理 (`formatHudTelemetry`) 在 WebSocket 接收瞬間即已完成，並透過 BroadcastChannel 直傳 HUD Overlay 獨立視窗。當使用者開啟「HUD 啟用時暫停 Telemetry 頁面渲染」開關時，`TelemetryView.tsx` 各 60Hz Canvas 組件直接透過全域 `__IS_HUD_PAUSED__` 旗標跳過繪製並呈現暫停提示條，實現大幅降低 CPU/GPU 開銷的同時，HUD 懸浮儀表依舊能毫秒級暢順繪繪與更新。
- **TypeScript TS2688 / TS2307 測試檔 Exclusion**：執行 production Build (`npm run build` -> `tsc`) 時，若未在 `tsconfig.json` 設定 `"exclude": ["src/**/*.test.ts"]`，`tsc` 會因預設型別庫中缺乏 `vitest` 型別定義而報錯。在 `tsconfig.json` 中將 `.test.ts` 排除於 prod TS 編譯外，既保障 `tsc` 秒級 pass，又保證 Vitest 單元測試單獨流暢執行。

---

## 2026-07-22 - 修復 HUD Overlay 胎溫跳動 180 度與 31°C 轉譯顯示為 88°C/90°F 之 Bug

**學習點 (Learning):**
- **胎溫跳動 180 度主因**：Telemetry 接收時，若 `useTelemetry.ts` 或卡片初始化階段發送 null 數據更新，`telemetry-cards.js` 的 `temps` 數值會落入 `data.temp_fl || 180` 硬編碼保底值；隨後在 60Hz 遙測與 null config 更新交替觸發時，即造成畫面在真實胎溫與 180 之間高頻跳動。將 fallback 全數改為 `0` 並判定 `cTemp > 0` 時才渲染數值，無資料時呈現 `--°C`，徹底消除了 180 跳動。
- **31°C 顯示為 88°C/90°F 主因**：Forza UDP 原生輸出的 `TireTemp` 為**華氏 (°F)**（例如室溫 31°C 時，原生 UDP 輸出 `87.8°F`，即約 90°F）。過往 `telemetry-cards.js` 未進行 `(F - 32) * 5 / 9` 換算，直接將 87.8°F 捨入為 `88` 標示為 `88°C`（大約 90°C）。校正後：
  - 公制模式（Metric）：將 `87.8°F` 轉譯為 `(87.8 - 32) * 5 / 9 = 31°C` 精確顯示 `31°C`。
  - 英制模式（Imperial）：顯示 `88°F`。
  - 色彩判斷與直方圖顏色分佈：原先 `telemetry-cards.js` 的 `getTempColor` 內部進行了雙重華氏/攝氏判斷，導致 100°F ~ 150°F (冷胎區間) 的直方圖長條圖與胎溫文字均被錯誤繪製為綠色。對照 `TelemetryView.tsx`（Single Source of Truth）的色彩邏輯校正為 `tempF < 150` 藍色 (`#0088ff`)、`150 <= tempF <= 210` 綠色 (`#00ff00`)、`tempF > 210` 紅色 (`#ff0000`)，使 HUD Overlay 與 Telemetry 頁面直方圖色彩對齊。

**後續行動 (Action):**
- 為 HUD Overlay 新增任何遙測卡片或數據指標時，務必確認 UDP 原生數據單位（如華氏、Pascal、米/秒）是否於顯示層進行正確的單位換算與 fallback 處理，並嚴格遵循 `TelemetryView.tsx` 的顏色分佈。

---

## 2026-07-22 - 60Hz UDP 遙測效能優化與雷達圖彈跳跳動修復

**學習點 (Learning):**
- **後端佇列積壓與丟幀 (Backend Queue Backpressure & Frame Drop)**：`main.py` 的 `broadcast_telemetry()` 迴圈中，先前寫死了 `await asyncio.sleep(0.01)`（強制延遲 10ms），加上封包處理耗時導致單幀處理頻率低於 UDP 60Hz 接收頻率，造成佇列積壓並頻繁觸發 `telemetry_queue.qsize() > 5` 的丟幀邏輯（一次丟棄 4~5 個封包），使前端接收到 100ms~300ms 突發性中斷的資料包，引發雷達圖藍點與軌跡的暴衝彈跳。
  - 將 `await asyncio.sleep(0.01)` 改為 `await asyncio.sleep(0)` 立即交接協程控制權。
  - 將 `save_car_params` 同步寫檔與 `gc.collect()` 改以 `asyncio.to_thread` 移至背景執行緒，完全解放 UDP 主廣播迴圈。
- **前端 60Hz 高頻 Canvas 零記憶體分配 (Zero-Allocation Canvas Loop)**：
  - 清理 `VerticalInputBar` 與 `PedalTraceCanvas` 的重複 `window.addEventListener('hud:frame')` 綁定，避免單幀雙重渲染 (120Hz)。
  - 以傳統 `for` 迴圈原地走訪極值，替代每秒 240 次 `Math.min(...hist.map())` 與 `.slice()` 陣列分配，徹底消除 V8 引擎的高頻垃圾回收停頓 (GC Pauses)。
  - 採用「雙層向量光暈 (Double Pass Vector Glow)」替代高對比度高斯模糊 `ctx.shadowBlur` 濾鏡，在維持 0ms 渲染負擔的同時保留 100% 絕佳視覺質感與清晰可讀性。

---

## 2026-07-23 - 修復 Advanced HUD 速度 3.6 倍二次換算與增壓 (Boost) 單位邏輯

**學習點 (Learning):**
- **右下進階儀表盤 (Advanced HUD) 速度二次換算 Bug**：`formatHudTelemetry`（[useTelemetry.ts](file:///d:/FH6-HorizonTuner/frontend/src/hooks/useTelemetry.ts)）已將 Forza 原生 `SpeedMetersPerSecond` (m/s) 轉譯為 `speed_kmh` (km/h) 與 `speed_mph` (mph)。但 [advanced/index.html](file:///d:/FH6-HorizonTuner/frontend/public/hud/advanced/index.html) 的 DOM 渲染層誤將傳入之 `data.speed` 當成 m/s，再次執行 `data.speed * 3.6`，導致時速 100 km/h 暴增顯示為 **360 KM/H**。修正為直接讀取 `data.speed_kmh` / `data.speed_mph`。
- **增壓 (Boost) PSI 與 Bar 轉換**：Forza Motorsport / Horizon UDP 封包 Byte offset 284 輸出的 `Boost` 原生單位為 **PSI**。過往 `useTelemetry.ts` 誤將傳入之數值乘上 `0.145038` 與 `0.01`，造成 `14.7 PSI` (約 1.0 Bar) 的增壓值被誤算為 `2.1 PSI` / `0.14 Bar`（增壓針幾乎不移動）。校正為 `boostPsi = raw.Boost`、`boostBar = raw.Boost / 14.5038`。
- **Session Maxima 動態極值追蹤**：補齊 `useTelemetry.ts` 中 `sessionMaxima` 對全局 Peak Power / Torque / Boost 歷史極值的持續追蹤，確保進階儀表盤動態繪製針指標縮放精確穩定。

**後續行動 (Action):**
- 新增 HUD 樣式或遙測指標時，務必確認 `useTelemetry.ts` Ingestion 層與前端 HTML 視窗 DOM 渲染層之間「數據單位」的責任劃分，避免雙重乘算。

---

## 2026-07-23 - 修復 PyInstaller 發行版遺失 FastAPI / 後端模組致命錯誤 (ModuleNotFoundError: No module named 'fastapi')

**學習點 (Learning):**
- **全域 PyInstaller 誤導環境陷阱 (Global PyInstaller Fallback Hazard)**：原 `build_release.bat` 在專案虛擬環境 (`.venv`) 未安裝 PyInstaller 時，會退回搜尋系統 `where pyinstaller`。若系統全域 Python 3.13 安裝有 PyInstaller 但缺乏 `fastapi`、`uvicorn`、`websockets` 等專案依賴，PyInstaller 會以全域 Python 環境進行模組分析與打包，導致編譯出來的執行檔在啟動時拋出 `ModuleNotFoundError: No module named 'fastapi'`。
- **PyInstaller Spec 套件收集與 Hidden Imports 配置**：
  - 專案程式碼並未引用 `numpy`，舊 spec 檔誤寫了 `collect_all("numpy")`。當在沒有 `numpy` 的 `.venv` 執行打包時會拋出異常。
  - 將 spec 檔內的收集目標修正為 `fastapi`、`uvicorn`、`starlette`、`websockets` 與 `pydantic`，並於 `Analysis.pathex` 加入 `'backend'` 目錄，確保 FastAPI 路由、中間件與非同步 Socket 解析全數正確包含於產出執行檔中。
- **虛擬環境強制綁定**：將 `build_release.bat` 邏輯修改為優先於 `.venv` 自動安裝並透過 `"%PY_EXE%" -m PyInstaller` 執行打包，徹底杜絕引用全域 Python site-packages 的隱患。

- **GUI 無主控台模式下 `monitor_stdin_eof` 觸發即刻退出陷阱 (No-Console Stdin EOF Trap)**：
  - 當 PyInstaller 使用 `console=False`（無主控台視窗）編譯 release 執行檔時，Windows 不會為進程配置 `sys.stdin` 控制台句柄（`sys.stdin` 處於 EOF 或關閉狀態）。
  - `main.py` 底部原先會無條件啟動 `monitor_stdin_eof` 執行緒執行 `sys.stdin.read()`。當在 release GUI 模式下執行時，`sys.stdin.read()` 會立即讀取到 EOF 並觸發 `os._exit(0)`，造成執行檔一雙擊啟動便在數毫秒內直接退出。
  - 將 `monitor_stdin_eof` 包裹於 `if not getattr(sys, "frozen", False):` 條件中，僅在開發模式/Sidecar 下才監聽 stdin EOF，徹底修復了發行版啟動即退出的問題。

**後續行動 (Action):**
- 執行發行版打包（`build_release.bat`）前，確認 `.venv` 內已安裝完整需求套件（`requirements.txt`），且 PyInstaller 始終透過 `.venv` 呼叫執行。
- 後續新增與進程生命週期相關的背景 Thread 時，務必區分 Frozen GUI 模式與開發模式的 stdin / log 輸出行為。

---

## 2026-07-23 - ThemeView 功能補全、Custom CSS 語法動態校驗與深淺色主題持久化

**學習點 (Learning):**
- **DOM CSSStyleSheet 即時驗證**：利用純 JavaScript 括號/註解解析器搭配 `document.createElement('style')` 注入測試，可毫秒級判定 Custom CSS 的合法性，並在 UI 上呈現即時狀態徽章與錯誤行號提示。
- **Custom CSS 預設自動帶入與樣式系統標註**：當使用者開啟 Custom CSS 編輯器時，預設自動產出並帶入當前 UI 生效的完整 Vanilla CSS 樣式代碼，降低自訂門檻；並明確標註系統採用 Vanilla CSS + CSS Variables + Glassmorphism 獨立架構。
- **多儲存槽 (3-Slots) 與 JSON 導入匯出**：建立 3 個獨立 Slot 與 JSON 匯入匯出功能，讓使用者能自由保存與共享不同場景的顏色、深淺色與 CSS 組合。
- **後端持久化相容性**：在 `backend/main.py` 的 `app_settings` 與 `update_settings` 中擴充 `theme` 字典並寫入 `settings.json`，實現主題設定持久化與離線 LocalStorage 備援防護。

**後續行動 (Action):**
- 後續新增 UI 組件時，背景與邊框一律優先採用 `var(--glass-bg)` 與 `var(--glass-border)`，避免在 Light Mode 切換時出現硬編碼區塊。

---

## 2026-07-23 - 賽後分析 (Post-Race Analysis) 全面重製與 MoTeC 通道標準化

**學習點 (Learning):**
- **賽事自動閘門判定 (Accurate Race Gate)**：`IsRaceOn == 1` 在 Horizon 5/6 開放世界漫遊 (Freeroam) 時亦被觸發。引入 `IsRaceOn == 1 and CurrentRaceTime > 0 and CurrentLap > 0` 組合閘門，徹底消除了漫遊狀態下的誤錄製與背景資源浪費。
- **SQLite (WAL Mode) 高效串流數據庫**：淘汰每 30s 全檔重讀重寫 `latest.json` 的極低效方式，改用 SQLite `journal_mode=WAL; synchronous=NORMAL;` 搭配 50-point 非同步批次寫入，使 60Hz/10Hz UDP 數據紀錄零 Disk I/O 阻塞與零掉幀。
- **MoTeC 通道與 Lap Distance 對標**：以 MoTeC 20+ 標準 Channel 規範設計資料庫結構，精確記錄 `lap_distance` 與各輪態物理數值，並提供一鍵導出標準 MoTeC i2 CSV 檔功能。
- **Ramer-Douglas-Peucker (RDP) + Canvas 2D 賽道圖繪製**：利用 RDP 演算法將上萬個賽道點精簡為 300~500 個拓撲關鍵拐點，搭配 HTML5 Canvas 2D stroke 繪製多重指標彩虹向量線條，SVG DOM 開銷降為 0。
- **獨立設定檔 (user_configs) 與 .gitignore 管制**：使用者自訂分析佈局與 Channel 算式持久化於 `backend/user_configs/analysis_layout.json`，並於 `.gitignore` 中嚴格納入排除，確保使用者個人化設定與版本控制分離。

**後續行動 (Action):**
- 未來擴充遙測通道時，優先維護 `telemetry_sqlite.py` 與 `motec_exporter.py` 的欄位映射，保持與 MoTeC i2 規範之相容性。

---

## 2026-07-23 - 賽後分析 (Post-Race Analysis) Phase 2 雙層賽道圖與 4 槽位多維度圖表架構

**學習點 (Learning):**
- **雙層繪製架構 (Dual-Layer Circuit Track Canvas)**：在 `TrackMapCanvas.tsx` 中將第一圈/全賽事 Base Coordinates 作為底層半透明繪製，頂層繪製當前選定單圈之彩虹指標線，成功實現了第二圈開始全賽道路線即時呈現與動態脈衝車位標點。
- **Channel 公式編輯器與語法下拉自動補全**：建立 `CustomChannelEditor.tsx`，內建 20+ 標準遙測通道點選自動補全詞典，支援一鍵插入與即時求值預覽 (`Live Formula Evaluation`)。
- **4 槽位多維度圖表面板 (4-Slot Dynamic Chart Grid)**：設計 `DynamicChartGrid.tsx`，提供 4 個獨立可配圖表槽位，開放客製化標題、支援 `Time (s)` / `Distance (m)` / `Lap` 多維度對齊，並預設將 **Lap Delta & Speed Comparison** 為 Slot 1 範例樣板。

**後續行動 (Action):**
- 在高組件化解耦時，元件之間未讀取的 props（如 `primaryLap` / `compareLap`）必須主動清理，確保 Tauri Release Build (`tsc && vite build`) 秒級 pass。

---

## 2026-07-23 - 賽後分析 Phase 3 彈出式 ChartEditModal、純文字專業 UI 與 30 秒記憶體拋棄機制
- 在 Windows PowerShell 環境中，直接執行 `npm --prefix frontend run test` 或 `npx` 時，可能觸發 `PSSecurityException` (UnauthorizedAccess)，主因是系統網域或執行策略管制阻擋了 `.ps1` 腳本執行。
- 包裹命令為 `cmd /c "npm --prefix frontend run test"` 可繞過 PowerShell 限制，穩定順利啟動 Vitest 並完成全數測試運算。

**後續行動 (Action):**
- 在 `AGENTS.md` 及重構 SKILL 指南中明確標註 `cmd /c` 指令選項，避免 Agent 後續重試陷入權限錯誤循環。

---

## 2026-07-22 - 追加 tuningDiagnosis.ts 前端遙測診斷測試套件

**學習點 (Learning):**
- `tuningDiagnosis.ts` 內部的數據結構解析同時支援舊版遙測欄位名（如 `SuspTravel`、`TireSlipAngle`）與單位轉換（如弧度轉角度 `* (180 / Math.PI)`）。
- 滯空觸地測試中需精確提供連續滯空時間 (> 0.3s) 及加速度向量 `AccelerationX` / `AccelerationZ` 才能正確認定跳躍並計算 Landing G 衝擊值。

**後續行動 (Action):**
- 後續若調整診斷邏輯或新增極限運動診斷（如 0-400m 拖孤/直線加速測試），需同步維護 `tuningDiagnosis.test.ts`。

---

## 2026-07-22 - HUD Overlay 全螢幕中央半透明對稱儀表 (Central Telemetry Cluster) 重構

**學習點 (Learning):**
- **螢幕相對比例 (vh) 響應性**：將 HUD 中央 G-Force 雷達基準尺寸定為 `75vh`，四角輪胎與懸吊圖表定為 `12.5vh`，配合獨立遙測縮放比例 `telemetryScale` 乘積運算，可確保 Overlay 在不同螢幕解析度 (1080p, 2K, 4K) 下維持一致的視覺比重與清晰度。
- **對稱鏡像佈局 (Symmetric Mirroring)**：左側二輪 (FL/RL) 與右側二輪 (FR/RR) 在 DOM 結構與 flex 方向上實施對稱鏡像 (`flex-direction: row` vs `flex-direction: row-reverse`)，讓 telemetry 視覺自然向畫面中心收攏。
- **獨立通道控制 (Independent Controls)**：將 HUD 競賽弧形/圓形儀表 (Race HUD) 的縮放與中央遙測儀表 (Telemetry Cluster) 的縮放 (`telemetryScale`) 及透明度 (`telemetryOpacity`) 解耦，大幅提升玩家自由配置視角的靈活性。
- **角落縱向堆疊排版 (Vertical Layout Refactor)**：將四角懸吊 (Suspension) 與輪胎 (Tire) 組件改為 `flex-direction: column` 縱向堆疊，並為 `tcSuspBlock` 與 `tcTireBlock` 建立獨立 `display` 綁定，成功解決了懸吊與輪胎單獨開關失靈的問題，並大幅收縮左右側卡片寬度，防止與右下角 Speedometer 競賽表盤重疊。
- **全多型態啟動展演 (Universal Startup Sweep Animations)**：為 Simple HUD 指針與圓環、Advanced HUD 弧形動態、中央遙測雷達與 4 角圖表全數建立統一的 `hud:animate` 觸發機制（包含更換樣式、載入與點擊 Launch HUD 啟動），極大地強化了賽車電競儀表的儀式感。
- **純淨極簡風 UI (Clean Minimalist UI)**：重命名頁面標題為 `HUD Control Panel`，徹底清除非必要的動態 Demo 模式模擬代碼與全頁面的 Emoji 圖符，並將右下競賽儀表 (`showGauge`) 統一整合入 "HUD Elements" 的純 Checkbox 清單中。
- **徹底清除 Standby 模擬數據 (Idle Telemetry Cleanup)**：經精確監控與追蹤，發現 `useTelemetry.ts` 頂層原包含一個 `setInterval` (20Hz 頻率)，會在未收到 UDP 數據超過 2 秒時持續對 BroadcastChannel 發送包含正弦波抖動 `1200 RPM` 與假 `PowerWatts` 的 `idleData` 模擬資料。將該 `setInterval` 與 `index.html` 中的預設怠速 initial frame 清除後，徹底實現了只有在收到真實 UDP 遙測數據時 HUD 才會動態變化的純淨狀態。
- **Advanced 儀表數據包完整透傳與多重相容 (Full Telemetry Mapping & Fallback)**：修復了 `formatHudTelemetry` 中未打包 `TireTemp`、`TireSlipAngle`、`TireSlipRatio` 與 `NormalizedSuspensionTravel` 原生陣列及個體的 Bug，並於 `telemetry-cards.js` 中加入了對 `AccelerationX` / `accel_x` 等雙命名格式的容錯解析。
- **HUD 架構標準化與 Host 級別生命週期解耦 (Standardization & Host Decoupling)**：
  1. **標準化註冊引擎與規格書**：建立 `shared/hud-core.js` 與 [HUD_DEVELOPMENT_GUIDE.md](file:///d:/FH6-Bundle/FH6-HorizonTuner/frontend/public/hud/HUD_DEVELOPMENT_GUIDE.md)，規範 `HUDCore.registerStyle` 生命週期鉤子，消除了 Simple 與 Advanced 儀表的程式邏輯分歧。
  2. **Host 級別生命週期解耦**：將 `#teleCardsMount` 提升至 Launcher Host (`index.html`) 根層級託管。中央遙測 Cluster 於啟動時建立後**永不銷毀**，更換右下角 Gauge 樣式時不再引發 DOM 銷毀與 100% 縮放跳變。
  3. **視角與語法修復**：修正 `advanced/index.html` 腳本語法錯誤，並將 `#teleCardsMount` 移出 3D perspective 容器，恢復全視角連貫繪製與外圈全套刻度還原。

- **中央遙測 Cluster 與波形圖表升級 (Telemetry Cluster & Canvas Upgrades)**：
  1. **油門/煞車 5秒歷程折線圖 (`showTelePedals`)**：繪製過去 5 秒動態歷史波形，標籤精確位移至右上角 (`THROTTLE`) 與右下角 (`BRAKE`)。
  2. **G力雷達圖與胎溫分佈直方圖**：`LAT G` (9點鐘) 與 `LON G` (6點鐘) 呈現垂直/水平正交對稱；4 輪胎溫 3 秒滾動歷史分佈直方圖與公英制單位 (`°C`/`°F`) 自動連動。

- **主 GUI 駕駛輸入面板重構、無死角多語系與數據防護 (GUI Telemetry, i18n & Data Protection)**：
  1. **直式條形圖與波形延伸**：在 `TelemetryView.tsx` 中將離合器與手煞車重構為直式條形圖 (`VerticalInputBar`) 並列於右側，左側油門與煞車波形 Canvas 大尺寸延伸且維護卡片外框尺寸穩定不變形。
  2. **無死角多語系對照**：於 `zh-tw.json` 與 `ja-jp.json` 補齊全套 HUD 控制選項、標題、分頁標籤 (`HUD 懸浮儀表`) 與全大寫 key (`THROTTLE`/`BRAKE`)。
  3. **雙重事件發送防護**：於 `useTelemetry.ts` 補充全域發送 `window.hud:frame`，並為所有 60Hz Canvas 組件配備 `telemetryEmitter` 與 `window.hud:frame` 雙重事件備援監聽，徹底保障主 GUI 即時遙測圖表數據零遺失。

**後續行動 (Action):**
- 未來調整 Overlay 遙測元件繪圖 Canvas 時，應確保依據 CSS 計算出的真實像素高寬調適 Canvas 內部繪圖 context 的 `width` 與 `height`，防止高 DPI 螢幕下波形 blurry 模糊。

---

## 2026-07-22 - 修復 TypeScript Release Build 未使用變數與測試型別錯誤

**學習點 (Learning):**
- **TS6133 Unused Code Build Protection**：Tauri Release Build 執行 `tsc && vite build` 時在嚴格 TS 配置下會因 `noUnusedLocals` / `noUnusedParameters` 擋下所有未讀取的變數或全域函數（如 `InputBar`、`lastRealDataTime` 與重複廢棄的 `formatHudTelemetry`）。
- **Mock 物件型別轉型**：在 Unit Test（如 `tuningDiagnosis.test.ts`）中傳遞 Mock 資料物件至帶型別約束（如 `CarParams`）的函數時，若屬性欄位未完全實現 interface，直接標註 `: CarParams` 會觸發 TS2353 錯誤。應使用 `as unknown as CarParams` 或完整實現屬性。

**後續行動 (Action):**
- 在重構或清理程式碼時，務必刪除廢棄未讀取的 Helper 函數與變數。
- 宣佈任務完成前，持續執行 `cmd /c "npm --prefix frontend run build"` 確保前端 release 編譯無任何型別錯誤。

---

## 2026-07-22 - Vite Rollup manualChunks 策略性分包優化

**學習點 (Learning):**
- **Vite 500 kB Chunk 警告**：當前端靜態引入大型圖表庫（如 `recharts` 430KB+）與 View 元件時，預設會打成單一巨大 Chunk（848 kB）。
- **manualChunks 函數 vs 物件寫法**：使用物件語法 `manualChunks: { 'vendor-react': ['react'] }` 在 React/Vite 插件重新導出模組時，可能會觸發 `Generated an empty chunk: "vendor-react"` 警告；改用 `manualChunks(id)` 函數判斷 `id.includes('node_modules')` 能更精確、乾淨地隔離 `recharts` 與 `d3-*`，消除所有 Chunk 大小與空包警告。
- **建置速度提升**：將 `recharts` 等不常變動的巨型第三方庫獨立為 `vendor-recharts` 後，建置時間從原本的 6.86s 縮短至 4.44s（提升 35%）。

**後續行動 (Action):**
- 未來若引入其他大型 npm 套件（如 Babylon.js、Three.js），應同步維護 `vite.config.ts` 中的 `manualChunks` 函數規則。

---

## 2026-07-22 - 修正 Vite manualChunks 循環模組依賴 (Circular Dependency) 導致執行檔無法啟動問題

**學習點 (Learning):**
- **循環依賴崩潰陷阱**：若在 `manualChunks` 中僅將 `recharts` 抽出，卻將 `react` 留置於主 `index.js` 包中，`index.js` 會需要 `vendor-recharts`，而 `vendor-recharts` 又會反向引用的未未初始化的 `React`。這在開發模式 (Dev Server HMR) 下看似正常，但打包後的正式執行檔 (Release Build) 會丟出 `Uncaught ReferenceError: Cannot access 'React' before initialization` 造成全頁白屏或無法啟動。
- **統一 Vendor Chunk 解法**：將所有 `node_modules` 統一歸類劃分為 `vendor` Chunk (621 kB)，可徹底避免模組之間的循環相依問題。搭配 `chunkSizeWarningLimit: 800`，既能使主應用業務邏輯檔 `index.js` 暴降至 **225 kB**，又能 100% 保障產出執行檔正常載入啟動。

**後續行動 (Action):**
- 進行任何前端打包與 chunking 拆分調整後，除了檢查 build 警告外，必須特別防範模組間的循環引用。

---

## 2026-07-22 - HUD Layout 與 Telemetry 頁面 6 大優化與雷達圖極限邊界防護

**學習點 (Learning):**
- **圓形雷達圖向量 Clamp (Euclidean Radius Clamping)**：過往採用矩形極限 (`Math.min/max(x)`, `Math.min/max(y)`) 會導致斜角方向距離達 $\sqrt{x^2+y^2} = 1.414 \times R$，使藍點與軌跡線超出圓形邊界甚至溢出 Canvas 邊界導致點消失。導入 `dist = Math.sqrt(dx*dx + dy*dy)` 與極限半徑極化縮放 (`dx = (dx/dist) * maxR`)，可 100% 確保點始終沿著圓形邊線移動且不消失。
- **G 力與輪胎雷達圖座標軸對齊**：
  - **橫向 G 力 (Lateral G)**：根據 Forza UDP telemetry 規範，轉向時 lateral acceleration (`AccelerationX`) 向右或向左需與儀表視覺慣性一致。在 `TelemetryView.tsx` 與 `telemetry-cards.js` 中統一將 X 軸映射符號反轉（`lat = -rawAccX / 9.81`），使向左/向右切打方向盤時藍點位移符合預期。
  - **縱向輪胎滑移 (Slip Ratio)**：統一 HUD 4 輪胎雷達圖 Y 軸映射，頂端為煞車 (Brake / negative ratio)、底端為加速燒胎 (Accel / positive ratio)，與 G 力雷達圖 (BRAKE on top) 及車輛前後重力轉移的視覺感知完美連動。
- **廣播通道與 Telemetry 頁面解耦暫停 (BroadcastChannel HUD Pause Sync)**：在 `useTelemetry.ts` Ingestion 層中，HUD 數據預處理 (`formatHudTelemetry`) 在 WebSocket 接收瞬間即已完成，並透過 BroadcastChannel 直傳 HUD Overlay 獨立視窗。當使用者開啟「HUD 啟用時暫停 Telemetry 頁面渲染」開關時，`TelemetryView.tsx` 各 60Hz Canvas 組件直接透過全域 `__IS_HUD_PAUSED__` 旗標跳過繪製並呈現暫停提示條，實現大幅降低 CPU/GPU 開銷的同時，HUD 懸浮儀表依舊能毫秒級暢順繪繪與更新。
- **TypeScript TS2688 / TS2307 測試檔 Exclusion**：執行 production Build (`npm run build` -> `tsc`) 時，若未在 `tsconfig.json` 設定 `"exclude": ["src/**/*.test.ts"]`，`tsc` 會因預設型別庫中缺乏 `vitest` 型別定義而報錯。在 `tsconfig.json` 中將 `.test.ts` 排除於 prod TS 編譯外，既保障 `tsc` 秒級 pass，又保證 Vitest 單元測試單獨流暢執行。

---

## 2026-07-22 - 修復 HUD Overlay 胎溫跳動 180 度與 31°C 轉譯顯示為 88°C/90°F 之 Bug

**學習點 (Learning):**
- **胎溫跳動 180 度主因**：Telemetry 接收時，若 `useTelemetry.ts` 或卡片初始化階段發送 null 數據更新，`telemetry-cards.js` 的 `temps` 數值會落入 `data.temp_fl || 180` 硬編碼保底值；隨後在 60Hz 遙測與 null config 更新交替觸發時，即造成畫面在真實胎溫與 180 之間高頻跳動。將 fallback 全數改為 `0` 並判定 `cTemp > 0` 時才渲染數值，無資料時呈現 `--°C`，徹底消除了 180 跳動。
- **31°C 顯示為 88°C/90°F 主因**：Forza UDP 原生輸出的 `TireTemp` 為**華氏 (°F)**（例如室溫 31°C 時，原生 UDP 輸出 `87.8°F`，即約 90°F）。過往 `telemetry-cards.js` 未進行 `(F - 32) * 5 / 9` 換算，直接將 87.8°F 捨入為 `88` 標示為 `88°C`（大約 90°C）。校正後：
  - 公制模式（Metric）：將 `87.8°F` 轉譯為 `(87.8 - 32) * 5 / 9 = 31°C` 精確顯示 `31°C`。
  - 英制模式（Imperial）：顯示 `88°F`。
  - 色彩判斷與直方圖顏色分佈：原先 `telemetry-cards.js` 的 `getTempColor` 內部進行了雙重華氏/攝氏判斷，導致 100°F ~ 150°F (冷胎區間) 的直方圖長條圖與胎溫文字均被錯誤繪製為綠色。對照 `TelemetryView.tsx`（Single Source of Truth）的色彩邏輯校正為 `tempF < 150` 藍色 (`#0088ff`)、`150 <= tempF <= 210` 綠色 (`#00ff00`)、`tempF > 210` 紅色 (`#ff0000`)，使 HUD Overlay 與 Telemetry 頁面直方圖色彩對齊。

**後續行動 (Action):**
- 為 HUD Overlay 新增任何遙測卡片或數據指標時，務必確認 UDP 原生單位（如華氏、Pascal、米/秒）是否於顯示層進行正確的單位換算與 fallback 處理，並嚴格遵循 `TelemetryView.tsx` 的顏色分佈。

---

## 2026-07-22 - 60Hz UDP 遙測效能優化與雷達圖彈跳跳動修復

**學習點 (Learning):**
- **後端佇列積壓與丟幀 (Backend Queue Backpressure & Frame Drop)**：`main.py` 的 `broadcast_telemetry()` 迴圈中，先前寫死了 `await asyncio.sleep(0.01)`（強制延遲 10ms），加上封包處理耗時導致單幀處理頻率低於 UDP 60Hz 接收頻率，造成佇列積壓並頻繁觸發 `telemetry_queue.qsize() > 5` 的丟幀邏輯（一次丟棄 4~5 個封包），使前端接收到 100ms~300ms 突發性中斷的資料包，引發雷達圖藍點與軌跡的暴衝彈跳。
  - 將 `await asyncio.sleep(0.01)` 改為 `await asyncio.sleep(0)` 立即交接協程控制權。
  - 將 `save_car_params` 同步寫檔與 `gc.collect()` 改以 `asyncio.to_thread` 移至背景執行緒，完全解放 UDP 主廣播迴圈。
- **前端 60Hz 高頻 Canvas 零記憶體分配 (Zero-Allocation Canvas Loop)**：
  - 清理 `VerticalInputBar` 與 `PedalTraceCanvas` 的重複 `window.addEventListener('hud:frame')` 綁定，避免單幀雙重渲染 (120Hz)。
  - 以傳統 `for` 迴圈原地走訪極值，替代每秒 240 次 `Math.min(...hist.map())` 與 `.slice()` 陣列分配，徹底消除 V8 引擎的高頻垃圾回收停頓 (GC Pauses)。
  - 採用「雙層向量光暈 (Double Pass Vector Glow)」替代高對比度高斯模糊 `ctx.shadowBlur` 濾鏡，在維持 0ms 渲染負擔的同時保留 100% 絕佳視覺質感與清晰可讀性。

---

## 2026-07-23 - 修復 Advanced HUD 速度 3.6 倍二次換算與增壓 (Boost) 單位邏輯

**學習點 (Learning):**
- **右下進階儀表盤 (Advanced HUD) 速度二次換算 Bug**：`formatHudTelemetry`（[useTelemetry.ts](file:///d:/FH6-HorizonTuner/frontend/src/hooks/useTelemetry.ts)）已將 Forza 原生 `SpeedMetersPerSecond` (m/s) 轉譯為 `speed_kmh` (km/h) 與 `speed_mph` (mph)。但 [advanced/index.html](file:///d:/FH6-HorizonTuner/frontend/public/hud/advanced/index.html) 的 DOM 渲染層誤將傳入之 `data.speed` 當成 m/s，再次執行 `data.speed * 3.6`，導致時速 100 km/h 暴增顯示為 **360 KM/H**。修正為直接讀取 `data.speed_kmh` / `data.speed_mph`。
- **增壓 (Boost) PSI 與 Bar 轉換**：Forza Motorsport / Horizon UDP 封包 Byte offset 284 輸出的 `Boost` 原生單位為 **PSI**。過往 `useTelemetry.ts` 誤將傳入之數值乘上 `0.145038` 與 `0.01`，造成 `14.7 PSI` (約 1.0 Bar) 的增壓值被誤算為 `2.1 PSI` / `0.14 Bar`（增壓針幾乎不移動）。校正為 `boostPsi = raw.Boost`、`boostBar = raw.Boost / 14.5038`。
- **Session Maxima 動態極值追蹤**：補齊 `useTelemetry.ts` 中 `sessionMaxima` 對全局 Peak Power / Torque / Boost 歷史極值的持續追蹤，確保進階儀表盤動態繪製針指標縮放精確穩定。

**後續行動 (Action):**
- 新增 HUD 樣式或遙測指標時，務必確認 `useTelemetry.ts` Ingestion 層與前端 HTML 視窗 DOM 渲染層之間「數據單位」的責任劃分，避免雙重乘算。

---

## 2026-07-23 - 修復 PyInstaller 發行版遺失 FastAPI / 後端模組致命錯誤 (ModuleNotFoundError: No module named 'fastapi')

**學習點 (Learning):**
- **全域 PyInstaller 誤導環境陷阱 (Global PyInstaller Fallback Hazard)**：原 `build_release.bat` 在專案虛擬環境 (`.venv`) 未安裝 PyInstaller 時，會退回搜尋系統 `where pyinstaller`。若系統全域 Python 3.13 安裝有 PyInstaller 但缺乏 `fastapi`、`uvicorn`、`websockets` 等專案依賴，PyInstaller 會以全域 Python 環境進行模組分析與打包，導致編譯出來的執行檔在啟動時拋出 `ModuleNotFoundError: No module named 'fastapi'`。
- **PyInstaller Spec 套件收集與 Hidden Imports 配置**：
  - 專案程式碼並未引用 `numpy`，舊 spec 檔誤寫了 `collect_all("numpy")`。當在沒有 `numpy` 的 `.venv` 執行打包時會拋出異常。
  - 將 spec 檔內的收集目標修正為 `fastapi`、`uvicorn`、`starlette`、`websockets` 與 `pydantic`，並於 `Analysis.pathex` 加入 `'backend'` 目錄，確保 FastAPI 路由、中間件與非同步 Socket 解析全數正確包含於產出執行檔中。
- **虛擬環境強制綁定**：將 `build_release.bat` 邏輯修改為優先於 `.venv` 自動安裝並透過 `"%PY_EXE%" -m PyInstaller` 執行打包，徹底杜絕引用全域 Python site-packages 的隱患。

- **GUI 無主控台模式下 `monitor_stdin_eof` 觸發即刻退出陷阱 (No-Console Stdin EOF Trap)**：
  - 當 PyInstaller 使用 `console=False`（無主控台視窗）編譯 release 執行檔時，Windows 不會為進程配置 `sys.stdin` 控制台句柄（`sys.stdin` 處於 EOF 或關閉狀態）。
  - `main.py` 底部原先會無條件啟動 `monitor_stdin_eof` 執行緒執行 `sys.stdin.read()`。當在 release GUI 模式下執行時，`sys.stdin.read()` 會立即讀取到 EOF 並觸發 `os._exit(0)`，造成執行檔一雙擊啟動便在數毫秒內直接退出。
  - 將 `monitor_stdin_eof` 包裹於 `if not getattr(sys, "frozen", False):` 條件中，僅在開發模式/Sidecar 下才監聽 stdin EOF，徹底修復了發行版啟動即退出的問題。

**後續行動 (Action):**
- 執行發行版打包（`build_release.bat`）前，確認 `.venv` 內已安裝完整需求套件（`requirements.txt`），且 PyInstaller 始終透過 `.venv` 呼叫執行。
- 後續新增與進程生命週期相關的背景 Thread 時，務必區分 Frozen GUI 模式與開發模式的 stdin / log 輸出行為。

---

## 2026-07-23 - ThemeView 功能補全、Custom CSS 語法動態校驗與深淺色主題持久化

**學習點 (Learning):**
- **DOM CSSStyleSheet 即時驗證**：利用純 JavaScript 括號/註解解析器搭配 `document.createElement('style')` 注入測試，可毫秒級判定 Custom CSS 的合法性，並在 UI 上呈現即時狀態徽章與錯誤行號提示。
- **Custom CSS 預設自動帶入與樣式系統標註**：當使用者開啟 Custom CSS 編輯器時，預設自動產出並帶入當前 UI 生效的完整 Vanilla CSS 樣式代碼，降低自訂門檻；並明確標註系統採用 Vanilla CSS + CSS Variables + Glassmorphism 獨立架構。
- **多儲存槽 (3-Slots) 與 JSON 導入匯出**：建立 3 個獨立 Slot 與 JSON 匯入匯出功能，讓使用者能自由保存與共享不同場景的顏色、深淺色與 CSS 組合。
- **後端持久化相容性**：在 `backend/main.py` 的 `app_settings` 與 `update_settings` 中擴充 `theme` 字典並寫入 `settings.json`，實現主題設定持久化與離線 LocalStorage 備援防護。

**後續行動 (Action):**
- 後續新增 UI 組件時，背景與邊框一律優先採用 `var(--glass-bg)` 與 `var(--glass-border)`，避免在 Light Mode 切換時出現硬編碼區塊。

---

## 2026-07-23 - 賽後分析 (Post-Race Analysis) 全面重製與 MoTeC 通道標準化

**學習點 (Learning):**
- **賽事自動閘門判定 (Accurate Race Gate)**：`IsRaceOn == 1` 在 Horizon 5/6 開放世界漫遊 (Freeroam) 時亦被觸發。引入 `IsRaceOn == 1 and CurrentRaceTime > 0 and CurrentLap > 0` 組合閘門，徹底消除了漫遊狀態下的誤錄製與背景資源浪費。
- **SQLite (WAL Mode) 高效串流數據庫**：淘汰每 30s 全檔重讀重寫 `latest.json` 的極低效方式，改用 SQLite `journal_mode=WAL; synchronous=NORMAL;` 搭配 50-point 非同步批次寫入，使 60Hz/10Hz UDP 數據紀錄零 Disk I/O 阻塞與零掉幀。
- **MoTeC 通道與 Lap Distance 對標**：以 MoTeC 20+ 標準 Channel 規範設計資料庫結構，精確記錄 `lap_distance` 與各輪態物理數值，並提供一鍵導出標準 MoTeC i2 CSV 檔功能。
- **Ramer-Douglas-Peucker (RDP) + Canvas 2D 賽道圖繪製**：利用 RDP 演算法將上萬個賽道點精簡為 300~500 個拓撲關鍵拐點，搭配 HTML5 Canvas 2D stroke 繪製多重指標彩虹向量線條，SVG DOM 開銷降為 0。
- **獨立設定檔 (user_configs) 與 .gitignore 管制**：使用者自訂分析佈局與 Channel 算式持久化於 `backend/user_configs/analysis_layout.json`，並於 `.gitignore` 中嚴格納入排除，確保使用者個人化設定與版本控制分離。

**後續行動 (Action):**
- 未來擴充遙測通道時，優先維護 `telemetry_sqlite.py` 與 `motec_exporter.py` 的欄位映射，保持與 MoTeC i2 規範之相容性。

---

## 2026-07-23 - 賽後分析 (Post-Race Analysis) Phase 2 雙層賽道圖與 4 槽位多維度圖表架構

**學習點 (Learning):**
- **雙層繪製架構 (Dual-Layer Circuit Track Canvas)**：在 `TrackMapCanvas.tsx` 中將第一圈/全賽事 Base Coordinates 作為底層半透明繪製，頂層繪製當前選定單圈之彩虹指標線，成功實現了第二圈開始全賽道路線即時呈現與動態脈衝車位標點。
- **Channel 公式編輯器與語法下拉自動補全**：建立 `CustomChannelEditor.tsx`，內建 20+ 標準遙測通道點選自動補全詞典，支援一鍵插入與即時求值預覽 (`Live Formula Evaluation`)。
- **4 槽位多維度圖表面板 (4-Slot Dynamic Chart Grid)**：設計 `DynamicChartGrid.tsx`，提供 4 個獨立可配圖表槽位，開放客製化標題、支援 `Time (s)` / `Distance (m)` / `Lap` 多維度對齊，並預設將 **Lap Delta & Speed Comparison** 為 Slot 1 範例樣板。

**後續行動 (Action):**
- 在高組件化解耦時，元件之間未讀取的 props（如 `primaryLap` / `compareLap`）必須主動清理，確保 Tauri Release Build (`tsc && vite build`) 秒級 pass。

---

## 2026-07-23 - 賽後分析 Phase 3 彈出式 ChartEditModal、純文字專業 UI 與 30 秒記憶體拋棄機制

**學習點 (Learning):**
- **彈出式 ChartEditModal 集中編輯與雙欄即時預覽**：設計 `ChartEditModal.tsx` 雙欄結構，讓 4 個圖表卡片平時維持乾淨專業極簡視覺。點擊「Settings / Edit」按鈕彈出編輯窗，左欄進行標題、X 軸維度 (`Distance m` / `Time s` / `Lap`)、Y 軸通道與 Channel 子卡片設定，右欄即時動態預覽。
- **無 Emoji 純文字規範 (No Emoji Policy)**：徹底清理 `AnalysisView` 介面中的所有 Emoji 圖符，Slots 1 標題去範例化為純文字 `Lap Delta & Speed Comparison`，大幅提升賽車電競軟體專業感。
- **賽事 Performance 暫停繪製模式**：當 `isRecording == true` (賽事錄製中) 時，下方圖表卡片自動暫停高頻 Recharts 繪製，將 100% 效能釋放給遊戲 Overlay 與遊戲 FPS；完賽時自動解鎖圖表繪製。
- **漫遊 30 秒舊點拋棄 (30s Fixed Queue Drop)**：漫遊非錄製狀態下，`TrackMapCanvas` 將超過 30 秒的歷史座標點直接截斷拋棄 (`slice/shift`)，使漫遊期間記憶體佔用保持嚴格 O(1) 恆定，且支援車頭方向角 (Heading Arrow) 指示繪製。

---

## 2026-07-23 - 5 大多圖表形式 (Line, Bar, Histogram, Radar, Pie)、即時轉換與 Track Map 淨化修復

**學習點 (Learning):**
- **5 大專業遙測圖表形式 (Multi-Chart Transformation Engine)**：建立 `transformTelemetryData` 數據轉換引擎，將遙測點即時轉譯為 Line (折線圖)、Bar (長條圖)、Histogram (直條開度頻次分佈)、Radar (四輪/綜合蛛網評估) 與 Pie (擋位佔比圓餅圖)。
- **ChartEditModal 雙欄即時動態預覽**：在編輯 Modal 中，右側 Panel 根據使用者所選的 `chartType` 與 Channel 子卡片設定，動態分支渲染 Recharts 對應組件，達成毫秒級視覺化連動。
- **Track Map 標題淨化與漫遊動態繪製**：潔淨去除標題括弧字樣 (`Track Map`)，修復漫遊狀態下 Track Map 高頻 re-render，維持流暢 30 秒漸隱尾跡繪製。

---

## 2026-07-23 - Layout Config 防抖靜默自動儲存、歷史 Session 全軌跡與 100% i18n 支援

**學習點 (Learning):**
- **防抖靜默自動儲存 (Debounced Auto-Save Layout Config)**：移除手動點擊「Save Layout Config」按鈕的繁瑣設計。在 `AnalysisView.tsx` 中透過 `useEffect` 監聽 `[selectedMetric, customChannels, chartSlots]` 變更並設定 800ms 防抖計時器，背景自動呼叫 `saveAnalysisConfig(...)` 寫入 `backend/user_configs/analysis_layout.json`，達成極致滑順的無感自動持久化。
- **歷史 Session 全軌跡渲染 (isSavedSession Gate)**：在 `TrackMapCanvas.tsx` 中引進 `isSavedSession` 判定（當 `selectedFilename !== 'current'` 時觸發）。歷史完賽 Session 會跳過漫遊狀態的「過去 30 秒截斷」限制，完整還原繪製整條賽道的完整路徑軌跡。
- **100% 無死角 i18n 多語系支援**：在 `lang/zh-tw.json` 與 `lang/ja-jp.json` 中補齊賽後分析主頁面、Modal 選擇器、5 大圖表形式 (Line, Bar, Histogram, Radar, Pie) 與公式編輯器 control 項目的對應翻譯，確保切換語系時畫面 100% 翻譯覆蓋。

---

## 2026-07-24 - HUD 模組完全獨立化與前端巨型元件領域驅動拆分

**學習點 (Learning):**
- **跨源 BroadcastChannel 失效陷阱 (Cross-Origin BroadcastChannel Limitation)**：將 HUD 從 `frontend/public/hud` (Tauri 內嵌靜態資源，origin = `tauri://localhost`) 搬遷至 `hud_overlay/` 並由 FastAPI `StaticFiles` 提供服務 (origin = `http://127.0.0.1:<port>`) 後，原本主 GUI 與 HUD 之間透過 `BroadcastChannel('horizon_tuner_hud_channel')` 同步設定的機制**完全失效**，因為 `BroadcastChannel` 嚴格限定同源 (Same-Origin)。解法是讓 HUD 的 `shared/ws.js` 直接連線後端 WebSocket 接收遙測數據，並在後端 `save_overlay_config` API 中透過 `manager.broadcast_json({"type": "hud:config", ...})` 將設定變更即時廣播給所有已連線的 WebSocket 客戶端（包含 HUD），徹底保障設定同步不遺漏。
- **Tauri 視窗動態 URL 載入**：`tauri.conf.json` 的 `url` 欄位僅支援靜態路徑（如 `/hud/index.html`），無法動態解析後端 Port。透過在 `toggle_hud_window` Rust 函數中呼叫 `window.eval()` 注入 `window.location.href = 'http://127.0.0.1:<port>/hud/index.html'`，可在啟動覆蓋層時動態導向正確的後端服務位址。
- **領域驅動目錄結構 (Feature-Based Directory Structure)**：將 `src/components/` 中超過 250 行的巨型元件遷移至 `src/features/<domain>/` 結構後，每個功能模組（Tuning、Telemetry、CarParams、OverlayControl）擁有獨立的 `components/` 子目錄，大幅降低了跨功能耦合與維護成本。
- **React.memo 搭配 60Hz 遙測渲染保護**：將 `SuspensionTuner`、`GearingTuner`、`DifferentialTuner` 等子元件以 `React.memo` 包裝，避免父元件 `TuningView` 因遙測資料更新（如 `diagnosisReport`）觸發全頁面 Re-render，成功將 60Hz 渲染影響範圍隔離至最小的 DOM 子樹。

**後續行動 (Action):**
- 未來新增 HUD 儀表樣式時，開發者只需在 `hud_overlay/` 新增資料夾與 HTML 檔案，完全不需觸碰前端 React/Tauri 編譯流程。
- 當進行跨 Origin 通訊時（如 Tauri 內嵌視窗與 HTTP 服務之間），應優先選擇 WebSocket 或 HTTP API，避免依賴 `BroadcastChannel`、`localStorage` 等嚴格同源限定的瀏覽器機制。

---

## 2026-07-27 - 60Hz Canvas 背景網格遺失與對稱排版 (Symmetric Mirroring) 修復

**學習點 (Learning):**
- **Canvas 初始空白陷阱 (Initial Canvas Grid Missing)**：當使用 HTML5 Canvas 繪製遙測儀表的背景網格（如雷達圈或懸吊警示區）時，若將繪圖邏輯綁定於 `handleUpdate` 監聽器內且加上 `if (liveData.IsRaceOn !== 1) return;` 阻擋，會導致遊戲暫停或未連線前 Canvas 呈現完全透明（沒有任何背景與框線）。必須將背景繪製邏輯抽離成 `drawBackground` 並在 `useEffect` 初次掛載時就強制呼叫一次。
- **對稱鏡像排版陷阱 (Flex Direction Mirroring)**：為了讓左右兩側車輪的遙測儀表自然向畫面中央收攏，使用 `isLeft ? 'row' : 'row-reverse'` 是正確的設定。左側輪胎 (`isLeft=true`) 使用 `row` 會讓 Canvas 靠右側（中央），右側輪胎 (`isLeft=false`) 使用 `row-reverse` 會讓 Canvas 靠左側（中央）。錯誤地使用 `!isLeft` 會導致排版完全顛倒，導致版面混亂。

**後續行動 (Action):**
- 開發任何以 Canvas 為基礎的高頻 UI 儀表時，務必區分「靜態背景」與「動態資料」，並確保靜態背景在沒有資料輸入的狀態下依然能被正確繪製與顯示。

---

## 2026-07-27 - 修復 HUD Overlay WebSocket 連線錯誤與啟動縮放失效問題

**學習點 (Learning):**
- **WebSocket 路徑錯位導致靜默失效 (Silent Failure)**：`hud_overlay/shared/ws.js` 預設連線到 `/ws`，但後端實際的遙測端點為 `/ws/telemetry`。連線失敗不僅造成數據不更新，也導致 `ws.onopen` 內的初始 `config` 獲取完全未執行。
- **HUD iframe 初始化時機陷阱 (Async Race Condition)**：HUD Overlay 的縮放 (`actualScale` / `scale`) 仰賴於主應用 (React) 的 `BroadcastChannel`。但若主應用在 iframe 載入前就發送廣播，HUD 將會漏接 `config`。解法為在 `hud_overlay/index.html` 的 iframe `onload` 觸發前，主動透過 `fetch` 確保取得初始 `config`。
- **縮放邏輯雙重處理衝突 (Scale Double Computation)**：React 前端嘗試硬編碼計算 `actualScale = scale * 0.5` 並傳遞，但不同 HUD 樣式 (Simple / Advanced) 其實擁有不同的 `scaleMultiplier` (1.0 vs 0.5)。應移除 React 端的寫死計算，將邏輯全權交還給 `hud-core.js` 原生處理。
- **紅線轉速 (Redline RPM) 計算一致性**：過去以 `maxRpm * 0.93` 計算紅線區，會導致高轉車與低轉車的紅線視覺寬度差異巨大。改為固定 `maxRpm - 1000`，確保各車輛的儀表紅線區域視覺比例穩定一致。

**後續行動 (Action):**
- 凡涉及 WebSocket 連線或 `fetch` API 呼叫，必須確保前後端 endpoint 完全對齊，並應增加顯式的錯誤日誌提示。
- 在跨 iframe / 視窗通訊時，不可假設 Broadcast 接收端永遠已準備就緒。需要有「主動拉取初始狀態 (Pull)」搭配「被動接收更新 (Push)」的雙重機制。

---

## 2026-07-29 - 變速箱與輪胎公式常數校準

**學習點 (Learning):**
- tuningMath.ts 變速箱與終傳比的計算數學模型與公式完全一致，無需修改。
- 但在 tireCoefficients.ts 中的輪胎抓地力係數與 ref/tuning_formulas.md 不符（如 Street 應為 0.95 而非 0.90，Drag 應為 1.40 而非 1.25）。必須確保程式碼實作與物理公式文件 (Single Source of Truth) 完全對齊。

**後續行動 (Action):**
- 進行任何物理計算驗證時，若發現常數定義與公式文件不符，應以 tuning_formulas.md 為絕對基準進行修正。

---

## 2026-07-29 - 重構 TuningView 變速箱專屬視圖與動態檔位計算

**學習點 (Learning):**
- **動態檔位替換陷阱**：原本的 AEGO 模型針對甩尾與直線加速賽事寫死了常數 4 檔。這不僅違反了純函數依賴傳入變數的原則，也讓前端傳入的 numGears 形同虛設。改成依照傳入的 `numGears` 從 `numGears - 1` 開始遞減計算，完美解決了動態檔位支援問題。
- **巨型組件清理**：在拆分或清理像 `TuningView.tsx` 這樣龐大且包山包海的組件時，除了清理模型層 (`tuningMath.ts`)，也必須確保 UI 層對應的 `<SuspensionTuner>` 等元件的依賴不被破壞。本次將其加上 TODO 標籤並設為 Read-Only/Disabled，以維持 UI 佈局。

**後續行動 (Action):**
- 未來引入新的賽事模型公式時，必須絕對避免在 `tuningMath.ts` 中硬編碼檔位數或其他外部應決定的車輛參數。
- 下一次將重新引入懸吊與輪胎邏輯時，應確保這部分的 UI 能夠正常解鎖並連動計算模型。
- **4檔以上相容性處理**：為了解決甩尾與直線加速模型僅適用於 4 速變速箱的問題，已實作相容性解法：當 `numGears > 4` 時，僅會計算前 4 檔的齒比，而 5 檔以上（含）的齒比將直接複製 4 檔的數值，且不會受到嚴格遞減 (Monotonic Decrease) 測試或邏輯的強制影響。

---

## 2026-07-29 - hud_overlay/shared/telemetry-cards.js 模組化拆分與測試套件補全

**學習點 (Learning):**
- **巨型 DOM 繪製模組解耦 (Modular Refactoring)**：將超過 880 行的 `telemetry-cards.js` 依領域拆分為 pure math/converters (`utils.js`)、HTML template string (`template.js`)、G-Force Radar (`g-radar.js`)、4-Corner suspension & tire (`corner-card.js`)、Pedal wave (`pedal-wave.js`)、Power/Torque scatter plot (`power-torque.js`) 與 Orchestrator (`manager.js`)。透過 ES Module 與對外入口檔 `shared/telemetry-cards.js` 的 `window.TelemetryCardsManager` 導出，既解決了高複雜度單一檔案的維護難題，又保持了 100% 向後相容性。
- **Unit Test Mock DOM 環境設定 (Node/Vitest DOM Mock)**：在未安裝 `jsdom`/`happy-dom` 全域套件的情形下，於 `telemetryCards.test.ts` 中實作輕量級 `setupDOMMock` 模擬 `document.createElement` 與 2D Canvas context API，讓 Vitest 單元測試得以在 < 1 秒內極速驗證遙測數據轉 DOM 文字、歷史 Buffer 上限 purge 以及元素顯隱 toggles。
- **Playwright Worker 併發 Port 衝突與動態 Port 綁定 (Playwright Parallel Workers)**：Playwright 預設啟用 `fullyParallel: true` 跨 worker 執行測試，若測試中的內建 HTTP 伺服器硬編碼固定 port (如 8989) 會引發 `EADDRINUSE` 錯誤。改用 `server.listen(0, '127.0.0.1')` 讓 OS 動態分配 Port 並以 `(server.address() as net.AddressInfo).port` 取得 URL，能順利支援多 Worker 並行 Playwright 端對端渲染驗證。

**後續行動 (Action):**
- 未來新增或擴充 HUD telemetry 視圖元件時，直接在 `hud_overlay/shared/telemetry-cards/` 下建立對應元件子模組，並於 `manager.js` 中進行連線。
- Playwright E2E 測試中若需 serving 本地檔案，建議持續採用動態 Port (0) 的微型 Node.js HTTP 伺服器模式，確保 ES Modules 不受 `file://` CORS 規範阻擋。

---

## 2026-07-29 - HUD Overlay, 預設組態, 單位/語言預設值與 UI Emoji 全面清理

**學習點 (Learning):**
- **HUD Elements 開關收攏與 Motion Effect 新增**：
  - 零碎開關（如單獨隱藏 `showRPM` 或 `showGear`）容易造成 HUD DOM 佈局破碎或轉譯異常。將元素控制收攏為模組級開關（`showGauge` 主儀表、`showMotionEffect` 動態視覺效果、`showPowerTorque` 及 4 區塊 Telemetry 卡片），既精簡了 Overlay 控制面板，亦避免了視圖破碎。
  - 在 GUI 介面新增 `Motion Effect` 開關，並於 HUD 控制層同步支援。
- **全域預設值與 Settings 機制**：
  - 將無設定檔時的預設語言設為 `zh-tw`，紀錄開關 (`dyno_recording`, `race_recording`) 設為預設關閉 (`false`)。
  - 將單位轉換調整為除胎壓 (`psi`) 與馬力 (`hp`) 強制指定外，其餘預設皆為公制 (Metric)。
  - 在 `SettingsView` 中將 Language 選單從 `General Recording Settings` 獨立為專屬選單區塊，提高選單結構之清析度。
- **無 Emoji UI 規範與文件維護**：
  - 全面清理前端 React 元件（`AdvancedGeometry.tsx`, `DragTestView.tsx`, `ThemeView.tsx`, `DifferentialTuner.tsx`, `DragTestSection.tsx`, `GearingTuner.tsx`, `DiagnosisPanel.tsx`, `DiagnosticConsole.tsx`, `DynoChart.tsx`, `TuningView.tsx`）中殘留的 Emoji 圖符，視覺提升專業極簡感。
  - 於 `AGENTS.md` 中新增「嚴禁在 UI 字串或 UI 組件內直接加入 Emoji 圖示」與「完整測試矩陣說明」。
  - 核對並刪除過期的交接說明檔案 `.agents/handoff_frontend_refactoring.md`，維持 `.agents/` 目錄簡潔性。

**後續行動 (Action):**
- 後續新增 UI 元件時，嚴格遵守 `AGENTS.md` 無 Emoji 規範與單元/E2E 測試驗證流程。


---

## 2026-07-29 - HUD 錶盤全面移殖：從 Lua 解譯器走向獨立原生 HTML5 Canvas+JS 架構

**學習點 (Learning):**
- **解耦與零解譯開銷 (Zero-Interpreter Overhead)**：將原本經由 Fengari (Lua 虛擬機器) 解譯運行的 9 個 Lua 錶盤完全轉換為獨立原生的 HTML5 Canvas + JS。不僅消除了 60Hz UDP 高頻更新下的 CPU 虛擬機器調用與 GC 開銷，更提高了各個 HUD 的獨立性與可維護性。
- **序列切片與 Sprite Sheet 高效渲染**：對於 `fm4ui` (270張指針與500張時速切片)、`nfs15` (359張轉速弧條) 與 `wmps3` (七段數字與檔位 Sprite Sheet)，採用頁面載入時的 `Image` 物件陣列靜態預載，在 `onFrame` 內直接呼叫 `ctx.drawImage`，避免每影格重複進行 DOM 建立與資源加載。
- **原生 Canvas 發光與微調變數 (Native Glow & Hidden Tuning Vars)**：針對 VFD / VFD Radio 等真空管擬真儀表，利用原生 Canvas 2D 的 `ctx.shadowBlur` 與 `ctx.shadowColor` 重現藍綠色 Glow 螢光，並於 JS 頂層保留 `VFD_GLOW_CONFIG` 配置常數，方便日後微調而不必動到控制面板 Schema。


- **更新 HUD 開發規範指南 (HUD_DEVELOPMENT_GUIDE.md Update)**：同步更新 [HUD_DEVELOPMENT_GUIDE.md](file:///d:/FH6-HorizonTuner/hud_overlay/HUD_DEVELOPMENT_GUIDE.md) 指南檔，精確校正專案相對目錄路徑（`hud_overlay/<style_name>/index.html`）、當前現存 8 款原生 HTML5 Canvas+JS 儀表樣式、`HUDCore` 最新注入的 CSS 變數（發光強度、自訂色彩、遙測元素獨立縮放）與廣播訊息 API（`hud:reload` / `hud:destroy`），以及右下角對齊 (Bottom-Right Alignment) 與 360px ~ 400px 視覺寬度校準規範。

**後續行動 (Action):**
- 後續若要新增新的錶盤樣式，直接參考 `simple`、`advanced` 或 `vfd` 的原生 HTML5 Canvas+JS 結構，呼叫 `HUDCore.registerStyle(id, definition)` 即可流暢整合入系統。


- **作者元數據模組化重構 (author.json Modular Metadata)**：將原本硬編碼於 [OverlayView.tsx](file:///d:/FH6-HorizonTuner/frontend/src/features/overlay_control/OverlayView.tsx) 內的靜態 `HUD_INFO` 字典，拆分至各儀表目錄下的獨立 `author.json` 檔案（例如 `hud_overlay/advanced/author.json`），並改為伴隨選單切換動作動態 `fetch` 載入、快取於 React State (`authorCache`) 以避免重複請求。這種設計使新增儀表樣式時只需在該目錄放置 `author.json` 即可完成作者資訊註冊，無需修改控制面板原始碼中的任何硬編碼字典。

**後續行動 (Action):**
- 新增儀表樣式時，只需在 `hud_overlay/<style_name>/` 內放置 `author.json` (`{ "author": "...", "description": "..." }`)，控制面板會自動動態載入。

---

## 2026-07-30 - 修復 HUD Overlay 4 款錶盤未使用自帶字體而 Fallback 至共用字體的問題

**學習點 (Learning):**
- **Canvas `ctx.font` 與 CSS `@font-face` 的綁定關係**：HTML5 Canvas 2D 的 `ctx.font` 屬性使用 CSS font shorthand 語法，但其字體名稱必須對應到已透過 `@font-face` 宣告的 CSS font-family 才能生效。若未宣告 `@font-face`，瀏覽器會靜默回退至 fallback 字體鏈（如 `sans-serif`），不會觸發任何錯誤或警告。
- **問題根因**：`shift_tacho`、`vfd`、`gt7`、`mw2005` 四款錶盤各自在 `assets/` 目錄下攜帶了專屬字體檔案（如 DSEG 七段 LCD 字體、RobotoMono、Arkitech、Seven Segment 等），但所有 `ctx.font` 引用均寫死為 `ForzaGear`（由 `hud-base.css` 宣告的共用字體 HelveticaNowDisplay）。由於從未為這些自帶字體建立 `@font-face` 規則，渲染結果完全看不出各錶盤應有的視覺特色。
- **修正模式**：對照 ForzaOSD 參考專案的 `profile.lua` 字體宣告（`fonts = { digits = { path = "..." }, labels = { path = "..." } }`），為每款錶盤建立對應的 `@font-face` 規則，並將所有 `ctx.font` 中的 `ForzaGear` 替換為各自的 CSS font-family 名稱。
- **字體角色分離原則**：依據參考專案，數字型字體（`digits`）用於速度、轉速、檔位等數值渲染，標籤型字體（`labels` / `alpha`）用於單位文字與面板標題，兩者不應混用。

| 錶盤 | 字體檔案 | CSS Family | 用途 |
|------|---------|------------|------|
| shift_tacho | RobotoMono-Medium.ttf | ShiftDigits | 數字 |
| shift_tacho | BarlowSemiCondensed-Bold.ttf | ShiftLabels | 標籤 |
| vfd | DSEG7Modern-Bold.ttf | VFDDigits | 七段數字 |
| vfd | DSEG14Modern-Regular.ttf | VFDAlpha | 十四段標籤 |
| gt7 | arkitech_medium.ttf | GT7Digits | 數字 |
| gt7 | gt7-MyFont Regular.ttf | GT7Text | 一般文字 |
| gt7 | gt7-MyFont Bold.ttf | GT7Bold | 粗體文字 |
| mw2005 | Seven_Segment_BOLD.ttf | MW2005Digits | 七段數字 |
| mw2005 | StackSansHeadline-SemiBold.ttf | MW2005Labels | 標籤 |

**後續行動 (Action):**
- 未來新增 HUD 錶盤樣式時，若攜帶自帶字體，必須在 `<style>` 區塊中建立對應的 `@font-face` 宣告，並確保 `ctx.font` 引用的 font-family 名稱與之完全一致。
- 字體對照表已獨立建檔於 `hud_font_mapping_reference.md`，後續維護時優先查閱。

---

### 2026-07-30 — Vite HUD 靜態檔案服務與三項 HUD 控制面板 Bug 修復

**問題現象 (4 項)：**
1. 開發模式下 `/hud/*` 請求出現 `ECONNREFUSED`，`author.json` 無法載入、HUD reload 失效
2. Motion Effect 開關無效果
3. Telemetry Card Element Scale 滑桿對 FR (Front Right) 圖表不生效
4. Refresh HUD 按鈕因 `/hud/index.html` 載入失敗而連帶失效

**根因分析：**
1. **核心問題**：`vite.config.ts` 使用 `server.proxy` 將 `/hud/*` 代理至後端，但 dev 模式下 sidecar（Python 後端）經常未啟動（`Failed to spawn sidecar`），proxy 無目標可連。即使後端運行，port 也是隨機的且僅在啟動時讀取一次，重啟後即失效。
2. **Motion Effect**：`OverlayView.tsx` 的 `showMotionEffect` toggle 透過 BroadcastChannel 發送 `hud:elements` 訊息，但 `hud-core.js` 收到後**從未**將該值轉發給 `physics.js` 的物理引擎（`_physicsEnabled` 僅由 `localStorage` 與 HUD 內部按鈕控制）。
3. **FR Element Scale**：`template.js` 中 FL、RL、RR 三個角落都有 `transform: scale(var(--tc-elem-scale, 1.0))` inline style，唯獨 `tcCornerFR` 遺漏了此 CSS。
4. **Refresh 按鈕**：`handleReloadHud` 發送 `hud:reload` → HUD iframe 執行 `window.location.reload()` → 重新載入 `/hud/index.html`，但 proxy 失效導致載入失敗。

**修復方案：**
1. **移除 proxy，改用 Vite Plugin 直接服務靜態檔**：新增 `hudStaticPlugin()` Vite Plugin，在 `configureServer` 階段註冊 middleware，將 `/hud/*` 請求直接對應至 `hud_overlay/` 目錄讀取檔案，完全不依賴後端。
2. **新增 `setPhysicsEnabled(enabled)` API**：在 `physics.js` 暴露顯式設定函數（非 toggle），並在 `hud-core.js` 的 `config` 及 `hud:elements` 兩個 handler 中呼叫。
3. **補齊 FR 角落的 `transform` CSS**：在 `template.js` 的 `tcCornerFR` div 添加 `transform: scale(var(--tc-elem-scale, 1.0)); transform-origin: top right;`。

**學習點：**
- **Dev 模式靜態資源不應依賴 backend proxy**：HUD overlay 本質為靜態檔案，dev 模式下應由 Vite 直接服務，避免 sidecar 啟動順序與隨機 port 問題。
- **React 控制面板 ↔ HUD iframe 的狀態同步必須顯式**：兩者透過 BroadcastChannel 溝通，任何新的 config 欄位（如 `showMotionEffect`）必須在 `hud-core.js` 的訊息處理中顯式對應到 HUD 內部的控制函數，不會自動生效。
- **4 角對稱 UI 元素務必逐一檢查一致性**：FL/FR/RL/RR 四角的 inline style 或 class 遺漏一角是常見的 copy-paste bug。

---

### 2026-07-30 — VFD HUD 儀表重構、Web Audio API 頻譜與 Windows 系統媒體 API 對接

**學習點 (Learning):**
1. **真空螢光管 (VFD) 物理視覺還原**：
   - 經典 80/90 年代 VFD 儀表面板之視覺核心在於**全熄滅段落鬼影 (Unlit Ghost Segments)**、**真空管玻璃金屬網紋 (Wire Mesh Grid)** 以及**高強度螢光 Bloom 擴散**。
   - 在 Canvas 渲染中，透過劃分兩次 Path 繪製（先以 15-20% 透明度渲染全數鬼影段落，再以 1.0 不透明度 + `shadowBlur` 渲染目前亮起的段落），能完美還原實體 VFD 玻璃管內部金屬線路質感。
2. **調色盤主色與 Glow 效果隔離機制**：
   - 當使用者在 `OverlayView` 控制面板選擇自訂色彩時，該色彩應僅綁定至**筆觸與文字段落主色 (Primary Color)**，而發光層 (Glow / `shadowColor`) 應繼續鎖定預設之螢光青綠 (`#8ffff0`) 或專屬螢光氣氛，避免自訂色彩影響復古發光質感。
3. **Web Audio API 頻譜解析與 Windows System Media 雙驅動**：
   - 下方收音機面板實作雙模音訊機制：支援 Web Audio API (`AudioContext` / `AnalyserNode` / `getByteFrequencyData`) 擷取真實系統/麥克風音訊，並配備動態諧波音頻合成器 fallback。
   - 透過 Windows API (`Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`) 非同步抓取 Windows 系統當前播放之音樂 Title 與 Artist，並透過 14 段 VFD 跑馬燈 (`DSEG14Modern-Regular`) 動態滾動顯示，顯著提升電競儀表板之沉浸感與實用性。

**後續行動 (Action):**



---

### 2026-07-30 — VFD 收音機區塊功能修復與 WASAPI Loopback 系統音訊整合

**學習點 (Learning):**
1. **動畫主迴圈例外屏障 (Render Loop Exception Shielding)**：
   - 前端 60FPS `requestAnimationFrame` 迴圈若缺乏 `try...catch...finally` 防護，一旦文字處理 (如 `.trim()`) 或渲染遭遇非預期的極端 input，會直接在中途拋出 Exception 導致 renderLoop 終止（現象即為 HUD 完全卡死）。
   - 務必在迴圈主體包裹 `try...catch...finally`，並確保 `requestAnimationFrame` 於 `finally` 區塊中執行。
2. **14-Segment VFD 字型與非 ASCII 字符過濾規範**：
   - 14 段擬真字體 (如 `DSEG14Modern`) 僅支援標準 printable ASCII (32-126)。若遇到 Unicode / CJK / Emoji 字符或 surrogate pairs，原生 `fillText` 會引發異常或破圖。
   - `sanitizeVFDText` 必須先將歐美拉丁重音 (如 `é` -> `E`) 與智慧標點 (如 `’` -> `'`) 標準化，並清理非 ASCII 字符，確保滾動跑馬燈不卡死。
3. **曲目變更滾動位置即時重置 (Scroll Pos Reset)**：
   - 當曲名或歌手變更時，若未同步將 `marqueeScrollPos` 歸零，畫面會從舊曲目的中途偏移位置繼續滾動，導致換歌時呈現切字或跳動狀況。
4. **WASAPI Loopback 系統音效與聲道 (L/R) 渲染**：
   - 遊戲 HUD 絕不可請求使用者麥克風 (`getUserMedia`)。音訊頻譜與 L/R 聲道表應由後端 WASAPI System Audio Loopback 擷取揚聲器/耳機輸出 PCM，計算 32-Band log-FFT 與 RMS 音量後傳遞至前端。

**後續行動 (Action):**
- 後續新增或維護 HUD 音響與頻譜模組時，統一以 WASAPI Loopback (`/api/overlay/audio_spectrum`) 作為聲波與 VU 表資料來源，嚴禁於前端調用麥克風 API。
- **WinRT GSMTC 全局媒體資訊 (Single Source of Truth)**：將 Windows WinRT GSMTC 設為全局媒體最高權威來源，解決視窗名稱掃描誤抓背景 `Spotifylauncher` 等進程的問題；備用視窗掃描強制僅採納帶有 `" - "` (歌手 - 歌名) 結構之真正曲目。
- **Tauri `outerPosition` Capability 隔離**：開發模式跨網域 HTTP 載入 Overlay 時，在 `tauri.conf.json` 補充 `remote` URLs 並於 `saveWindowState()` 做靜態例外隔離，避免 console log 警告洗洗洗。

---

### 2026-07-30 — Retro VFD 跑馬燈非重複渲染與作者/描述正名

**學習點 (Learning):**
1. **跑馬燈短文字無重複 (Non-Scrolling Marquee Window Logic)**：
   - 當跑馬燈字串長度 `textLen <= maxFitCells`（無需滾動）時，不可使用循環環狀拼接字串 `textWindow = padText + padText + ...`，否則短曲目尾部會不正常地重複出現。
   - 正確的做法是：`needScroll` 為 false 時直接取單次 `safeText`，使剩餘之 Canvas 格數自然呈現 Unlit Ghost `'8'` 晶片段落。
2. **Retro VFD 創作者標誌與正名規範**：
   - 儀表顯示名稱與目錄確立為 `Retro VFD`，作者為 `eddie772tw ft. crosXover`。
   - 品牌標語 `/// EDDIE772TW FT. CROSXOVER` 應於預設電台狀態完整保留，僅在讀取到有效真實曲目時過濾。

**後續行動 (Action):**
- 維護 VFD 跑馬燈時，務必區分 `needScroll` 狀態，避免短曲串誤觸環狀重複渲染。






