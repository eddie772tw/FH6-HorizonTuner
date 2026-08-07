# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

本文件用於記錄與歸納 Agent 在 FH6-HorizonTuner 開發過程（含 `.jules/` 歷史模組）中積累的**核心學習點（Critical Learnings）、無障礙規範與安全避坑指南**。

---

## 記錄準則

只有在遇到以下情況時才新增日誌紀錄：
1. 發現 Forza UDP 遙測數據的包結構、位元偏移 (Byte Offset) 或單位換算陷阱。
2. 嘗試了某種車輛物理/齒輪調校演算法優化，但出現物理奇異點或極端邊界問題。
3. 發現 Tauri / WebSockets / HTML5 Canvas 高頻數據傳遞造成的 UI 影格率（FPS）下降、GC 停頓或高 DPI 錯位。
4. 前後端跨語言（Python <-> TypeScript）數據對齊、 Halfmoon UI 佈局、ARIA 無障礙或 CI/CD 打包的安全與 Anti-pattern。

---

## 一、UDP 高頻遙測、Canvas 繪圖與 60Hz 效能領域

### 1. UDP 封包位元偏移 (Byte Offset) 與單位歸一化陷阱
* **學習點 (Learning)**：
  - Forza Horizon UDP 遙測原生輸出的數據單位包含：車速 ($m/s$)、壓力 ($\text{Pascal}$)、胎溫 ($\text{華氏 °F}$) 與懸吊行程 ($0.0 \sim 1.0$ 正規化比率)。
  - 若在前端 Step 5 自動校準或 UI 組件中直接讀取 UDP 華氏胎溫且使用者設定為攝氏 ($\text{°C}$)，會導致數字暴增（如 195 變成 195°C），引發嚴重的溫差與過熱診斷誤判。
* **後續行動 (Action)**：
  - 所有 UDP 遙測數據在 Ingestion / Diagnosis 層必須先完成物理單位歸一化（華氏轉攝氏 $\text{°C} = (F - 32) \times \frac{5}{9}$、$\text{Pa} \to \text{PSI}$），並將診斷門檻數值與顯示單位解耦。

### 2. WebSocket 併發寫入與 React Unmount 重連迴圈防護 (來自 Jules/bolt.md)
* **學習點 (Learning)**：
  - **併發寫入崩潰 (Concurrent Write Crashes)**：高頻後端 asyncio 廣播任務（如遙測 vs Overlay 狀態）同時向同一個 WebSocket 端點寫入會破壞 Frame Header，強迫客戶端斷線。
  - **Unmount 無限重連 (Unmount Reconnect Loop)**：若 WebSocket 在 `onclose` 處理函式中無腦重連，React 生命週期 Unmount 觸發 socket 關閉時，會啟動背景無限重連迴圈，在 Console 拋出連線警告。
  - **純 JS 重連隔離**：全域單一連線重連會導致斷開一個 Socket 即重複重連所有 Socket。
* **後續行動 (Action)**：
  - 按數據類型 (`/ws/telemetry` vs `/ws/overlay`) 解耦成獨立 `ConnectionManager` 端點。
  - React 組件 Cleanup 時務必將 `.onclose` 與 `.onerror` 設為 `null`，且在 `setTimeout` 重連前確認訂閱計數 $> 0$。原生 JS 為各連線封裝獨立重連函式與定時器。

### 3. 60Hz 迴圈 GC 停頓、CSS Transition 衝突與 DOM 快取 (來自 Jules/bolt.md)
* **學習點 (Learning)**：
  - **高階陣列方法 GC 壓力**：在 60Hz `requestAnimationFrame` 繪圖迴圈中，使用 `.filter()`, `.map()`, `.forEach()`, `Object.keys()` 或 `split('').map().join()` 會每影格分配 Closure 與臨時陣列，引發巨量 Garbage Collection (GC) 停頓與畫面卡頓。
  - **60Hz CSS Transition 衝突**：Updated at 60Hz 的 DOM 元素若保留 CSS `transition` 樣式，會與瀏覽器補影格引擎衝突，產生劇烈畫面抖動與運算開銷。
  - **DOM & CSS Property 快取防護**：盲目在 60Hz 迴圈中寫入 `innerHTML` 或調用 `style.setProperty()` 會觸發無謂的 layout thrashing。
* **後續行動 (Action)**：
  - 60Hz 繪圖迴圈一律使用原生 `for` 迴圈與變數累加；高頻 DOM 元素**強制移除 CSS `transition` 樣式**。
  - 實作快取檢查 `if (_lastValue === value) return;` 與 CSS 屬性快取物件，數值變更時才執行 DOM 寫入。

### 4. Canvas High-DPI (DPR) 雙重尺寸同步與 0% 基線對齊
* **學習點 (Learning)**：
  - 避免使用 React State 重繪控制 Canvas 解析度；當 ResizeObserver 觸發時，應直接寫入 Canvas 實體 Buffer 像素尺寸 (`canvas.width/height = cssSize * dpr`)。
  - 繪製動態波形圖時，定義明確內邊距 (`padTop`, `padBottom`)，繪圖高度由 `plotH = h - padTop - padBottom` 推算。所有虛線、散佈點與數據 Y 座標統一以此區間計算，並顯式繪製 0% Bottom Baseline。
  - 繪製 HUD 動態表盤時，使用原生 Canvas API (`arc`, `fillText`, `rotate`) 替代數百張 Sprite 圖片序列，降低記憶體與載入延遲。

### 5. Drift HUD / Overlay Viewport 幾何與 G-Force 雷達防扁變形
* **學習點 (Learning)**：
  - 採用 `.hud-root-wrapper` 搭配 1680px x 640px 標準 `.hud-gauge-container`（`transform-origin: bottom center;`），使 HUD 視效隨 `scaleMultiplier` 自適應放縮。
  - 轉速紅線區：表盤上限向上取整至千轉；$maxRpm \ge 10000$ RPM 時紅線跨度 1500 RPM，$maxRpm < 10000$ RPM 時跨度 1000 RPM。
  - G-Force 雷達：計算出的直徑 `clampedSize` 同步寫入外圍 HTML 圓 DOM style 寬高，並加入 `aspectRatio: '1 / 1'` 防範 Flexbox 將雷達壓扁成橢圓。

---

## 二、車輛物理調校與 AEGO 齒比演算法領域

### 1. AEGO 齒比動力帶包絡線與紅線極速轉速比例鎖定
* **學習點 (Learning)**：
  - 遊戲顯示的 `simulatedTopSpeed` 為紅線轉速 (`maxRpm`) 下的實體極速。計算終傳比時需乘以 $\frac{maxHpRpm}{maxRpm}$ 縮放至 Peak HP 轉速，避免終傳比偏離。
  - 齒比步階比率上限必須嚴格限制為 $r_{\text{Max}} \le r_{\text{redline}} = \frac{maxHpRpm}{maxRpm}$，防止高檔位升檔後起始轉速凸出於動力帶區間之外。
  - 末檔齒比不寫死，改由 1 檔與 $r_{\text{step}}$ 幾何連續遞推，並使用縮放因子 $s = \left(\frac{G_{top}}{G_1 \prod r_{raw}}\right)^{\frac{1}{N_{steps}}}$ 重分佈中間檔位。

### 2. Drag / Chassis 物理姿態 (Forward Rake) 與過載抑制
* **學習點 (Learning)**：
  - 直線加速 (Drag) 姿態實測最佳為 **前低後高 Forward Rake** ($H_{min\_f} / H_{max\_r}$)，以降低前軸迎風阻力與抬升力；前彈簧適度偏軟允許抬頭，後彈簧極硬 (90%) 抑制縱向蹲下過載。
  - 防傾桿設定為 **$ARB_f = 1.0, ARB_r = 65.0$**，可強烈抑制引擎高馬力輸出引起的車身對角歪斜 (Torque Twist)。

### 3. 下壓力經驗推導 (`resolveAeroDownforce`) 與二次修正
* **學習點 (Learning)**：
  - 當 UI 無下壓力數據 ($Aero \le 0$) 時，以車重 20% (lbs) 總下壓力目標結合重量配比與驅動偏置 (RWD 0.82, FWD/AWD 1.05) 自動導出前後軸下壓力。
  - 二次修正機制以 Peak HP 轉速之有效極速鎖定頂檔總傳動比，達成 100% 閉環動力帶覆蓋。

### 4. 單元測試動態解耦原則
* **學習點 (Learning)**：
  - 測試案例不可將車輛參數（如 3847 Mustang）硬編碼於數字斷言中。應改為依據 `carParams` 動態計算物理邊界與相對關係斷言（如 `speedAtRedlineKmh <= softMaxSpeed + 0.5`），防範資料庫更新導致 false fails。

---

## 三、Halfmoon CSS 設計系統、UI/UX 與 ARIA 無障礙領域

### 1. ARIA 無障礙控制與按鈕規範 (來自 Jules/palette.md)
* **學習點 (Learning)**：
  - **自訂 Toggle/Switch**：單純用 `<label onClick>` 或 `<div>` 缺乏鍵盤 Tab 焦點與螢幕閱讀器宣告。必須背靠視覺隱藏 (`.sr-only`) 的原生 `<input type="checkbox">`，配合 `:focus-visible` 全域樣式。
  - **Icon-only 按鈕**：關閉或圖示按鈕必須設置明確 `aria-label`（如 `aria-label="Close"`）；符號建議使用 HTML Entity `&times;` 而非硬編碼 Unicode 字元。
  - **視圖頁籤 (Navigation Tabs)**：切換頁籤必須動態加上 `aria-current="page"` (或 `"true"`) 指明當前選取狀態。
  - **Disabled 按鈕 Tooltip 防護**：Firefox 等瀏覽器會在 `disabled` 按鈕上吃掉 pointer 事件，導致直接加在按鈕上的 `title` 無法顯示。應以 `<span>` 包裹停用按鈕，於 `span` 設定 `title` 與 `cursor: 'not-allowed'`（按鈕上 `pointer-events: none`）。
  - **點擊觸發範圍 (Fitts's Law)**：設定選單中包含 Checkbox 的整行一律包裹於 `<label style={{ cursor: 'pointer' }}>` 中，擴大可點擊 Hit Area。

### 2. DOM 無推擠懸浮 Toast 通知系統 (`ToastContext`)
* **學習點 (Learning)**：
  - 在視圖 DOM 流內部插入 `<div className="alert">` 會佔用空間並推擠周邊 Layout（如 Telemetry Grid），造成畫面抖動與 Layout Shift。
  - 全域 `ToastContainer` 使用 `position-fixed top-0 end-0 p-3` (z-index: 1060)，100% 脫離 Normal Flow 空間，絕對不干擾 View 圖表與面板高度。

### 3. Flex Column 容器 `minHeight: 0` 與 `gap` 溢出裁切防護
* **學習點 (Learning)**：
  - 在帶 Header 的 Flex Column 容器內，若子容器設定 `h-100` 或 `height: 50%`，配合 `gap` 會導致總高度達到 `100% + Header + Gap`，引發底部元素被 Outer Card 的 `overflow-hidden` 裁切。
  - 正確做法：內層容器設置 `minHeight: 0`；子元件使用 `flex: 1 1 0%; minHeight: 0;`，由 Flexbox 精確平分空間。

### 4. Bootstrap Offcanvas 常態掛載 (Persistent DOM) 模式
* **學習點 (Learning)**：
  - 以條件渲染 `{show && <Offcanvas />}` 開關組件，會導致組件隨開關 mount/unmount，完全無法呈現 Offcanvas 的 CSS transition 滑入滑出動畫與背景遮罩。
  - 正確做法：組件**常態掛載於 DOM**，透過 `show: boolean` prop 動態切換 `.show` CSS class、`visibility` 與 backdrop 遮罩。

### 5. 全站 View 標頭與 Navigation 溢出相容性
* **學習點 (Learning)**：
  - 全站 View 採用獨立 Banner 標頭（`border-bottom pb-3 mb-2 flex-shrink-0`）與無框開闊內容區塊；頂層容器設定 `w-100 overflow-x-hidden overflow-y-auto` 確保 100% 響應式放縮。
  - 全域導覽列容器 `<nav>` 必須顯式聲明 `overflow: visible !important;`，防止下拉選單被截斷或產生內部滾動條。

### 6. 裝飾性 Emoji 全面大掃除與極簡專業 UI 規範
* **學習點 (Learning)**：
  - 嚴格落實 `AGENTS.md` 規範，全站組件中嚴禁硬編碼插入非功能性裝飾 Emoji（如 📊, 🏎️, ⚙️, ⚡）。介面統一採用 Halfmoon 原生 Badge、語義文字與高質感襯底，保持硬核極簡風格。

---

## 四、跨語言對齊、安全防護與 CI/CD 工具鏈領域

### 1. API 端點安全防護與 XSS 避坑 (來自 Jules/sentinel.md)
* **學習點 (Learning)**：
  - **路徑穿越 (Path Traversal)**：Windows 下 URL 編碼的反斜線 (`%5c`) 會繞過 `/` 檢查傳給 `os.path.join` 引發路徑穿越。應使用 FastAPI 的 `Path(pattern="...")` 正則強校驗。
  - **XSS 防範**：動態 CSS 或使用者文字寫入 `<style>` 或 DOM 時，使用 `textContent` 替代 `innerHTML`。
  - **敏感資訊洩漏防範**：生產環境 API Error 回覆嚴禁直拋 `str(e)` 洩漏內部檔案路徑，應記錄於後端日誌並向前端回傳通用安全字串。

### 2. Python <-> TypeScript 型別合約與彩蛋車 skip 機制
* **學習點 (Learning)**：
  - 前後端對接必須透過 TypeScript Interface 與 Python Type Hints 明確定義合約。
  - Forza Ordinals 中 `1215` 號車輛名為 `NUL_CAR_00`（單一連字號資產名稱）。在 `update_car_db.py` 中設定白名單跳過機制（`if ordinal == 1215: continue`），保護自訂彩蛋車輛（2020 Yamaha YZF-R15）不被自動更新覆蓋。

### 3. Windows PowerShell / Vitest / Pytest 相容性處理
* **學習點 (Learning)**：
  - 在 Windows 下執行 CLI 測試指令時，建議使用 `cmd /c "pnpm -C frontend run test"` 或 `.venv\Scripts\pytest`，避免 PowerShell ExecutionPolicy 阻擋或路徑解析差異。
  - 輔助驗證腳本切勿放置於 `tests/` 目錄或以 `test_` 命名，`pyproject.toml` 明確維護 `testpaths = ["tests"]`。

### 4. 一次性開發腳本生命週期與 發行打包規範 (來自 Jules/narrator.md)
* **Tauri Sidecar 打包時的中間檔與產出淨化**：
  - PyInstaller 在 Phase 1 打包產出的 `server-sidecar-x86_64-pc-windows-msvc.exe` 僅作為供 Tauri 在 Phase 2 嵌入的資源。
  - 在發行 Release 時**只需提供 `dist/FH6-HorizonTuner.exe`**，不需要提供 Sidecar 中間檔。已在 `build_all.bat` 末尾自動加上清理邏輯。發行打包時，善用 `.pkgdirignore` 排除開發快取與資源，發行版 `.exe` 會自動於同級目錄建立 `settings.json` 與數據資料夾，實現綠色隨身攜帶。

### 5. Tauri Sidecar 正向轉移與「進程/路徑分離」免安裝隔離
* **學習點 (Learning)**：
  - **Sidecar 進程與路徑分離陷阱**：在單檔免安裝 (Single Portable EXE) 模式下，Tauri 將二進位 Sidecar (`server-sidecar`) 釋放至 `%TEMP%` 目錄執行。若 Python 端仍以 `sys.executable` 作為 `DATA_ROOT`，使用者產生的 `settings.json`、`tunings/` 與 SQLite `telemetry_sessions.db` 將寫入 Temp 區，隨時有遺失風險。
  - **Host EXE 目錄傳參**：Rust 端在 `setup()` 時取得 `std::env::current_exe().parent()`，以 `--data-dir` 參數主動傳給 Sidecar，確保資料與 Host EXE 100% 保持在同級目錄下，實現隨身帶走。
  - **資料夾初始與動態 Fallback 規範**：
    - `lang/`：初始化時自動複製專案內完整語系檔至 `DATA_ROOT/lang/` 供使用者直接調整。
    - `car_params/`：`DATA_ROOT/car_params/` 預設為空，僅在使用者儲存時寫入；讀取時優先嘗試 `DATA_ROOT/car_params/`，若未命中則 Fallback 讀取二進位內建 `RESOURCE_ROOT/car_params/`。
    - `hud_overlay/`：`DATA_ROOT/hud_overlay/` 預設為空，保留內建原生 HUD 掛載，同時允許使用者放入自訂 HTML/CSS 面板進行動態掃描與追加。
