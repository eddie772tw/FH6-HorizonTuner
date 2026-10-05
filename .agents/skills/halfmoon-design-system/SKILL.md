---
name: halfmoon-design-system
description: 當開發或重構前端 UI 組件、調整 Halfmoon CSS v2 主題設定、自訂 Form/Card/Button 面板或維護 Glassmorphism 視覺行為標準時觸發此技能。
---

# Halfmoon CSS 視覺設計與組件規範技能指南 (Halfmoon Design System Skill)

本技能提供前端 UI 開發、主題設定、元件選用與 Glassmorphism 視覺行為之規範路由器與防護原則。

## 六大核心視覺契約與護欄 (Core Invariants)

1. **雙層架構與語意權杖 (Two-Layer Architecture & Tokens)**：
   - 核心框架使用 **Halfmoon CSS v2.0.2**（Layer 1）。Layer 2 由 `App.css` 載入中性 token、版面、共用控制項、分頁結構及 `styles/design-systems/index.css`。Core Theme 包含配色與元件細節；Default／Modern／Elegant 屬於 Halfmoon，Swiss Technical／Editorial／Contrast 屬於 Swiss。catalog 為歸屬關係的唯一來源，各系統 CSS 限定於 `data-design-system`，不可把 Swiss 外觀無條件施加到其他系統。
   - **禁止硬編碼顏色**：背景色、文字色、邊框與陰影必須使用語意化 CSS 變數（如 `var(--glass-bg)`, `var(--text-primary)`, `var(--surface-1)`, `var(--primary)`），嚴禁於 inline style 硬編碼 `#ffffff` 或 `#000000`。
2. **首幀防閃爍 (Anti-FOUC) 護欄**：
   - 首幀與 React 共用 `themeSettings.ts` 正規化及 `themeDocument.ts` 套用入口，設定 `data-bs-theme`、`data-bs-core`、`data-design-system`。保留 `halfmoonCore` 儲存合約；設計系統只由 catalog 推導。所有核心的 Color Presets 必須同步原生 Halfmoon `--bs-primary-*` 與專案色彩；成功／警告／錯誤維持語意色。
3. **靜態面板 vs 互動卡片明確分離**：
   - 靜態資訊/圖表面板：使用 `.glass-panel` 或 `.card`，絕對不加 hover 浮動位移動畫。
   - 可點擊選單/卡片：使用 `.glass-panel-interactive` 或 `.card-interactive`，由 `--interactive-transform`／`--interactive-shadow` 決定 hover；Halfmoon 保留位移與光暈，Swiss 禁用裝飾位移／光暈。
4. **60Hz 高頻渲染效能排除**：
   - 所有 Canvas、[class*="recharts"] 圖表、`input[type="range"]` 與 `input[type="color"]` 必須維持 `transition: none !important`，避免每幀數據驅動時的動畫延遲與重排重繪。
5. **全域 Portal 掛載護欄 (ModalPortal)**：
   - 所有抽屜面板 (`ThemeView` / `DiagnosticConsole` / `UnitSettingsSidebar`) 與 Modal 彈窗 (`DataOutGuide` / `UpdateModal` / `ChartEditModal`) **必須統一使用 `ModalPortal` (React Portal) 掛載至 `document.body`**，嚴禁內嵌於帶有 `backdrop-filter`、`transform` 或局部 `overflow` 的父容器內。
6. **極簡專業視覺 (Emoji 禁用原則)**：
   - **嚴禁在 UI 字串或 UI 組件內直接加入裝飾性 Emoji 圖示**。改用 Halfmoon `.badge` 標籤、純文字符號（如 `▾`）或 SVG 向量圖示。

---

## 元件與佈局選用路由器

完整元件清單、HTML 結構範例與 Helper Utilities 請全面參閱 [HALFMOON_SPECIFICATION.md](HALFMOON_SPECIFICATION.md)：

- **面板與容器 (Panels & Cards)**：靜態面板使用 `.glass-panel`，互動卡片使用 `.glass-panel-interactive`。
- **按鈕系統 (Buttons & Groups)**：主要動作 `.btn-primary`、次要動作 `.btn-outline-secondary`、霓虹特效 `.cyber-btn-glow`。
- **表單控制項 (Forms & Sliders)**：輸入框 `.form-control` / `cyber-input`、滑桿 `.form-range`、開關 `.form-switch`。
- **徽章標籤 (Badges)**：狀態標籤 `.badge.text-bg-success` / `.badge.text-bg-danger`。
- **抽屜與對話框 (Offcanvas & Modals)**：透過 `ModalPortal` 掛載至 body，常態 DOM 掛載 + `show` prop 切換。
- **通知與向下 Popover (Toasts & Popovers)**：狀態氣泡使用 `.popover.bs-popover-bottom.glass-panel`，全域 Toast 使用 `useToast().addToast(...)`。

---

## 開發與變更驗證 SOP

當開發或修改前端 UI 組件時，Agent 依序執行：
1. **樣式與規範遵循檢查**：確認無硬編碼顏色、無 Emoji 圖示、無違規 hover 動畫，且符合 [HALFMOON_SPECIFICATION.md](HALFMOON_SPECIFICATION.md)。
2. **單元測試驗證**：從專案根目錄執行 `cmd /c "pnpm -C frontend run test"`。
3. **主題切換確認**：確認 catalog 所有 core 的日夜模式、配色與元件細節。Swiss 使用實色表面、底線分頁、細框徽章及無裝飾陰影；Editorial 採暖紙色與閱讀標題，Contrast 採中性灰階、直角及反差標頭。`workspace-panel-header` 由系統 token 管理，標頭控制項與提示保留自己的可讀表面。切回 Halfmoon 須恢復其圓角、實色分頁／徽章及玻璃材質。驗證配色跨系統保留、首幀與重新載入一致。外觀面板依系統分組，Color Presets 位於系統色彩調配內，CSS 編輯器及 Cheatsheet 預設折疊且既有自訂 CSS 仍生效。保留鍵盤焦點、ModalPortal 與高頻繪圖例外。

---

## 搭配資料 (References)
- [HALFMOON_SPECIFICATION.md](HALFMOON_SPECIFICATION.md)：完整組件、佈局、Helper Utilities 與 CSS Tokens 規格手冊。
- [主題與設計系統開發指南](../../../docs/frontend/design-systems.md)：核心／CSS 責任地圖、擴充步驟、驗收矩陣與 Companion 邊界。
