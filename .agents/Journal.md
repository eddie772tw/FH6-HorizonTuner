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

## 2026-08-11 / Theme Customization Cleanup

- **Scope**: local / frontend ThemeView and persisted theme settings.
- **Status**: adopted
- **Learning**: The three-slot theme storage UI had no active consumer outside ThemeView, and the generated CSS template duplicated current token values while forcing an empty custom CSS field to become non-empty on mount.
- **Action**: Removed legacy theme slots and their persistence path, kept validated JSON import/export, and changed custom CSS editing to a local draft with explicit Apply/Cancel/Clear actions. Custom CSS is now validated before it is persisted or imported.
- **Evidence**: Frontend Vitest: 31 files / 197 tests passed; Vite production build passed; backend overlay API tests: 35 passed; all six locale JSON files parsed successfully.

## 2026-08-11 / Telemetry Hot Path

- **來源**：`local`，V1.4.1 `codex/v1.4.1-contract-hotpath`。
- **狀態**：`adopted`。
- **Learning**：在 `broadcast_telemetry()` 首次同步載入車輛 profile，或直接寫入自動建立的 profile，會把磁碟 I/O 放進 60Hz consumer。僅把單次寫入包成背景 task 不足以保證正確性：舊快照可能在使用者 API 更新後覆寫最新設定。
- **Action**：profile 首次載入必須只啟動背景工作並略過尚未就緒的 dyno 收集；所有 dyno profile 的自動與 API 寫入都透過同一個 coalescing writer，以最後一份 snapshot 為準。後端以 `telemetry-pipeline-metrics/v1` 暴露 bounded queue、drop、client 與 stage timing 診斷資料。
- **Evidence**：`backend/telemetry_runtime.py`、`tests/test_telemetry_runtime.py`、`tests/test_telemetry_metrics_api.py`、`tests/test_car_params.py`；前端 Vitest `31 files / 194 tests` 通過。首次完整 pytest 使用舊 `dist/FH6-HorizonTuner.exe` 時，portable diagnostics 無法代表目前原始碼；執行 `build_all.bat` 後，新的 metadata test、portable host diagnostics（3 項）與完整 pytest（96 項）皆通過。
- **Pending**：`RaceRecorder` 的 SQLite flush 仍位於 telemetry consumer；下一輪以新 metrics 的 `recorders` stage 為基準後，再拆為背景持久化工作。
