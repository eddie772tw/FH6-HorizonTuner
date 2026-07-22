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
