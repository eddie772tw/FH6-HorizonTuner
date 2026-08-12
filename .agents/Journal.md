# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

## 日誌定位與同步規則

本檔是專案的「已採納、已驗證知識庫」，不是 Jules 原始工作紀錄的鏡像。Jules 的原始紀錄保留於 `.jules/*.md`；只有在本地完成驗證、確認適用範圍後，才同步到本檔。

每筆新紀錄應盡量包含以下欄位：

- **日期與領域**：例如 `2026-08-11 / Agent Workflow`。
- **來源**：`local` 或 `.jules/<file>.md`。
- **狀態**：`proposed`、`adopted` 或 `superseded`。
- **Learning**：觀察到的問題或可重複的學習點。
- **Action**：已採取或要求後續採取的規則。
- **Evidence**：測試、commit、檔案或可重現步驟。

`.agents/skills/README.md` 是技能名稱的唯一索引；日誌不得創造新的技能別名。Jules 日誌中的重複或只適用於單一任務的內容，應保留在 `.jules/`，不要直接升級成全域規則。

---

## 2026-08-11 / Agent Workflow

### 技能名稱與技能發現入口混淆

- **來源**：`local`，V1.4.1 計畫檢討。
- **狀態**：`adopted`。
- **Learning**：`modular-refactoring/SKILL.md` 的資料夾名稱是 `modular-refactoring`，但舊 frontmatter 寫成 `modular-refactoring-expert`；缺乏中央索引時，Agent 容易採用不存在的名稱。`jules_coding/SKILL.md` 也沒有正式 frontmatter，導致它不容易被技能清單辨識。
- **Action**：使用 `.agents/skills/README.md` 作為 canonical registry；以技能資料夾名稱為 ID；任務開始前先盤點並完整讀取觸發的 `SKILL.md`；已修正 `modular-refactoring` frontmatter 並補上 `jules_coding` frontmatter。
- **Evidence**：技能 frontmatter inventory、`.agents/AGENTS.md` 的 discovery gate，以及目前 repository 的技能目錄。

### Jules 原始日誌與專案 Journal 的責任分界

- **來源**：`local`，Jules 日誌整理檢討。
- **狀態**：`adopted`。
- **Learning**：`.agents/Journal.md` 已混入 `.jules/bolt.md`、`palette.md`、`sentinel.md`、`narrator.md` 的內容，但缺乏來源、驗證狀態與同步規則；`.jules/palette.md` 也存在重複的無障礙條目。
- **Action**：`.jules/*.md` 保留為原始、逐次、可追溯紀錄；`.agents/Journal.md` 只收錄已驗證的專案規則，並要求記錄來源與 Evidence。重複條目應在整理時合併，不直接刪除無法追溯的歷史。
- **Evidence**：`.agents/skills/jules_coding/SKILL.md` 的 Journal boundary 與本檔的日誌規則。

### Windows 大小寫不敏感造成 Jules 日誌 duplicate path

- **來源**：`local`，Git index 檢查。
- **狀態**：`adopted`。
- **Learning**：Git index 同時追蹤 `.Jules/palette.md` 與 `.jules/palette.md`；Windows 工作樹會將兩者解析為同一個實體檔案，造成 Agent 看到重複路徑、staging 不一致與非同步協作歧義。
- **Action**：Jules 原始日誌統一使用 lowercase `.jules/`；新增日誌前先檢查大小寫等價路徑，禁止建立只差大小寫的 duplicate path。
- **Evidence**：`git ls-files -s` 在整理前出現兩個 palette path；整理後只保留 `.jules/bolt.md`、`.jules/narrator.md`、`.jules/palette.md`、`.jules/sentinel.md`。

## 2026-08-11 / S650 HMI canonical telemetry contract

- **來源**：`local`，S650 HMI Phase 2 canonical-only migration。
- **狀態**：`adopted`。
- **Learning**：S650 renderer 的 raw telemetry ingress 是 `hud_overlay/shared/coordinator.js` 發出的 `hud:frame`；UDP `Yaw` 為 rad、`TireTemp` 為 ℉、`Boost` 為 PSI、`Fuel` 為 `0..1`。S650 renderer 若繼續讀取 raw alias，會讓不同中央頁面各自重複轉換單位，且 Heritage boost 曾因此走到錯誤的 Pa→PSI 再轉換路徑。
- **Action**：S650 renderer 只讀取 `s650-hmi/v2` canonical frame。coordinator 負責產生 `distance_m`、`heading_deg`、`tire_temp_f`、`fuel_ratio`、`lap`、`race_position`，並沿用既有的 `speed_*`、`power_*`、`torque_*`、`boost_*` 欄位；renderer、layout 與 central pages 不得接受 raw key、legacy alias、m/s 速度或 `0..255` pedal input。
- **Evidence**：`hud_overlay/s650_hmi/assets/s650_contract.js`、`hud_overlay/shared/coordinator.js`；`s650Contract.test.ts`、`s650FrameCanonicalInput.test.ts`、`s650CenterInfoCanonicalData.test.ts` 共 202 個 frontend tests 通過；packet unit evidence 位於 `.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md`。

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

### 5. Tauri Sidecar 路徑與使用者資料目錄（已修正）
* **學習點 (Learning)**：
  - Tauri 可能將 sidecar 解壓到暫存位置執行；`sys.executable`、`sys._MEIPASS` 與主程式所在路徑不是同一個概念，不能直接用來決定使用者資料位置。
  - Release 版由 Rust 端解析 Tauri `app_data_dir()`，再以 `--data-dir` 傳給 Python sidecar。settings、logs、tunings、HUD 設定與 SQLite 必須寫入該可寫入目錄，不能假設安裝目錄可寫。
  - `RESOURCE_ROOT` 僅用於唯讀內建資源（語系、車輛資料、內建 HUD）；`DATA_ROOT` 用於使用者資料。兩者不可混用。

### 6. Dev 與 Release 啟動／除錯差異總整理（Release 連線事故避坑）
* **環境差異 (Environment)**：
  - `start_all.bat` 是外部啟動兩個程序：Python `backend/main.py` + Vite dev server。此路徑沒有 Tauri host、沒有 sidecar command、也沒有 Tauri `invoke()` 狀態。
  - `build_all.bat` 先以 PyInstaller 建立 `server-sidecar-x86_64-pc-windows-msvc.exe`，再由 Tauri Release host 透過 `externalBin` 啟動 sidecar。Release 不會啟動 Vite，也不會使用 `start_frontend.bat`。
  - PyInstaller 的 `console=False` 可能令 Windows frozen process 沒有可用的 stdout/stderr；不能只依賴 stdout 文字完成 host/sidecar 握手。

* **埠號與啟動時序 (Port / Race Condition)**：
  - 後端啟動時會先 bind `127.0.0.1` 的可用埠並寫入 `logs/web_port.txt`；此埠不保證是 `8001`。
  - Release 啟動順序是「Tauri spawn sidecar → Python 初始化 → bind port → 前端載入」。前端若在 port 檔產生前就固定 fallback 到 `8001`，會造成只在 Release 出現的所有 API／WebSocket 連線失敗。
  - 正確流程是由 Tauri state 保存 `starting / ready / failed` 與實際 port；前端必須等待 ready 後才 render。已加入 `get_backend_status` 與 15 秒啟動等待。
  - Windows 無 console 時，Tauri 會優先解析 `FH6_BACKEND_READY:{"port":...}`；若收不到 stdout，改從本次啟動指定的 App Data `logs/web_port.txt` 輪詢。啟動前要刪除舊 port 檔，避免誤連上一個已終止的 process。

* **前端連線差異 (Frontend Transport)**：
  - Dev 環境目前使用 `8001` 作為相容 fallback；Release 必須使用 Tauri 回報的動態埠。
  - 既有頁面仍有 `http://127.0.0.1:8001` 與 `ws://127.0.0.1:8001` 字串，因此不可在 `main.tsx` 取得 port 後只設定一個全域變數就宣稱完成切換；既有字串不會自動變更。
  - 動態埠轉送已集中在 `frontend/src/services/backend.ts`，且只在 backend ready 後安裝。新功能應直接使用 `backendHttpUrl()`／`backendWebSocketUrl()`，不要新增更多硬編碼 `8001`。

* **只會在 Dev 出現的問題**：
  - Vite dev server 啟動失敗、port `1420` 被占用、HMR 或 `start_all.bat` 的 Python／venv／依賴問題，Release 不會重現。
  - Dev 直接執行 Python，例外會出現在 console；不可用此行為推論 PyInstaller 版一定能看到相同 traceback。Release 應檢查 App Data 下的 `logs/backend.log`。
  - Dev 可能依賴工作目錄、專案相對路徑或本機 Python 套件；這些在 frozen sidecar 中不存在。

* **只會在 Release 出現的問題**：
  - sidecar 未被放入 Tauri `bin/`、target triple／檔名不符合、capability 未授權 `shell:allow-execute`，會造成 Tauri 啟動失敗但 dev 完全正常。
  - `sys._MEIPASS` 下的內建資源與使用者可寫資料目錄不同；將資料寫到安裝目錄或 Temp 可能導致權限錯誤、設定遺失或 port 檔不可見。
  - `console=False`、Tauri WebView 來源（`tauri://localhost`／`http://tauri.localhost`）與 CORS／capability 限制只會在 Release 暴露。
  - Release 必須在重新建置 sidecar 後才包含 Python 端的協定變更；只重建前端或 Rust 不會更新舊的 `.exe`。

* **除錯與驗收順序 (Required Checklist)**：
  1. 先確認 `build_all.bat` 的 PyInstaller 階段真的產生並複製最新 sidecar，再確認 Tauri bundle 內含該檔案。
  2. 安裝／執行 Release 後，查看 `%LOCALAPPDATA%` 對應 App Data 目錄的 `logs/backend.log`、`logs/web_port.txt`。
  3. 確認 `web_port.txt` 的埠能以 `127.0.0.1:<port>/api/...` 存取，且不是預設猜測的 `8001`。
  4. 分別驗證 REST、`/ws/telemetry`、`/ws/overlay` 與 HUD 視窗；REST 成功不代表 WebSocket 或 overlay 已成功。
  5. 測試 `8001` 被其他程序占用的情況；Release 應仍能使用另一個動態埠。
  6. 變更啟動協定、`--data-dir` 或 sidecar spec 後，必須同時跑前端測試、`cargo check`、重新打包，並做一次安裝後 smoke test。

## 2026-08-11 Agent 治理 skill 工作流補強

### 已驗證的問題

- 過往工作反覆涉及 60Hz telemetry/Canvas/GC、Jules 安全與 accessibility 委派、portable sidecar 與動態 port，但相關流程分散在 Journal、Jules 原始日誌與 AGENTS，導致 skill 選擇與驗收標準不穩定。
- `huge-component-refactoring` 與 `modular-refactoring` 的責任邊界不夠明確，容易把 UI hot path 與 domain/API 模組重構混用。
- skill 名稱、`.Jules`/`.jules` 大小寫路徑、Journal 語言邊界與 release port 契約需要週期性稽核。

### 本次採納的治理規則

- 新增 `agent-governance-audit`，負責檢查 canonical skill ID、frontmatter、路徑大小寫、stale references、中文 agent 文件與英文 Jules 原始日誌邊界。
- 新增 `portable-release-validation`，集中驗證 V1.x portable/exe、sidecar lifecycle、dynamic HTTP port、UDP port、Windows clean smoke test 與 artifact 證據。
- `huge-component-refactoring` 專注巨型 UI、Canvas 與高頻 render path；`modular-refactoring` 專注模組邊界、純邏輯與型別契約。
- `jules_coding` 的遠端結果必須經本地 diff、測試、安全性與效能檢查後，才能進入 Journal 或合併。

### 驗證狀態

- Status: adopted
- Source: `.jules/bolt.md`、`.jules/sentinel.md`、`.jules/palette.md`、`.jules/narrator.md` 與近期 Git history
- Verification: skill frontmatter/registry consistency、skill validator、`git diff --check`

---

## 2026-08-11 / RaceRecorder Persistence Queue

- **Scope**: local / V1.4.1 `codex/v1.4.1-contract-hotpath`
- **Status**: adopted
- **Learning**: SQLite batches issued by RaceRecorder can delay unrelated UDP, dyno, and WebSocket work even when samples are downsampled to 10Hz.
- **Action**: RaceRecorder remains a synchronous state machine. One FIFO `AsyncRacePersistence` worker owns session creation, point batches, and finalization, and executes every SQLite operation through `asyncio.to_thread()`. A bounded queue drops only recorder samples under sustained saturation; finalization is deferred rather than dropped.
- **Contract**: Existing analysis endpoints and the SQLite schema remain unchanged. `/api/diagnostics/telemetry-pipeline` adds the backward-compatible `raceRecorderPersistence` object.
- **Evidence**: `backend/race_recorder.py`, `TelemetrySQLite.finalize_session()`, `tests/test_race_recorder.py`, and lifecycle/diagnostics test extensions. Targeted pytest: 16 passed.

---

## 2026-08-11 / Frontend Transport Contract

- **Scope**: local / V1.4.1 `codex/v1.4.1-transport-contract`
- **Status**: adopted
- **Decision**: The frontend owns one explicit `BackendTransport` configured after Tauri reports the verified sidecar port. `backendFetch()`, `backendHttpUrl()`, and `backendWebSocketUrl()` are the only application entry points for backend HTTP/WebSocket endpoints; development keeps the explicit port-8001 transport default.
- **Rationale**: Replacing `window.fetch` and `window.WebSocket` globally could rewrite HUD assets, GitHub release checks, or future external connections. The explicit contract makes the portable dynamic-port boundary testable and keeps ownership visible at each call site.
- **Hot-path boundary**: `useTelemetry` still dispatches parsed frames directly to `telemetryEmitter` for Canvas consumers at source frequency, while React state remains sampled at 5Hz. This change only selects the WebSocket endpoint and does not add work to telemetry frame handling.
- **Evidence**: Frontend Vitest from `frontend/`: 31 files / 197 tests passed. Vite production bundle passed. Portable-sidecar contract pytest: 5 passed (`test_portable_host_diagnostics.py`, `test_sidecar_process_contract.py`, `test_executable_bundle.py`). `tsc -b` remains blocked by pre-existing Node typings/target errors in `vite.config.ts`; Vite module bundling succeeds.

---

## 2026-08-11 / PR #185 Codex Takeover

- **Scope**: GitHub PR #185, `feat(drift-hud): style meter and split instruments`.
- **Status**: active.
- **Owner**: Codex.
- **Branch**: `codex/drift-hud-modernize-remove-presets` at `283fe39`.
- **Changed**: Checked out the PR branch from `origin`; no implementation changes made after takeover.
- **Pending**: Continue the Drift HUD visual iteration and address any CI or review feedback that appears.
- **Blocked by**: None. PR is open and currently Ready for Review; no review submissions or inline threads are present.
- **Verification**: Clean worktree at takeover; PR reports 33 frontend test files / 205 tests and `git diff --check` passed.
- **Next action**: Run the local frontend validation baseline before the next implementation change; move the PR back to Draft if active iteration requires it.

---

## 2026-08-11 / Telemetry HUD Reference Research Documentation

- **Scope**: PR #185 follow-up research; document the five shallow-cloned reference repositories within the Drift HUD visual-slice boundary.
- **Status**: active.
- **Owner**: Codex.
- **Branch**: `codex/drift-hud-modernize-remove-presets`.
- **Changed**: Added `docs/reference-projects/` overview plus one PR-scoped evaluation per reference project, and `docs/telemetry-hud-implementation-plan.md`.
- **Research boundary**: `ref/forza-hud-references/` remains ignored and is source-level research material only. Proprietary Horizon HUD assets/code and GPL Forza Data Tools code are explicitly excluded from reuse.
- **Key decision**: Keep the existing 60Hz frame/emitter, TelemetryView, and HUD card behavior unchanged; PR#185 only validates and refines the Drift HUD-local presentation layer and its existing frame integration.
- **Verification**: `git diff --check` passed; docs are visible as untracked files; existing `.agents/Journal.md` takeover entry remains preserved.
- **Pending**: Complete the PR-scoped Drift HUD edge-case and visual validation; telemetry architecture work must be a separate issue/PR.

---

## 2026-08-11 / Drift Style MVP

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Status**: adopted
- **Decision**: The first implementation phase leaves the existing Drift HUD
  primary instrument unchanged. A dependency-free `drift_style_engine.js` owns
  scoring, rank decay, source-local FLOW/HOLD/RISK aggregation, Hero special
  events, direction-swap continuity, and settlement snapshots. The display is a fixed container inside
  `hud_overlay/drift/index.html`, not a shared TelemetryCard.
- **Hot-path boundary**: The engine receives a preallocated normalized frame in
  the existing RAF loop. Its DOM container is updated at 12.5 Hz with no CSS
  transition, preserving the 60 Hz Canvas and telemetry path.
- **Evidence**: `frontend/src/utils/driftStyleEngine.test.ts` covers source
  aggregation, Hero special events, direction swaps, and sustained-loss settlement.

---

## 2026-08-11 / Drift HUD Primary-Secondary Split

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Decision**: The central oval is now the primary instrument and renders only
  the drift-angle arc, tachometer arc, and a speed / gear / torque 1+1+1
  hierarchy. A lower-right oval secondary instrument owns drift angle,
  direction, FLOW, RISK, HOLD, and the four driver-input columns.
- **Telemetry contract**: `SteerInput` is normalized to a clamped percentage
  and projected onto the shared plus-or-minus 60 degree drift arc as an amber
  counter-steer pointer. It is deliberately not displayed as a physical
  wheel-angle measurement. Torque uses the existing normalized telemetry unit.
- **Hot-path boundary**: `drift_display_math.js` is dependency-free and the
  Canvas loop only consumes normalized scalar state; no React work or
  allocations were introduced into the telemetry path.
- **Evidence**: `frontend/src/utils/driftDisplayMath.test.ts` covers steering
  normalization, counter-steer direction, visual arc mapping, and torque
  units. Frontend Vitest: 33 files / 205 tests passed.

---

## 2026-08-11 / PR #185 Drift Edge-Case Hardening

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Implementation**: `drift_display_math.js` now treats null, undefined, and
  empty-string torque payloads as missing values before selecting the metric or
  imperial fallback field. Non-finite fallback values still resolve to zero.
- **Tests**: added boundary and clamp coverage for steering and counter-steer
  projection, torque fallback coverage, expired pending Hero events, invalid
  timestamps, and full Drift engine reset lifecycle.
- **Verification**: targeted Drift tests passed (2 files / 13 tests); frontend
  Vitest baseline passed (33 files / 210 tests). Added `driftHudContract.test.ts`
  to compile the inline controller and protect the primary/secondary/shared-card
  mounts plus RAF/12.5 Hz rendering boundary. Current baseline: 34 files / 213
  tests passed.
- **Boundary preserved**: no changes to TelemetryView, HUD card toggles,
  telemetry transport, or the existing 60 Hz Canvas/telemetry path.

---

## 2026-08-11 / Drift Sweep Semantics and Steering Range

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Decision**: other HUDs use `onAnimate` for their Sweep action; for Drift,
  Sweep is additionally the mechanical zero/calibration operation, so it must
  reset the Drift Style engine and combo state.
- **Decision**: the drift-angle background scale remains ±60°, while normalized
  steering maps to a separate ±45° indicator range. 100% steer is exactly 45°;
  higher raw values are clamped at that boundary.
- **Verification**: frontend Vitest baseline passed (34 files / 213 tests).

---

## 2026-08-11 / Drift HUD Full-Viewport Feedback

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Feedback addressed**: implemented a real 1.5s startup/Sweep animation,
  moved Drift layers to viewport anchoring, enlarged the HUD typography, moved
  the logical canvas above the game's bottom score area, generalized the
  steering pointer to render for any non-zero steering input, and aligned both
  tachometer/angle arcs to the same ellipse as the frame decoration.
- **Architecture**: kept one HUD HTML and one HUDCore telemetry lifecycle;
  viewport-fixed DOM layers and a DPR-aware full-screen canvas avoid duplicate
  telemetry registrations while escaping the conventional bottom-right slot.
- **Hot-path boundary**: viewport transform is recalculated only on resize;
  canvas rendering remains RAF-driven and Style Meter DOM painting remains
  throttled to 80ms.
- **Verification**: frontend Vitest baseline passed (35 files / 216 tests).

---

## 2026-08-11 / Drift Primary Scale and Score Layer Feedback

- **Feedback**: the full-viewport transform made the primary instrument too
  large and the Style Meter overlapped the primary/secondary instruments.
- **Decision**: keep the secondary instrument at viewport fit scale, apply a
  dedicated `PRIMARY_RENDER_SCALE = 0.62` around the primary center, and anchor
  the Style Meter to the viewport upper-right (`right: 4vw`, `top: 28vh`).
- **Verification**: frontend Vitest baseline passed (35 files / 216 tests).
- **Pending**: in-game screenshot review for the final primary scale and the
  selected score-layer clearance.

---

## 2026-08-11 / Drift Secondary Conventional Bottom-Right Anchor

- **Decision**: compare the Drift secondary instrument with Advanced and VFD,
  which use fixed-size containers, shared root `padding: 30px`, and
  `transform-origin: bottom right`. The secondary therefore uses the viewport
  transform with zero extra bottom margin, preserving its current size while
  aligning its lower edge to the conventional HUD anchor.
- **Primary isolation**: the primary keeps its independent compact scale and a
  compensating upward offset, so secondary anchoring does not move it back over
  the game's score indicator.
- **Verification**: Drift layout targeted tests passed (2 files / 6 tests).

---

## 2026-08-12 / FH6 Native UI Safe Zones and Drift Panel

- **Evidence**: downloaded four public FH6 gameplay captures to the ignored
  `ref/fh6-ui-layout-reference/` directory and compared them with the
  project's Drift HUD screenshots. The observed persistent regions are:
  top-center skill score, bottom-center Drift Zone total, lower-left map /
  ANNA, lower-right native gauge, and race-only upper-left progress plus
  upper-right leaderboard.
- **Primary layout**: GT7's bottom-center visual language remains useful, but
  direct placement conflicts with FH6's Drift Zone total. Added
  `getFh6PrimaryAnchor()` to put the primary in the central safe lane at 54%
  viewport height, bounded by the observed top and bottom bands. The anchor
  is recalculated only during resize, not in the RAF hot path.
- **Secondary visual**: replaced the oval secondary outline with an
  Advanced-inspired cut-corner rectangle. It keeps the conventional
  bottom-right anchor and adopts the Drift cyan/pink/amber palette.
- **Boundary**: Style Meter remains at its user-confirmed right-mid free-roam
  placement. Race leaderboards can occupy the same column, but telemetry has
  no reliable visibility signal, so the runtime does not guess a mode switch.
  This is documented in `docs/fh6-ui-safe-zones.md`.

---
## 2026-08-12 / S650 Launcher Theme Contract

- **Scope**: local / `codex/s650-hmi-next-phase-evaluation`
- **Status**: adopted
- **Learning**: The control panel, backend, and S650 canvas contract recognized the three performance themes, but the HUD launcher retained the earlier three-theme allowlist. Launcher normalization silently rewrote each performance selection to `heritage67` before it reached the iframe.
- **Action**: Keep the launcher's allowlist aligned with the S650 renderer contract and cover it with a launcher-specific Vitest regression test.
- **Evidence**: `hud_overlay/index.html`, `s650HudLauncherConfig.test.ts`
---

## 2026-08-12 / S650 Track and SVT Cobra Visual Rework

- **Scope**: local / `codex/s650-hmi-next-phase-evaluation`
- **Status**: pending visual review
- **Decision**: Keep Sport on its existing implementation while its product direction is evaluated. Rebuild only Track and SVT Cobra as transparent overlays so they do not mask the game image.
- **Action**: Track now uses the S650-oriented wide RPM band, central speed, discrete gear readout, fuel bar, and tire-temperature perimeter. SVT Cobra uses two analog rings with white/silver ticks, red needles, an 8k SVT tachometer, and a 160 mph-equivalent speed scale. The layout dispatcher prefers these renderers and retains the existing primitive clusters solely as a fallback.
- **Evidence**: `hud_overlay/s650_hmi/assets/s650_performance_clusters.js`, `s650_layouts.js`, `s650PerformanceClusters.test.ts`, `s650DualLayoutPipeline.test.ts`; frontend Vitest: 40 files / 221 tests passed.
---

## 2026-08-12 / S650 Track Recipe Skeleton

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Architecture**: Every S650 cluster composes shared component categories through its own layout recipe. A recipe owns geometry and presentation variants; component modules own Canvas drawing and canonical-frame reads. Track is the first performance layout migrated to this model.
- **Action**: Added `S650HmiClusterComponents` and a Track recipe selecting a `trackWide` tachometer, smoked center-info container with tire overview, left thermal rail, right fuel rail, and footer status/gear layout. The central speed and `Track use only` copy are intentionally deferred for a separate information-hierarchy review.
- **Data boundary**: Tire temperature and fuel use canonical data. The thermal rail visibly reports unavailable because no coolant/oil-temperature datum has entered the canonical S650 frame; no placeholder measurement is invented.
- **Verification**: Frontend Vitest: 40 files / 221 tests passed; `node --check` and `git diff --check` passed.
---

## 2026-08-12 / S650 Track Skeleton Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Decision**: A Track recipe must compose the existing center-info and dynamic-gear children, not recreate a fixed tire page or a transmission label list. Footer readouts must be recipe slots with explicit positions, as in every other cluster.
- **Action**: Removed the irregular smoked-blue panel and fixed tire sketch. Track now invokes the registered center-info module in a right-side region. Its rails select canonical `power` and `boost` roles rather than hard-coding thermal/fuel text. The tachometer clips base, redline, and active fills to its trapezoid. The footer defines all four canonical readout slots and delegates the middle gear display to `drawGearCarousel`.
- **Verification**: `s650PerformanceClusters.test.ts` verifies clipping, right-side center-info injection, role-driven rails, all footer slots, and dynamic gear delegation. `s650DualLayoutPipeline.test.ts` verifies the layout dispatcher passes the shared center-info and gear primitives.
---

## 2026-08-12 / S650 Track Gauge Density Tuning

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Finding**: Track and dual-ring themes share the same fixed 1280x480 Canvas and CSS dimensions. The reported central visual weight is recipe density from Track's continuous 1120px tachometer and 808px footer, not a theme-specific scaling defect.
- **Action**: Track's active RPM fill now uses the normal/default primary blue and accepts the GUI custom primary palette. Its base, active, and redline bands are clipped to a lower-edge center peak, reducing the central fill depth by 20%. The side rails are larger, positioned inward, and use 8px active bands for quicker reading.
- **Guardrail**: Preserve the wide Track tachometer as a Track presentation variant. Future density tuning should reduce footer contrast or width before changing canvas size or globally scaling the cluster.
- **Verification**: Frontend Vitest: 40 files / 222 tests passed; `node --check` and `git diff --check` passed.
---

## 2026-08-12 / S650 Track Lowered Tachometer Reflow

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Finding**: HUD zoom is bottom-anchored. The former Track tachometer at y=86 appears near y=184-204 when zoomed to 70-75%; its full-size compromise position is y=194.
- **Action**: Moved the Track wide tachometer to y=194 and changed its lower edge from a central triangle to a trapezoid mirroring the upper edge. Track now uses a compact right-side center-info variant at y=298 and moves the footer/gear carousel to y=414/447. Drive, tire-temperature, and performance center pages each define a compact renderer so Track retains user-selected center content without reintroducing a fixed wheel display.
- **Verification**: `s650CenterInfo.test.ts` covers compact renderer selection; Track recipe tests cover the compact region and gear anchor. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Anchor Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: pending visual review
- **Finding**: The review baseline is a 2560×1440 display. At that target, the shared S650 effective zoom of 1.18125 is correct and must not be reduced. The prior recipe's downward reflow instead pushed Track's lower readouts into the screen edge, where they were clipped.
- **Decision**: Preserve the shared S650 scale. Revert only the Track recipe's vertical displacement: tachometer y=86, center-info y=184, rails y=202, and footer/gear y=374/407. Keep the later component fixes, including the trapezoid-clipped theme-aware tach fill and compact center-info renderers.
- **Verification**: `s650PerformanceClusters.test.ts` locks the restored center-info, gear, and tachometer outline anchors. Manual 2560×1440 HUD review remains required before merge.
---

## 2026-08-12 / S650 Track Detail Alignment

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Track's tick marks used an inset RPM scale, while redline and active fill rectangles used the full trapezoid width. That mixed coordinate system made the redline edge and live RPM color appear under the wrong ticks. The compact center-information behaviour was also implicit in a renderer variant instead of being part of the layout contract.
- **Action**: `trackWide` now derives active and redline fill geometry from the same inset scale as ticks. Center-information normalizes an explicit `layoutStyle: 'trackSidebar'` into style, aspect-ratio, and compact-layout context. Track adds a shared `trackSpeedGear` component to the left-side counterpart of center information; speed and gear use separate fixed right alignment anchors, so speed digit count cannot move either field.
- **Verification**: `s650PerformanceClusters.test.ts` locks the redline/active fill scale and both speed/gear text anchors. `s650CenterInfo.test.ts` covers explicit Track sidebar selection. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Speed-Gear Hierarchy

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Decision**: The Track left-side companion must read from the center outward: gear on the left, speed on the right, separated by the actual geometric center line. This preserves the right-edge anchoring required for speed digit stability while making the two fields visually symmetrical with the right-side center-information region.
- **Action**: `trackSpeedGear` now accepts recipe-owned divider and vertical anchors. Track sets the divider at its center (`x=355`), gear/speed right bounds at either side, 69px/57px value typography (150% of the prior values), and a vertically centered text group.
- **Verification**: `s650PerformanceClusters.test.ts` locks both aligned values, the enlarged fonts, and the center divider start. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Speed-Gear Balance Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Enlarging the prior near-center gear anchor to 69px caused it to collide with its label and made the left/right halves read unevenly. The lower speed unit also competed for the same vertical space, leaving the whole group visually high.
- **Action**: Track now uses outward-facing columns around its geometric center line: gear is left-aligned at the left outer edge and speed is right-aligned at the right outer edge. Both values use balanced 57px typography; speed's unit is folded into the `SPEED <unit>` label. The recipe shifts the block down 14px and assigns independent label/value anchors, preserving a clear gap above enlarged values.
- **Verification**: `s650PerformanceClusters.test.ts` locks the left gear and right speed anchors, 57px font size, and the lower central divider anchor. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Redline Live-Fill Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Track painted the active band after the redline band, but incorrectly capped its width at `redlineRatio`. Once engine RPM crossed redline, the active indication stopped at the warning boundary and the static red region was the only visible state.
- **Action**: Preserve the redline band as a threshold underlay, then extend the final active fill to the true current RPM ratio. The tick/redline scale remains unchanged; only the live-fill upper bound is corrected.
- **Verification**: `s650PerformanceClusters.test.ts` exercises 7800/8000 RPM against an 87.5% redline and confirms the active band is painted after redline through the 97.5% current-RPM position. Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Trapezoid Endcaps

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: The Track fill rectangles used the inset tick span as both the ratio scale and the painted extent. Although the ratio boundary was correct, this left the left active and right redline trapezoid endcaps uncoloured.
- **Action**: Keep the inset span exclusively for RPM/redline ratio calculation. The clipped active band now starts at the full left outline point and the redline band ends at the full right outline point, so both angled endcaps receive the correct live/warning color. The Track gear value moves from the left outer edge to the center of its left half-column.
- **Verification**: `s650PerformanceClusters.test.ts` locks full endcap fill extents and the centered gear anchor (`x=284`). Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Sidebar Safe Corridor

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: The wider Track sidebar components crossed the game's live race-message area from both sides. The reference design also terminates its redline segment as a flat-sided block, rather than extending the full trapezoid into a downward right tip.
- **Action**: Track reserves an explicit central safe corridor: `trackSpeedGear` ends at x=420 and `trackSidebar` begins at x=840. The tachometer retains its left slanted entry but ends at the final scale point with a vertical redline edge; fill clipping and tick ratios remain shared-component behaviour.
- **Verification**: `s650PerformanceClusters.test.ts` locks both sidebar recipe bounds and the flat right outline points at x=1122. Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Release Scope and Prototype Quarantine

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: Track implementation complete; Sport and SVT Cobra retained as early visual-development prototypes.
- **Decision**: This branch is the merge candidate for the reviewed Track layout. Sport and SVT Cobra do not meet visual acceptance and must not be selectable, normalized as valid themes, or dispatched by the renderer. Their local recipes, palettes, primitive renderers, and isolated tests remain in place for later design work.
- **Action**: Restricted the public S650 registry to Normal, Heritage '67, Fox Body, and Track across the frontend selector, launcher, Canvas contract, backend normalizer, and layout registry. Stored `sport` / `svt_cobra` values now safely fall back to `heritage67`; direct renderer calls also resolve to the Normal dual-ring profile. Annotated retained prototype code with `TODO(s650-sport*)` / `TODO(s650-svt-cobra*)` markers.
- **Verification**: Frontend and backend regression tests assert both prototype ids are unregistered and cannot dispatch their renderers; their isolated palette/renderer tests remain as development references.
---

## 2026-08-12 / S650 HMI Ownership Boundary Refactor

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Decision**: The React control panel owns only the typed S650 configuration boundary: selector values, legacy-id normalization before save, and UI-specific type guards. The standalone Canvas contract, frame, renderer, layouts, primitives, and their tests belong to `hud_overlay/s650_hmi`.
- **Action**: Moved Canvas unit tests to `hud_overlay/s650_hmi/tests/unit`, launcher-boundary coverage to `tests/integration`, and moved the React configuration helper to `frontend/src/features/overlay_control/s650/config.ts`. Frontend Vitest explicitly includes the HUD-owned tests so the existing `pnpm -C frontend run test` command remains the single test entry point.
- **Release boundary**: The frontend build now copies HUD assets through `frontend/scripts/copy-hud.mjs`, excluding every `tests` directory from `dist/hud`; test relocation therefore does not enlarge production artifacts.
- **Guardrail**: This is an ownership-only move: no renderer hot-path logic, telemetry contract, or UI behaviour changes. A later phase may replace duplicated theme allowlists with a generated or shared manifest, but must not make the static HUD import the React bundle.
---

## 2026-08-11 / Theme Customization Cleanup

- **Scope**: local / frontend ThemeView and persisted theme settings.
- **Status**: adopted
- **Learning**: The three-slot theme storage UI had no active consumer outside ThemeView, and the generated CSS template duplicated current token values while forcing an empty custom CSS field to become non-empty on mount.
- **Action**: Removed legacy theme slots and their persistence path, kept validated JSON import/export, and changed custom CSS editing to a local draft with explicit Apply/Cancel/Clear actions. Custom CSS is now validated before it is persisted or imported.
- **Evidence**: Frontend Vitest: 31 files / 197 tests passed; Vite production build passed; backend overlay API tests: 35 passed; all six locale JSON files parsed successfully.

## 2026-08-12 / Drift Zone Side-Wing Primary and Compound Secondary

- **Feedback applied**: the centered primary obscures the driving view even
  when it avoids native UI. The primary now uses the lower-left wing between
  the observed map edge and the left edge of the Drift Zone total. Its width
  is calculated from the real viewport slot on resize and the visual frame
  scales proportionally.
- **Compact readability**: enlarged the gear, speed, torque, and unit source
  text. Compact mode retains only the key +45/0/-45 steering and low/mid/high
  RPM labels, preventing unreadable dense tick text at the new size.
- **Secondary design**: changed the status panel from text rows to two
  Advanced-inspired compound segment arcs (FLOW and RISK), each with a track,
  active segments, state label, and value. The central drift-angle/counter
  readout remains the immediate focal point.
- **Composition decision**: chose the left side-wing primary rather than a
  right-bottom cluster, so the Style Meter and conventional secondary do not
  need a shared expanded oval background. Cyan/pink danger language and the
  same dark translucent surface retain visual coherence across both modules.

---

## 2026-08-12 / Screenshot-Calibrated Primary and S650 Center Void

- **Evidence**: the latest 2048x1152 gameplay screenshot shows the left-wing
  primary still too small, while the native Drift Zone total remains a strict
  lower-center exclusion. S650 HMI confirms the composition pattern: its
  1280px cluster assigns an explicit 480px center region and its `disable`
  center page deliberately leaves that area blank without disabling the two
  surrounding dials.
- **Primary correction**: the side-wing fit is now treated as the compact
  base frame. The visible primary is doubled, with that base frame's previous
  left edge promoted to the new center, and its lower edge is still calculated
  to clear the Drift Zone score band on each resize.
- **Secondary correction**: replaced the generic circular progress arcs with
  Advanced-derived Canvas superellipse traces: outer boundary, inset track,
  glow-underlaid active segments, solid segments, and an endpoint marker. The
  cut-corner panel and Drift cyan/pink palette remain unchanged.
- **Verification**: targeted Drift layout and overlay-contract tests passed
  (2 files / 10 tests); full frontend Vitest passed (35 files / 220 tests).

---

## 2026-08-12 / Drift Secondary Instrument User-Needs Iteration

- **Feedback applied**: lowered the screenshot-calibrated primary by about
  three quarters of its own height after preserving the doubled size and
  left-edge-as-center geometry. The left-side horizontal lane remains the
  Drift Zone clearance rule.
- **Research conclusion**: the secondary should stop duplicating the primary
  and should not repeat Style Meter's `FLOW / RISK` score language. General
  drift driving needs a compact control surface for tire response, vehicle
  rotation state, and throttle/brake/handbrake/clutch input.
- **Boundary**: detailed tire temperatures, suspension, replay, score and
  line analysis remain TelemetryView / HUD-card / native-UI responsibilities.
  Yaw rate is a P1 input because the packet field exists but the current
  backend does not yet expose a canonical HUD alias.
- **Artifact**: `docs/drift-secondary-instrument-user-needs-iteration-report.md`
  records the evidence, priority matrix, proposed Canvas vocabulary, and
  staged implementation plan. No secondary renderer rewrite is included yet.
- **Verification**: frontend Vitest passed (35 files / 220 tests).

---

## 2026-08-12 / Drift Secondary Implementation Plan Revision

- **Source of truth**: revised `docs/telemetry-hud-implementation-plan.md` to
  follow the edited user-needs report. The secondary is now planned as a
  Drift Dynamics / Control Surface with Traction, Motion State and Driver
  Inputs columns; the old angle/counter/flow/risk/hold split is no longer the
  target architecture.
- **Sequencing**: contract and fixture work now precede any Canvas rewrite;
  Advanced primitives are migrated as reusable drawing capability, followed
  by P0 slip/input state, P1 yaw-rate contract, and real-device calibration.
- **Boundary**: TelemetryView, HUD cards, native score/style layers, recorder,
  replay, map and telemetry topology remain outside this work package.
- **Verification**: plan document passed `git diff --check`; no secondary
  renderer implementation was started in this revision.

---

## 2026-08-12 / Drift Secondary Single-Panel Correction

- **Layout recheck**: confirmed `getFh6PrimaryAnchor()` applies the requested
  `boxHeight * 0.75` downward shift and `renderPrimaryInstrument()` consumes the
  same anchor. Node geometry checks stayed inside the viewport at 1920x1080,
  2048x1152, 2560x1440, 3440x1440 and 1024x576; targeted tests passed 10/10.
- **Design correction**: the edited needs report explicitly replaces the
  former semantic three-column secondary with one integrated single-panel
  control display. The visual structure is three vertical pillars: full-height
  throttle, full-height brake, and half-height handbrake/clutch sharing the
  third pillar.
- **Scope**: traction, motion state, slip and yaw-rate data remain contract or
  future-event candidates, but this secondary version renders only T/B/H/C and
  input events. Advanced Canvas primitives remain reusable drawing technology,
  not a reason to restore separate traction or motion panels.

---

## 2026-08-12 / Drift Secondary Advanced Remap Increment

- **Implementation**: the active Drift secondary renderer now uses an
  Advanced-derived superellipse/inner-band Canvas grammar. The outer arc is
  throttle; the three inner bands are brake, clutch and handbrake.
- **Supporting state**: speed, unit, gear and the shared `lcState` badge remain
  in the panel. Four wheel grip-light groups use the existing slip-ratio and
  lockup data.
- **Attitude replacement**: the old angle/Flow/Risk text block is replaced by
  cyan heading, amber travel and four tire slip-angle arrows. Arrow length is
  normalized from absolute slip ratio.
- **Boundary**: this remains one HUDCore frame / one Canvas render loop. The
  new `Yaw` use is presentation-only and does not introduce a new telemetry
  contract or polling path.
- **Review items**: real FH6 capture is still required for yaw sign, slip-ratio
  saturation and compact-scale readability; details are in
  `docs/drift-secondary-advanced-remap-implementation.md`.

---

## 2026-08-11 / Telemetry Hot Path

- **來源**：`local`，V1.4.1 `codex/v1.4.1-contract-hotpath`。
- **狀態**：`adopted`。
- **Learning**：在 `broadcast_telemetry()` 首次同步載入車輛 profile，或直接寫入自動建立的 profile，會把磁碟 I/O 放進 60Hz consumer。僅把單次寫入包成背景 task 不足以保證正確性：舊快照可能在使用者 API 更新後覆寫最新設定。
- **Action**：profile 首次載入必須只啟動背景工作並略過尚未就緒的 dyno 收集；所有 dyno profile 的自動與 API 寫入都透過同一個 coalescing writer，以最後一份 snapshot 為準。後端以 `telemetry-pipeline-metrics/v1` 暴露 bounded queue、drop、client 與 stage timing 診斷資料。
- **Evidence**：`backend/telemetry_runtime.py`、`tests/test_telemetry_runtime.py`、`tests/test_telemetry_metrics_api.py`、`tests/test_car_params.py`；前端 Vitest `31 files / 194 tests` 通過。首次完整 pytest 使用舊 `dist/FH6-HorizonTuner.exe` 時，portable diagnostics 無法代表目前原始碼；執行 `build_all.bat` 後，新的 metadata test、portable host diagnostics（3 項）與完整 pytest（96 項）皆通過。
- **Pending**：`RaceRecorder` 的 SQLite flush 仍位於 telemetry consumer；下一輪以新 metrics 的 `recorders` stage 為基準後，再拆為背景持久化工作。

---

## 2026-08-12 / Drift HUD Runtime and Visual Token Convergence

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：inline Canvas HUD 的 contract test 若只檢查字串存在，無法捕捉 render loop 對未宣告 palette token 的依賴；本輪補上真實 fake Canvas／DOM／RAF harness，並將 active secondary 的 speed／unit／gear 邊界、共享視覺 token 與 one-frame console-error 檢查固定成可重複驗證的 contract。
- **Action**：secondary 維持既有 bottom-right anchor、single Canvas／HUDCore frame path 與主儀表幾何；移除 secondary 的 speed／unit／gear draw call，保留小型 LC badge，降低 surface／glow density，並分離 brake、redline、slip／lockup 與 Style risk 的語意色彩。同步將 safe-zone、implementation plan 與 Advanced remap 文件更新為 current implementation。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/fh6-ui-safe-zones.md`、`docs/telemetry-hud-implementation-plan.md`、`docs/drift-secondary-advanced-remap-implementation.md`；frontend Vitest `44 files / 247 tests`、frontend build、pytest `108 passed`、ruff check／format check 均通過。
- **Boundary**：真實 FH6 screenshot／frame capture 仍需確認 Yaw sign、slip-ratio saturation、compact-scale readability、LC transition 與不同解析度下的低 glow 可讀性；fake Canvas contract 不取代畫素級視覺驗收。

---

## 2026-08-12 / Drift HUD G3 Readability Rework

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：副儀表把 throttle、brake、clutch、handbrake 疊在同一組 superellipse arc 上時，segment gap、曲率、曲線 normal offset 與 midpoint label 會同時降低量表進度與文字可讀性；主儀表已驗證的 arc grammar 不應被這個副儀表問題牽連修改。
- **Action**：將 active secondary 重構為左右二分：左側 Driver Inputs、右側 Vehicle Dynamics。G3 使用連續 quadratic rail，`x(u)` 對 ratio 線性，`y(u)` 只加入小幅 `4H u(1-u)` 淺曲率；throttle／brake 提高權重，clutch／handbrake 由外下向內上鏡像成長，label/value 固定在文字槽位。姿態 vehicle body 與右下 2×2 grip mini-bars 同步放大；primary compact arc 僅微調刻度字級。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/drift-secondary-advanced-remap-implementation.md`、`docs/telemetry-hud-implementation-plan.md`、`docs/fh6-ui-safe-zones.md`；fake Canvas one-frame contract 已驗證新 G3 rail、左右二分 label、primary readout boundary 與無 renderer error。
- **Boundary**：真實 FH6 screenshot／frame capture 仍需確認 G3 rail 的低解析度可讀性、clutch／handbrake 由外下向內上的視覺對稱、右側 attitude／grip 區比例，以及主儀表刻度字級調整是否造成局部擁擠。

---

## 2026-08-12 / Drift G3 Active-Fill and State Feedback Correction

### Style event integration follow-up

- 移除獨立 Hero toast，將 special event 整合到 Style Meter 的 EVENT row，沿用既有 12.5Hz DOM paint。
- 擴充事件語彙：clutch kick、brake rotation、throttle punch、counter snap、direction switch、angle lock、grip save。
- Handbrake Entry 改為兩階段判定：先確認高門檻手煞車上升、高速、油門、低腳煞車與轉向，再要求短時間內形成有效甩尾角度，避免直線誤觸發。

### Follow-up review corrections

- 修正 LC fallback 的狀態轉移：手煞車釋放不再立即清除 ARM，車速跨過啟動門檻後進入短暫 GO 視窗。
- 車身動態改用主儀表相同的 `atan2(VelocityX, VelocityZ)`／`displayAngle`，不再重複扣除世界 Yaw；車身與 HD 箭頭反向旋轉，TRV 軸固定。
- Style Meter 維持無框設計，新增半透明深色底與陰影，以提升日間背景上的分數／事件文字對比。

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：quadratic rail 的完整 track 與 active charge path 必須使用同一條 Bézier 的 De Casteljau 子曲線；只插入線性 endpoint 會讓 throttle、clutch、handbrake 的充能條看起來脫離 rail。離散 LC 狀態也不能只依賴目前永遠為 `inactive` 的 fallback payload。
- **Action**：修正 G3 active sub-curve，改以 rail 法線產生 throttle／brake 的淺弧與 clutch／handbrake 的鏡像曲率；統一四組 caption 的中心基線與 label/value 間距；vehicle body／tire vectors 依 `travelAngleDeg` 旋轉；LC badge 顯示 `LC ARM`／`LC GO`，並在缺少 canonical state 時使用低速一檔、高油門、手煞車 fallback heuristic。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/drift-secondary-advanced-remap-implementation.md`、`docs/telemetry-hud-implementation-plan.md`；full frontend Vitest `44 files / 247 tests`、build `679 modules`、fake Canvas contract 均通過。
- **Boundary**：仍需實機 capture 確認四組 caption 在縮放後的實際間距、vehicle rotation 的方向語意，以及 fallback LC 狀態是否與遊戲中的 launch-control 操作一致。
