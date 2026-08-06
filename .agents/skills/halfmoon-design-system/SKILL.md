---
name: halfmoon-design-system
description: 當開發或重構前端 UI 組件、調整 Halfmoon CSS v2 主題設定、自訂 Form/Card/Button 面板或維護 Glassmorphism 視覺行為標準時觸發此技能。
---

# Halfmoon CSS 視覺設計與組件規範技能指南 (Halfmoon Design System Skill)

## 核心原則

1. **Agent 遵循與維護義務**：
   - 所有 Agent 在開發、重構或維護前端 UI 組件、頁面佈局與 Halfmoon CSS 樣式時，**必須嚴格遵循並主動維護本 Skill 與 [HALFMOON_SPECIFICATION.md] 規格書**。

2. **雙層架構與語意化 CSS 變數權杖 (Design Tokens)**：
   - 核心框架使用 **Halfmoon CSS v2.0.2**（Layer 1），覆蓋與皮膚調整於 `src/App.css`（Layer 2）。詳細元件對照可參閱 [HALFMOON_SPECIFICATION.md]。
   - **禁止硬編碼顏色**：所有背景色、文字色、邊框與陰影必須使用語意化變數（如 `var(--glass-bg)`, `var(--text-primary)`, `var(--surface-1)`, `var(--primary)`），嚴禁於 inline style 硬編碼 `#ffffff` 或 `#000000`。

3. **防閃爍 (Anti-FOUC) 護欄**：
   - 頁面加載首幀透過 HTML `data-bs-theme` (dark/light) 與 `data-bs-core` (default/modern/elegant) 設定外觀模式。
   - 保障 React 組件掛載前第一幀樣式與 localStorage 主題設定完全一致。

4. **靜態面板 vs 互動卡片明確分離**：
   - **靜態資訊與圖表面板**：使用 `.glass-panel` 或 `.card`，絕對不加 hover 浮動位移動畫。
   - **可點擊選單/項目卡片**：使用 `.glass-panel-interactive` 或 `.card-interactive`，點擊與懸浮時觸發 `translateY(-3px)` 與 `var(--primary-glow)` 發光。

5. **60Hz 高頻渲染效能排除**：
   - 所有 Canvas、[class*="recharts"] 圖表、`input[type="range"]` 與 `input[type="color"]` 必須維持 `transition: none !important`，避免高頻數據驅動時的動畫延遲與效能瓶頸。

6. **極簡專業視覺 (Emoji 禁用原則)**：
   - 依據專案 `AGENTS.md` 規範，**嚴禁在 UI 字串或 UI 組件內直接加入 Emoji 圖示**。請改用 Halfmoon `.badge` 標籤、純文字符號（如 `▾`）或 SVG 向量圖示。

---

## 組件、佈局與 Helper 選用手冊

完整對照手冊請全盤參考 [HALFMOON_SPECIFICATION.md]。

### 1. 面板與容器 (Card & Panels)
* 靜態儀表 / 調校精靈步驟容器：`<div className="glass-panel p-4">...</div>`
* 可點擊選擇卡片（如主題預覽卡、設定檔卡）：`<button className="glass-panel-interactive p-3 border rounded">...</button>`

### 2. 按鈕系統 (Buttons & Button Groups)
* **主要動作 (Primary)**：`<button className="btn btn-primary fw-bold">儲存設定</button>`
* **次要動作 (Secondary Outline)**：`<button className="btn btn-outline-secondary btn-sm">主題設定</button>`
* **危險動作 (Danger)**：`<button className="btn btn-outline-danger btn-sm">刪除 Slot</button>`
* **按鈕組 (Btn Group)**：`<div className="btn-group"><button className="btn btn-sm active">Dashboard</button></div>`
* **霓虹特效**：`<button className="btn btn-primary cyber-btn-glow">啟動算牌精靈</button>`

### 3. 表單控制項 (Forms & Inputs)
* 輸入框：`<input className="form-control" type="number" />` 或 `cyber-input`
* 下拉選單：`<select className="form-select">...</select>`（禁止寫死黑底 `background: black`）
* 範圍滑桿：`<input type="range" className="form-range" min="0" max="100" />`
* 開關切換器：`<div className="form-check form-switch"><input className="form-check-input" type="checkbox" /></div>`

### 4. 徽章狀態標籤 (Badges)
* 訊號正常：`<span className="badge text-bg-success">UDP SIGNAL ACTIVE</span>`
* 訊號中斷：`<span className="badge text-bg-danger">UDP DISCONNECTED</span>`
* 車輛組別：`<span className="badge text-bg-info">S1 Class</span>`
* 精靈步驟：`<span className="badge bg-primary-subtle text-primary">1</span>`

### 5. 側邊抽屜與對話框 (Offcanvas & Modals)
* 抽屜面板 (`ThemeView` / `DiagnosticConsole`)：採用常態 DOM 掛載 + `show` prop 切換。
* Modal 彈窗 (`ChartEditModal`)：帶 `.modal-backdrop` 與 `z-index: 1055` 鎖定焦點。

### 6. 導覽列與容器滾動邊界護欄
* Navbar 下拉選單保護：`.navbar` 與 `.navbar .container-fluid` 必須包含 `overflow: visible !important`。
* 頁面容器防橫向滾動：`main .container-fluid` 必須包含 `max-width: 100% !important; overflow-x: hidden !important;`。

---

## 開發與變更驗證 SOP

當開發或修改前端 UI 組件時，Agent 必須執行以下驗證步驟：

1. **樣式與規格遵循檢查**：
   - 檢查組件內是否有硬編碼顏色、Emoji 圖示或違規的 hover 動畫。
   - 確認主色彩使用 `var(--primary)`，語意文字使用 `var(--text-primary)` / `var(--text-secondary)`。
   - 確認變更符合 [HALFMOON_SPECIFICATION.md] 規範。
2. **單元測試驗證**：
   - 從專案根目錄執行前端測試：
     ```bash
     cmd /c "pnpm -C frontend run test"
     ```
3. **主題相容性確認**：
   - 確認切換 `data-bs-theme="dark"` / `data-bs-theme="light"` 以及切換 `data-bs-core` (default/modern/eligible) 時組件高對比度正常且字體清晰。
