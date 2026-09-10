---
name: halfmoon-design-system
description: 當開發或重構前端 UI 組件、調整 Halfmoon CSS v2 主題設定、自訂 Form/Card/Button 面板或維護 Glassmorphism 視覺行為標準時觸發此技能。
---

# Halfmoon CSS 視覺設計與組件規範技能指南 (Halfmoon Design System Skill)

本技能提供前端 UI 開發、主題設定、元件選用與 Glassmorphism 視覺行為之規範路由器與防護原則。

## 六大核心視覺契約與護欄 (Core Invariants)

1. **雙層架構與語意權杖 (Two-Layer Architecture & Tokens)**：
   - 核心框架使用 **Halfmoon CSS v2.0.2**（Layer 1），覆蓋與皮膚調整於 `src/App.css`（Layer 2）。
   - **禁止硬編碼顏色**：背景色、文字色、邊框與陰影必須使用語意化 CSS 變數（如 `var(--glass-bg)`, `var(--text-primary)`, `var(--surface-1)`, `var(--primary)`），嚴禁於 inline style 硬編碼 `#ffffff` 或 `#000000`。
2. **首幀防閃爍 (Anti-FOUC) 護欄**：
   - 頁面載入首幀透過 HTML `data-bs-theme` (dark/light) 與 `data-bs-core` (default/modern/elegant) 設定外觀模式，保障 React 掛載前樣式與 localStorage 完全一致。
3. **靜態面板 vs 互動卡片明確分離**：
   - 靜態資訊/圖表面板：使用 `.glass-panel` 或 `.card`，絕對不加 hover 浮動位移動畫。
   - 可點擊選單/卡片：使用 `.glass-panel-interactive` 或 `.card-interactive`，點擊與懸浮時觸發位移與發光。
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
3. **主題切換確認**：確認在 `data-bs-theme="dark"` / `"light"` 及三大 core 風格下高對比度正常且字體清晰。

---

## 搭配資料 (References)
- [HALFMOON_SPECIFICATION.md](HALFMOON_SPECIFICATION.md)：完整組件、佈局、Helper Utilities 與 CSS Tokens 規格手冊。
