# 前端 UI 與設計系統架構規範 (UI Architecture & Design System)

本規範定義 FH6-HorizonTuner 前端視覺呈現、Halfmoon CSS 設計系統、版型穩定度與 React 元件架構原則。

---

## 一、 雙層視覺架構 (Dual-Layer Architecture)

1. **職責劃分**：
   - **Layer 1（核心基礎）**：採用 **Halfmoon CSS v2.0.2**，提供 Bootstrap 相容之語意標籤、響應式排版與按鈕/表單基底。
   - **Layer 2（專案外觀）**：於 `src/App.css` 定義 Glassmorphism 賽車暗色/亮色主題皮膚與霓虹發光變數。
2. **禁止硬編碼色彩**：
   - 所有背景、文字、邊框與陰影一律使用 CSS 語意變數（例如 `var(--glass-bg)`, `var(--text-primary)`, `var(--surface-1)`, `var(--primary)`）。
   - 嚴禁在 inline style 或自訂樣式中寫死 `#000000` 或 `#ffffff`。
3. **極簡專業視覺（Emoji 禁用原則）**：
   - **嚴禁在 UI 字串或 UI 組件內直接加入 Emoji 圖示**。改用 Halfmoon `.badge` 標籤、標準純文字符號（如 `▾`）或 SVG 向量圖示。

---

## 二、 版型穩定性與防破版護欄 (Layout Stability Guardrails)

### 1. 全域 ModalPortal 護欄 (React Portal Mandate)
- **規範**：所有全螢幕覆蓋物（包括 Modal 彈窗、Offcanvas 側邊抽屜如 `ThemeView` / `DiagnosticConsole` / `UnitSettingsSidebar` 以及 Backdrops）**必須統一使用 `ModalPortal` (React Portal) 掛載至 `document.body`**。
- **原因**：防止組件直接內嵌於帶有 `backdrop-filter`、`transform` 或局部 `overflow` 的父容器內，導致 CSS Containing Block 陷阱引發的排版破裂或層級穿透。

### 2. 版型零擠壓原則 (Zero Layout Shift for Alerts & Toasts)
- **規範**：嚴禁在 View 容器內部動態插入會推擠 DOM 高度的 Block 內嵌 `<div className="alert">` 區塊，避免推擠 Grid 版型或引發 60Hz 繪圖區域的重排。
- **解法**：
  - **狀態提示**：使用 Header Badge 配合 `position: absolute; top: calc(100% + 8px); z-index: 1050;` 向下展開的 `.popover.bs-popover-bottom.glass-panel` 浮動氣泡。
  - **非阻斷性全域通知**：使用 `useToast().addToast(...)` 於右上角固定位置彈出。

### 3. 防閃爍 (Anti-FOUC) 護欄
- 頁面首幀透過 HTML `data-bs-theme` (dark/light) 與 `data-bs-core` (default/modern/elegant) 同步外觀模式，確保 React 掛載前第一幀樣式與 localStorage 完全一致。

---

## 三、 元件職責與模組化 (Component Architecture)

### 1. 多步驟精靈獨立 TSX 組件規範 (Wizard Step Modularity)
- 對於精靈嚮導或多步驟介面（如 Tuning Workflow），**每一個 Step 必須各自獨立為一個 TSX 組件檔**（例如 `Step1GoalSetup.tsx`、`Step2GearboxSetup.tsx`、`Step3ChassisTuner.tsx`）。
- 主 View（例如 `TuningView.tsx`）僅作為 View Container，專注於導覽進度條 (Stepper Header) 與 Step 間的狀態分發，嚴禁將各步驟的 UI 表單細節混在主 View 中。

### 2. 60Hz 高頻繪圖效能隔絕
- 所有 Canvas、圖表、滑桿控制項在 60Hz 遙測即時更新時，必須維持 `transition: none !important`，避免高頻數據流觸發動畫佇列堆疊導致介面遲鈍。
