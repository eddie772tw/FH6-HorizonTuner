# FH6-HorizonTuner 前端設計系統與組件規格書 (Halfmoon / Swiss / Rhine)

> **文件版本**：2.6.0
> **參考標準**：[Halfmoon CSS v2.0.2 官方文件 (gethalfmoon.com/docs)](https://www.gethalfmoon.com/docs/) + Bootstrap 5 相容語意層  
> ** Agent 遵循與維護宣告**：所有 AI Agent 在開發、重構或維護前端 UI 組件與 Halfmoon CSS 樣式時，**必須嚴格遵循並主動維護本規格書**與 [halfmoon-design-system](SKILL.md) 技能標準。
> **目標與任務**：定義與規範 FH6-HorizonTuner 專案在實際前端開發時套用 Halfmoon CSS 所有 Components、Layout、Helpers 與 Utilities 的特定規格、參數、語意 Token、視覺行為與使用時機。

實作入口、核心清單及送審矩陣見[主題與設計系統開發指南](../../../docs/frontend/design-systems.md)。本檔保留原路徑供既有技能引用；Halfmoon 是共用 CSS 基底，元件外觀由各設計系統限定。

---

## 1. 設計系統基礎架構與主題變數 (Theme & Core Engine)

FH6-HorizonTuner 前端採用 **雙層視覺設計架構 (Two-Layer Visual Architecture)**：

```
+-----------------------------------------------------------------------+
|  Layer 2: App.css -> shared styles + styles/design-systems/          |
|  - 賽車儀表動態霓虹權杖 (--primary, --secondary, --accent, --primary-glow) |
|  - 語意化表面材質變數 (--glass-bg, --glass-border, --surface-1/2/3)   |
+-----------------------------------------------------------------------+
|  Layer 1: Halfmoon CSS v2.0.2 (Base CSS Framework)                    |
|  - 核心 CSS 語意檔 (halfmoon.min.css & halfmoon.cores.css)             |
|  - Bootstrap 5 相容 HTML 語意標籤與 Layout 系統                        |
+-----------------------------------------------------------------------+
```

### 1.1 主態與主題切換機制 (Theme & Core Attributes)

七個核心沿用 Layer 2，保留既有八組配色並提供 Swiss Signal、Bauhaus Mono 與 Rhine Lab，共十一組 Color Presets。`context/themeSettings.ts` 是載入、匯入、React 更新及首幀設定的共同正規化入口；Bauhaus Mono 與 Rhine Lab 以完整三色組識別，日間主色為黑、夜間為淺白，其他自訂配色不改寫。

Core Theme 同時決定整體配色風格與元件細節。`context/themeCatalog.ts` 統一登錄核心及設計系統歸屬：Default／Modern／Elegant 屬於 Halfmoon，Swiss Technical／Editorial／Contrast 屬於 Swiss，Rhine Lab 屬於 Rhine。外觀面板依此 registry 分組，不維護第二份選項表。

Swiss Technical 保留 `swiss` ID；新增 `swiss-editorial` 與 `swiss-contrast`，皆沿用 schema 2 的 `halfmoonCore` 欄位。Editorial 使用暖紙白／暖炭黑、2px 面板圓角、較自然字距及 1.05rem 區塊標題；Contrast 使用中性黑白灰、直角控制項、2px 標頭分隔與反差標頭。三核心共用 Swiss 元件規則、無模糊／光暈及既有分頁尺寸；切換核心不重設三色。

`workspace-panel-header` 是即時儀表、調校、賽事摘要及設定的共用結構 hook。`--panel-heading-*` 管理字級、成對底色／文字、內距及分隔線；標頭內按鈕、徽章與提示仍保留自己的表面，不能無差別反轉所有後代色彩。Swiss／Rhine 選擇卡的預覽（catalog 的 preview 指定元件模式，使用獨立 theme-core-preview__* class）以相同 core／mode 屬性及 `themeColorProperties` 顯示實際元件；巢狀預覽必須重新套用三色映射，避免內層 `data-bs-theme` 重設 Halfmoon 原生主色。

Halfmoon 按鈕與卡片材質以 Swiss 導入前的 `22f9660f` 為參照：`.btn` 沿用 Halfmoon 原生尺寸圓角、outline/hover 狀態及 cyber 按鈕縮放；`.card`／`.glass-panel` 保留原本玻璃 token 與 utility 圓角優先權。一般即時儀表外層只負責排版，不新增整片玻璃底色、邊框或投影；材質由內層儀表容器負責，展開面板保留獨立表面。Swiss 的實色卡片、統一細框與按鈕圓角只存在於 Swiss 模組。現行分頁設計與響應式修正不回退。

`App.css` 只管理載入順序：`themes.css` 定義中性 token 合約，`base.css` 管理版面，`components.css` 讓控制項消費 token，`navigation.css` 管理 `.workspace-tabs` 的結構與響應式寬度；最後載入 `design-systems/index.css` 的系統模組。Halfmoon 圓角實色分頁／徽章與 Swiss 底線分頁／細框徽章各自限定於 `data-design-system`。一般分頁依內容寬度且最大 14rem；調校步驟保留編號與滿列等寬，手機兩欄。

首幀與 React 共用 `themeDocument.ts` 寫入根元素屬性，並以 `themeColorProperties` 將使用者配色同步至 `--primary/secondary/accent` 及 Halfmoon 的 `--bs-primary-*`、HSL 與勾選圖示；原生按鈕、開關、進度條和 utilities 不得停留於核心預設配色。成功／警告／錯誤等功能語意色保持獨立。儲存與 JSON 匯入／匯出繼續使用 `halfmoonCore` 欄位及 schema 2；`data-design-system` 由 catalog 推導，不接受匯入檔指定另一套歸屬。

外觀面板將三個色票／HEX 欄位及 Color Presets 收在「系統色彩調配」內。CSS 編輯器、匯入／匯出及 Cheatsheet 放在預設關閉的原生 `details`；折疊不會停用已儲存的自訂 CSS。

Rhine 限定樣式位於 `rhine.css`：頂部刻度導覽、檔案頁標頭、單欄設定分節與平整儀器表面。六個主選單面板在 1024px 以上統一為置中紙頁（設定 65rem、外觀 54rem、診斷 58rem、Companion 60rem、MCP 50rem、關於 38rem，視窗邊距 24px），窄畫面保留抽屜。入場 220ms、退出 160ms、最多位移 8px；刻度 150ms、底線 180ms。只在靜態頁首使用一次性動畫；reduced motion 到終態，高頻圖表及祖先容器不套入場動畫。MiSans 400／600 保留原始分片、授權與回退字體。完整素材與版面約束見 [Rhine 指南](../../../docs/frontend/rhine-lab.md)。

#### 擴充核心與設計系統
1. 在 `themeCatalog.ts` 登錄新核心；同系統沿用既有 designSystem，新系統先加入 `DESIGN_SYSTEMS`。
2. 在對應的 `styles/design-systems/<system>.css` 定義模式／核心配色與材質 token。系統特有的分頁、徽章等 selector 必須以 `[data-design-system="<system>"]` 限定範圍；新模組加入 `index.css` 靜態載入，保證首幀可用。
3. 共用元件透過 token 表達差異；儀表讀取 `--instrument-glow-strength` 等 token 並快取，不在繪圖循環查 DOM，也不加入 `isSwiss` 等核心名稱分支。`utils/canvasTheme.ts` 同時供即時、調校及分析 Canvas 使用；SVG 圖表以 `.core-theme-chart` 消費格線、字體與表面 token。`flat`／`alertFlash` 管理平直儀表及警示，`linear` 保留 Rhine 專屬尺規與方形標記。字體載入完成須重畫靜態 Canvas，切換核心不得清空資料。
4. 補核心歸屬、舊設定載入及首幀／React 一致性驗證；瀏覽器檢查日夜、配色、跨系統往返、鍵盤焦點與窄畫面。新增設計系統不需要複製各個頁面的 CSS。

Swiss 的 `--bg-gradient` 為各核心定義的實色；Technical 夜間為 `#0b0d12`、日間為 `#f8fafc`，Editorial 與 Contrast 各有獨立日夜表面。三核心皆為 `--glass-shadow: none`、`--glass-blur: 0px`，主要面板直接使用 `backdrop-filter: none`。`--on-primary` 依主色相對亮度選取黑或白，供實色按鈕文字使用。焦點使用清楚的 outline。全域數字採 `tabular-nums lining-nums`；Swiss 採 Inter／系統無襯線字型。

遙測沿用五張卡片及四輪順序，以 8px 間距、1px 邊框分組；窄畫面改為可捲動堆疊，手機上的四輪區塊改為單欄。調校沿用四個獨立步驟，以 `tuning-workflow__steps` 與 `tuning-workflow__grid` 套用階層及 16px 網格間距。樣式不改寫步驟解鎖、量測、調校公式或 Portal 行為。

即時儀表卡片及其開關提示不使用 `backdrop-filter`：Halfmoon 一般卡片外層維持透明排版容器、內層保留原材質；Swiss 由系統模組提供實色面板與細框。提示使用不透明模式底色，避免動態 Canvas 與滑鼠提示疊加模糊圖層。Halfmoon 的導覽列、抽屜與一般靜態面板仍使用玻璃模糊。

透過 HTML 根元素 (`<html>`) 的三個屬性實作動態主題切換：

* **`data-bs-theme`** (外觀模式)：
  - `dark`（預設暗色模式，適合賽車儀表板與低光源環境）
  - `light`（高對比亮色模式，適合日間明亮環境）
* **`data-bs-core`** (核心風格)：
  - `default`（經典青藍 Slate 經典調校風格）
  - `modern`（深靛藍 Navy 現代競賽風格）
  - `elegant`（暖沙 Espresso 典雅精緻風格）
  - `swiss`（消光表面、髮絲邊框、工程數字排版）
  - `swiss-editorial`（暖紙色／暖炭色、閱讀層級、細微圓角）
  - `swiss-contrast`（中性黑白、直角、反差標頭）
  - `rhine-lab`（MiSans 紙面檔案、刻度導覽、短暫 2D 動效）
* **`data-design-system`** (衍生的元件設計系統)：`halfmoon`、`swiss` 或 `rhine`，由核心 catalog 決定。

#### 首幀防閃爍 (Anti-FOUC) 腳本
由 `src/app/applyThemeEarly.ts` 於 React DOM 掛載前同步寫入模式、核心、設計系統及正規化配色，桌面、Lite 與 Web Companion 共用；Android Compose 的 receive-only 投影、endpoint cache／generation 與 token 映射見 [Companion 主題契約](../../../companion/theme/README.md)；#485 仍追蹤原生視覺與裝置驗收：
```typescript
import { applyThemeEarly } from './app/applyThemeEarly';
applyThemeEarly();
```

### 1.2 全域 CSS 設計權杖表 (Design Tokens)

`src/styles/themes.css` 提供中性預設；具體顏色、材質與元件細節定義於 `styles/design-systems/`，以 `data-design-system` 搭配模式／核心選擇器限定。共用元件以 `--surface-filter`、`--heading-color`、`--input-radius`、`--panel-radius`、`--interactive-shadow` 等 token 決定外觀。以下色值為 Halfmoon 參考，Swiss 依上節覆寫：

| CSS 變數名稱 | 語意與用途 | Dark Mode (暗色) | Light Mode (亮色) | 專案規範與邊界 |
| :--- | :--- | :--- | :--- | :--- |
| `--primary` | 主品牌色 (核心高亮/焦點點亮) | `#00f0ff` (Cyan) | 可由 ThemeContext 自訂 | 禁止硬編碼，用於焦點、按鈕與圖表高亮 |
| `--secondary` | 次品牌色 (次要資訊/輔助狀態) | `#ff003c` (Neon Red) | 可由 ThemeContext 自訂 | 用於次要警示與雙軌對比線段 |
| `--accent` | 強調標示 (特殊數據/極限標誌) | `#7000ff` (Purple) | 可由 ThemeContext 自訂 | 用於極限調校點與輔助指標 |
| `--primary-glow` | 主色發光擴散陰影 | `rgba(0,240,255,0.25)` | 隨 `--primary` 動態計算 | 應用於 Hover 光暈與 Focus 擴散環 |
| `--text-primary` | 第一級主要文字內容 | `#f1f5f9` (Slate 100) | `#0f172a` (Slate 900) | 標題、主要數值、控制項輸入文字 |
| `--text-secondary` | 第二級次要說明文字 | `#94a3b8` (Slate 400) | `#475569` (Slate 600) | 輔助標籤、單位說明、註解提示 |
| `--glass-bg` | 毛玻璃容器背景色 | `rgba(20,24,33,0.70)` | `rgba(255,255,255,0.82)` | 用於卡片與面板襯底，搭配 `blur(14px)` |
| `--glass-border` | 毛玻璃容器邊框色 | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.10)` | 面板與分隔框線 |
| `--glass-shadow` | 面板陰影 | `0 16px 40px rgba(0,0,0,0.45)` | `0 12px 36px rgba(0,0,0,0.08)` | 下拉選單與卡片投影 |
| `--surface-1` | 第一層凸起容器/內部卡片 | `rgba(0,0,0,0.28)` | `rgba(241,245,249,0.85)` | 內部子區塊、選單底框 |
| `--surface-2` | 第二層控制項/輸入軌道 | `rgba(0,0,0,0.18)` | `rgba(226,232,240,0.75)` | 表單輸入底框、Range 軌道、Badges 襯底 |
| `--surface-3` | 第三層 Hover / Focus 點亮區 | `rgba(255,255,255,0.05)` | `rgba(203,213,225,0.50)` | 卡片 Hover 點亮、選單被選擇項目 |
| `--divider` | 極淺區隔線 | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.09)` | `hr` 分隔線與圖表網格線 |

---

## 2. Components (組件規格與參數)

沿用 Halfmoon CSS 組件分類與語意類別。以下元件消費系統 token；不能將 Halfmoon 的玻璃／光暈或 Swiss 的細框外觀寫成全域固定值。實際值以 `styles/design-systems/` 為準。

### 2.1 Cards & Glass Panels (卡片與毛玻璃容器)

* **官方組件**：`.card`, `.card-header`, `.card-body`, `.card-footer`, `.card-title`, `.card-subtitle`, `.card-text`
* **專案擴充類別**：`.glass-panel`, `.glass-panel-interactive`, `.card-interactive`, `.halfmoon-card`
* **特定規格參數與選用原則**：

| 類別組合 | CSS 參數與視覺表現 | 適用時機與業務場景 | 禁忌與行為規範 |
| :--- | :--- | :--- | :--- |
| `.glass-panel` / `.card` | 使用 `--glass-bg`、`--glass-border`、`--panel-radius` 與系統材質；Halfmoon 靜態玻璃有模糊，Swiss 無模糊 | **靜態面板**：調校步驟容器、資訊面板；即時卡片遵守上節模糊例外 | 禁止添加 hover 浮動動畫；Halfmoon utility 圓角保留，Swiss 由核心統一 |
| `.glass-panel-interactive` / `.card-interactive` | 繼承靜態面板與互動游標；hover 消費 `--interactive-transform`／`--interactive-shadow` | **可點擊互動卡片**：Slot 存檔與圖表選擇卡；核心選擇卡另使用 `.theme-choice` | Halfmoon 依 token 浮動／發光，Swiss 維持無位移／無光暈；不能把動畫寫死在頁面 |

---

### 2.2 Buttons & Button Groups (按鈕與按鈕組)

* **官方組件**：`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, `.btn-warning`, `.btn-info`, `.btn-outline-*`, `.btn-sm`, `.btn-lg`, `.btn-group`, `.btn-group-sm`
* **專案擴充類別**：`.cyber-btn-glow`
* **特定規格參數與選用原則**：

| 類別組合 | 尺寸與顏色參數 | 適用時機與業務場景 | Focus / Active 視覺規範 |
| :--- | :--- | :--- | :--- |
| `.btn.btn-primary` | 背景由 `--primary` 映射，文字由 `--on-primary`／原生 foreground 映射選擇黑白 | **主要核心操作**：如「儲存車輛參數」、「計算齒輪比」、「確定發布」。 | 鍵盤 focus 使用 `--focus-color` outline；須在反差標頭上仍可辨識 |
| `.btn.btn-outline-primary` | 背景透明，`border: 1px solid var(--primary)`, 文字 `var(--primary)` | **次要強調動作**：如「顯示日誌 (Show Logs)」、「開啟編輯器」。 | Hover 時自動滿版 `var(--primary)` 襯底 |
| `.btn.btn-outline-secondary` | Halfmoon 沿用原生外框；Swiss 使用 `--glass-border`／`--text-secondary` | **中性輔助動作**：如「主題設定 (Theme)」、「重置選項」、「關閉 Modal」。 | Swiss hover 使用 `--surface-3`；反差標頭的外框按鈕保留自己的底色 |
| `.btn.btn-danger` / `.btn-outline-danger` | 紅色警示色彩 | **危險/破壞性操作**：如「刪除 Slot」、「清除遙測紀錄」。 | 需要明確二次確認或警示提示 |
| `.btn.btn-sm` | 沿用 Halfmoon 原生尺寸；Swiss 另消費 `--input-radius` 與字重 token | 導覽列動作、密集表單列與局部工具列。 | 不以不同外距補償相鄰按鈕高度 |
| `.btn-group` | 橫向緊密按鈕群組 | 相對值／絕對值等局部模式切換；頁面分頁使用 `.workspace-tabs`。 | 保留選中與停用狀態 |
| `.cyber-btn-glow` | Halfmoon 保留既有縮放／光暈；Swiss 禁用裝飾位移與陰影 | 既有強調操作。 | 高頻繪圖與靜態面板不套用 |

---

### 2.3 Forms & Input Controls (表單與輸入控制)

* **官方組件**：`.form-label`, `.form-control`, `.form-select`, `.form-check`, `.form-check-input`, `.form-check-label`, `.form-switch`, `.form-range`, `.input-group`, `.input-group-text`
* **專案擴充類別與組件**：`.cyber-input`, `.cyber-select`, `RenderSwitch`, `ToggleSwitch`
* **特定規格參數與選用原則**：

| 元件 / 類別 | CSS 規格與參數 | 適用時機與業務場景 | 特殊規則與限制 |
| :--- | :--- | :--- | :--- |
| `.form-control` / `.cyber-input` | 使用 `--input-bg`、`--input-text`、`--glass-border` 與原生／系統圓角 | 車輛物理參數輸入框（車重、前後輪胎尺寸、彈簧磅數範圍）。 | 鍵盤 focus 使用 `--focus-color` 與 `--form-focus-shadow` |
| `.form-select` / `.cyber-select` | 繼承 input 樣式 + 右側原生箭頭向下空間 | 賽事類型選擇 (Road/Drift/Rally/Drag)、季節選擇 (Summer/Winter)。 | **禁止寫死黑底**（`background: black`），統一導轉至 `var(--input-bg)` |
| `input[type="range"]` / `.form-range` | 軌道高度 `6px` (`var(--surface-2)`)，Thumb 圓點 `16px x 16px` (`var(--primary)`) | 懸吊高度調整、ARB 硬度調整、齒輪比動態拉桿。 | **效能例外**：必須設定 `transition: none !important` 與 `animation: none !important` 確保 60FPS 拖動 |
| `.form-check.form-switch` / `RenderSwitch` | 關閉灰軌，開啟時跟隨主要色；圖示與效果由共用映射及系統 token 決定 | 遙測卡片獨立渲染開關、HUD Overlay 懸浮窗啟用開關。 | 不引起頁面 re-layout；提示使用不透明表面、不疊加模糊 |
| `.input-group` + `.input-group-text` | 前置/後置單位組合框 | 輸入帶單位的數值（如 `kgf/mm`, `PSI`, `mm`, `kg`）。 | 單位文字以 `var(--surface-2)` 與 `var(--text-secondary)` 呈現 |

---

### 2.4 Badges & Status Tags (標籤與徽章)

Halfmoon 保留原生實色徽章；下表描述 Swiss 的細框／淡色表面。兩者共用成功、警告、錯誤等語意類別，不以 Color Presets 改寫功能意義。

* **官方組件**：`.badge`, `.text-bg-primary`, `.text-bg-secondary`, `.text-bg-success`, `.text-bg-danger`, `.text-bg-warning`, `.text-bg-info`, `.bg-primary-subtle`, `.text-primary`, `.rounded-pill`
* **特定規格參數與選用原則**：

| 類別組合 | 視覺呈現與顏色 | 適用時機與業務場景 |
| :--- | :--- | :--- |
| `.badge.text-bg-success` | 淡綠背景、語意文字與細框 | **連線正常指示**：如 `UDP SIGNAL ACTIVE` 狀態標籤。 |
| `.badge.text-bg-danger` | 淡紅背景、語意文字與細框 | **斷線/異常指示**：如 `UDP DISCONNECTED` 或觸底告警。 |
| `.badge.text-bg-info` | 淡藍背景、語意文字與細框 | **車輛等級標籤**：如 `S1`, `S2`, `Class X`。 |
| `.badge.bg-primary-subtle.text-primary` | 淡主色背景、中性文字與主色細框 | **嚮導步驟或一般主色狀態**。 |
| `.badge.text-bg-warning` | 淡黃背景、語意文字與細框 | **警告標記**：如 `EV` 電腦模擬過載或暫停提示。 |

---

### 2.5 Alerts, Popovers & Notifications (通知、懸浮 Popover 與狀態氣泡標準)

* **官方組件**：`.alert`, `.popover`, `.bs-popover-bottom`, `.toast`, `.toast-container`, `.btn-close`
* **特定規格參數與選用原則**：

> [!IMPORTANT]
> **版型零擠壓護欄 (Non-Disruptive Layout Guardrail)**：嚴禁在 View 視圖內部隨意動態插入會推擠 DOM 高度（Block-level in-flow）的 `<div className="alert">` 區塊，避免擠壓 60Hz 高頻繪圖與圖表 Grid。所有狀態通知必須採用以下兩種不干擾版型模式：

| 模式與類別組合 | CSS 規格與 Z-Index | 適用時機與業務場景 | 互動行為與規範 |
| :--- | :--- | :--- | :--- |
| **Header Badge 向下 Popover 模式**<br>`position: relative` + `.popover.bs-popover-bottom.glass-panel` | `position: absolute; top: calc(100% + 8px); left: 0; z-index: 1050;`；表面由系統決定，Swiss 與即時開關提示無模糊 | **狀態/警示詳細說明**：如 HUD 狀態、缺漏欄位。 | 保留各功能原有開關策略，支援關閉、焦點與完整內容可達；樣式不得改變觸發行為。 |
| **全域懸浮 Toast 模式**<br>`.toast-container.position-fixed.top-0.end-0.p-3` + `.toast.glass-panel` | `position: fixed; top: 0; right: 0; z-index: 1060;` | **即時非阻斷動作通知**：車輛設定檔匯入/匯出成功、主題切換通知、日誌清空完成。 | 不佔用 DOM 流，帶有滑順淡入動畫與 Auto-dismiss 自動定時收起機制。 |
| **頂部常態狀態 Alert 條**<br>`.alert.alert-danger` (頁面靜態標頭) | 靜態掛載，非動態突兀插入 | **阻斷性全頁鎖定警告**：極端錯誤導致頁面無法運作時使用。 | 僅限靜態佈局，不得在 60Hz 遙測畫面上動態切換推擠版型。 |

---

### 2.6 Dropdowns (下拉選單)

* **官方組件**：`.dropdown`, `.dropdown-toggle`, `.dropdown-menu`, `.dropdown-item`, `.dropdown-divider`, `.dropdown-header`, `.show`
* **特定規格參數與選用原則**：

| 類別 / 屬性 | CSS 規格與 Z-Index | 適用時機與規範 | 護欄與禁忌 |
| :--- | :--- | :--- | :--- |
| `.dropdown` | `position: relative` | 頂部全域導覽列選單（`Telemetry`, `Tuning Setup`, `Car Parameters`）。 | 父容器 `.navbar` 必須帶 `overflow: visible !important` |
| `.dropdown-menu` | `position: absolute`, `z-index: 1000`, `background: var(--surface-1)`, `border: 1px solid var(--glass-border)`, `box-shadow: var(--glass-shadow)` | 下拉選單浮動容器。 | **禁止嵌套 `.card`**，保持原生態半透明選單 |
| `.dropdown-item` | `padding: 0.5rem 1rem`, `color: var(--text-primary)` | 可點擊之快捷跳轉子項目。 | Hover 時自動套用 `var(--surface-3)` |

---

### 2.7 Navbars & Navs (導覽列與導頁標籤)

* **官方組件**：`.navbar`, `.navbar-brand`, `.navbar-nav`, `.nav-item`, `.nav-link`, `.nav-pills`, `.nav-tabs`, `.sticky-top`
* **特定規格參數與選用原則**：

| 類別 / 屬性 | CSS 規格與參數 | 適用時機與規範 | 護欄與限制 |
| :--- | :--- | :--- | :--- |
| `.navbar.sticky-top` | `z-index: 1050`、系統底色／模糊與底框；Swiss 禁用模糊 | 全站頂部固定導覽列。 | 下拉區必須保留 visible overflow，選單向下展開 |
| `.navbar-brand` | 保留品牌字級與字重，文字消費 `--heading-color` | 專案品牌標誌與 Git Commit 版本 Badge 容器。 | 不隨滾動消失 |
| `.workspace-tabs.nav` | 依內容寬度排列，單個標籤最大 14rem，空間不足換行；Halfmoon 作用中實色，Swiss 3px 主色底線 | 主導覽、頁內子分頁、共用 Companion 導覽與工作流步驟。一般分頁不編號，只有有順序流程使用 `.workspace-tabs__number`。調校 `.tuning-workflow__steps` 保留四欄等寬填滿整列；手機兩欄。 | 保留 ARIA、鍵盤與步驟門檻；Companion 卡片列可橫向捲動，完整原生／WebView 整合由 #485 追蹤 |

---

### 2.8 Offcanvas (抽屜式側邊與底部面板)

* **官方組件**：`.offcanvas`, `.offcanvas-start`, `.offcanvas-end`, `.offcanvas-bottom`, `.offcanvas-header`, `.offcanvas-title`, `.offcanvas-body`, `.offcanvas-backdrop`, `.show`
* **特定規格參數與選用原則**：

| 類別組合 | 滑出方向與 CSS 規格 | 適用時機與業務場景 | 常態掛載規範 |
| :--- | :--- | :--- | :--- |
| `.offcanvas.offcanvas-end.app-menu-drawer` | 右側滑入；共用 `--bs-offcanvas-width`／drawer 上限，窄畫面滿寬；ThemeView 層級為 1050 | **外觀設定 (`ThemeView`)**：應用程式選單 → 外觀。 | 常態 DOM 掛載 + `show` 切換；經 `ModalPortal` 掛載並保留焦點管理與內部捲動 |
| `.offcanvas.offcanvas-bottom` | 底部滑入，高度 `40vh` ~ `50vh`，`z-index: 1045` | **診斷主控台 (`DiagnosticConsole`)**：透過頂部工具列「Show Logs」喚起。 | 搭配 `.offcanvas-backdrop` 背景點擊關閉 |

---

### 2.9 Modal (對話框與彈窗)

* **官方組件**：`.modal`, `.modal-dialog`, `.modal-content`, `.modal-header`, `.modal-title`, `.modal-body`, `.modal-footer`, `.btn-close`, `.modal-backdrop`, `.show`
* **特定規格參數與選用原則**：

> [!IMPORTANT]
> **全域 React Portal 掛載規範 (ModalPortal Mandate)**：
> 所有全螢幕覆蓋物（包括所有 `.modal`、`.offcanvas`、`.modal-backdrop` 與全螢幕引導視窗如 `DataOutGuide`、`UpdateModal`、`ChartEditModal`、`UnitSettingsSidebar` 等）**必須透過 `ModalPortal` (`createPortal(..., document.body)`) 掛載至 `document.body`**。
> **嚴禁**將 Modal / Offcanvas 直接作為一般子元素內嵌在具有 `backdrop-filter`、`transform`、`filter` 或 `overflow: hidden` 的父容器（例如 `<nav.navbar>`、`<span id="build-info-badge">`、Card 面板等）內，以防止瀏覽器依據 W3C 規範強制生成局部 Containing Block 導致 fixed 定位座標系縮減與全螢幕遮罩撕裂破版。

| 類別組合 | 規格與 Z-Index | 適用時機與業務場景 |
| :--- | :--- | :--- |
| `.modal` + `.modal-dialog` | `z-index: 1055`, `background: var(--glass-bg)`, `border-radius: 16px`, `box-shadow: var(--glass-shadow)` | **Onboarding 連線引導 (`DataOutGuide`)**、**OTA 更新彈窗 (`UpdateModal`)**、**自訂通道編輯彈窗 (`ChartEditModal`)**、齒輪比進階設定彈窗、刪除確認框。 |
| `.modal-backdrop` | `z-index: 1050`, `background: rgba(0,0,0,0.7)`, `backdrop-filter: blur(4px)` | 鎖定背景焦點，點擊空白處關閉或取消編輯。 |

---

### 2.10 Progress Bars (進度條)

* **官方組件**：`.progress`, `.progress-bar`, `.bg-primary`, `.bg-success`, `.bg-danger`, `.bg-warning`
* **特定規格參數與選用原則**：

| 類別組合 | 規格與高度 | 適用時機與業務場景 |
| :--- | :--- | :--- |
| `.progress` + `.progress-bar` | 高度 `6px` 或 `10px`，`background: var(--surface-2)`，`progress-bar` 為 `var(--primary)` | 車輛重量分佈百分比示意、直線加速測試 0-100km/h 達成率。 |

---

### 2.11 Spinners & Loaders (加載指示器)

* **官方組件**：`.spinner-border`, `.spinner-grow`, `.spinner-border-sm`, `.text-primary`
* **特定規格參數與選用原則**：

| 類別組合 | 規格與尺寸 | 適用時機與業務場景 |
| :--- | :--- | :--- |
| `.spinner-border.text-primary` | `width: 2rem; height: 2rem;` | 車輛歷史 Session 解鎖與大數據載入中 Suspense 提示 (`Loading Analysis...`)。 |

---

### 2.12 Tables (表格)

* **官方組件**：`.table`, `.table-striped`, `.table-hover`, `.table-bordered`, `.table-borderless`, `.table-sm`, `.table-dark`, `.table-responsive`
* **特定規格參數與選用原則**：

| 類別組合 | 規格與樣式 | 適用時機與業務場景 |
| :--- | :--- | :--- |
| `.table.table-sm.table-hover` | `color: var(--text-primary)`, `border-color: var(--divider)` | 齒輪比各檔數值細節表、賽道單圈時間歷史分析列表。 |

---

## 3. Layout (網格與佈局系統規格)

根據 Halfmoon CSS 官方 Layout 規範，定義 FH6-HorizonTuner 之佈局邊界：

### 3.1 Containers (容器系統)

* **官方類別**：`.container`, `.container-fluid`, `.container-sm`, `.container-md`, `.container-lg`
* **專案特定規格**：
  - **全站主要 View 容器**：一律採用 `.container-fluid`。
  - **強防護邊界**：`main .container-fluid` **必須強制賦予 `max-width: 100% !important; overflow-x: hidden !important; box-sizing: border-box !important;`**，徹底杜絕因網格或計算邊界引發的全頁橫向滾動條。

### 3.2 Grid System & Gutters (網格與間距系統)

* **官方類別**：`.row`, `.col`, `.col-1` ~ `.col-12`, `.col-auto`, `.g-0` ~ `.g-5`, `.gx-*`, `.gy-*`
* **專案特定規格**：
  - **`.row` 負 Margin 消除**：`.row` 預設具備 `-1.5rem` 之負邊距，在內嵌視圖中必須設置 `margin-left: 0 !important; margin-right: 0 !important;`。
  - **間距配置**：一律使用 Halfmoon 官方間距級別（`.g-2` 為 0.5rem，`.g-3` 為 1rem），維持整體網格呼吸感。

### 3.3 Display & Flexbox Layouts (彈性盒與顯示控制)

* **官方類別**：`.d-flex`, `.d-grid`, `.d-inline-flex`, `.d-none`, `.d-block`, `.flex-row`, `.flex-column`, `.justify-content-between`, `.align-items-center`, `.flex-grow-1`, `.flex-shrink-0`, `.gap-1` ~ `.gap-5`
* **專案特定規格**：
  - **視圖 Header 佈局**：`d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom pb-2 mb-2 flex-shrink-0`
  - **遙測 Dashboard 2x2 / 6-Column Grid**：結合 `d-grid gap-3` 與 `gridTemplateColumns: repeat(6, 1fr)` 實現視窗極致自適應。

---

## 4. Helpers & Utilities (輔助類別與工具類別規格)

根據 Halfmoon CSS 官方 Helpers & Utilities 規範，定義專案屬性：

### 4.1 Color & Background Helpers (色彩與背景類別)

* **官方類別**：`.text-primary`, `.text-secondary`, `.text-body-secondary`, `.text-danger`, `.text-success`, `.text-warning`, `.bg-primary`, `.bg-dark`, `.bg-light`, `.bg-transparent`
* **專案特定規格**：
  - `.text-primary`：點亮當前標題或關鍵數據，對應 `--primary`。
  - `.text-body-secondary`：說明內文與欄位標籤，對應 `--text-secondary`。
  - `.bg-transparent`：去框區域專用背景。

### 4.2 Borders & Shadows (邊框與陰影類別)

* **官方類別**：`.border`, `.border-0`, `.border-top`, `.border-bottom`, `.border-start`, `.border-end`, `.border-primary`, `.border-2`, `.rounded`, `.rounded-0` ~ `.rounded-5`, `.rounded-circle`, `.rounded-pill`, `.shadow`, `.shadow-sm`, `.shadow-lg`, `.shadow-none`
* **專案特定規格**：
  - `.border-bottom`：標頭與分頁底部分界線。
  - `.rounded-3` / `.rounded-4`：子組件與控制項圓角。
  - `.shadow-lg`：下拉選單與 Offcanvas 側邊抽屜投影。

### 4.3 Spacing & Sizing (間距與尺寸類別)

* **官方類別**：`.m-0` ~ `.m-5`, `.p-0` ~ `.p-5`, `.w-100`, `.h-100`, `.mw-100`, `.min-vh-100`
* **專案特定規格**：
  - 高度垂直充滿：`h-100 d-flex flex-column`。
  - 邊距歸零：標題一律加上 `.m-0`，防止瀏覽器預設 `margin-top/bottom` 拉扯。

### 4.4 Position & Z-Index (定位與層級控制)

* **官方類別**：`.position-relative`, `.position-absolute`, `.position-fixed`, `.position-sticky`, `.top-0`, `.start-0`, `.sticky-top`, `.z-1000`, `.z-1050`
* **專案特定 Z-Index 階層圖**：

```
+-------------------------------------------------------+
|  Z-Index 1055: Modal 編輯與確認彈窗 (.modal)            |
+-------------------------------------------------------+
|  Z-Index 1050: Top Fixed Navbar 全域導覽列 (.navbar)   |
+-------------------------------------------------------+
|  Z-Index 1045: Offcanvas 側邊/底部抽屜 (.offcanvas)   |
+-------------------------------------------------------+
|  Z-Index 1000: Floating Dropdown 下拉選單 (.dropdown) |
+-------------------------------------------------------+
|  Z-Index 1: Canvas, Telemetry Charts & Normal Content |
+-------------------------------------------------------+
```

### 4.5 Typography & Text Formatting (字型與排版類別)

* **官方類別**：`.fs-1` ~ `.fs-8`, `.fw-bold`, `.fw-semibold`, `.fw-normal`, `.text-center`, `.text-start`, `.text-end`, `.text-truncate`, `.font-monospace`
* **專案特定規格**：
  - **字型鏈**：`'Outfit', 'Inter', system-ui, sans-serif`
  - `.fs-6.fw-bold.text-primary`：區塊標題。
  - `.fs-7.text-body-secondary`：說明文字。
  - `.text-truncate`：車輛名稱過長時自動省略。
  - `.font-monospace`：UDP 數據、點座標、二進位數據顯示。

### 4.6 Vertical Alignment, Overflow & Accessibility (垂直對齊、溢出與無障礙)

* **官方類別**：`.align-middle`, `.overflow-auto`, `.overflow-hidden`, `.overflow-visible`, `.overflow-x-hidden`, `.vr`, `.sr-only` / `.visually-hidden`, `.opacity-25`, `.opacity-75`
* **專案特定規格**：
  - `.vr.opacity-25`：垂直分隔線（如頂部導覽列按鈕區隔）。
  - `.sr-only`：螢幕閱讀器專用無障礙標籤。

---

## 5. 視覺行為與設計原則標準 (Design Behavior Standards)

1. **60Hz 高頻渲染元件效能護欄**：
   - 包含 Canvas、[class*="recharts"] 圖表、`input[type="range"]` 與 `input[type="color"]` 必須在 `styles/base.css` 中明確設定 `transition: none !important` 與 `animation: none !important`。
2. **極簡專業視覺 (Emoji 禁用原則)**：
   - 依據專案 `AGENTS.md` 規範，**嚴禁在 UI 字串或 UI 組件內直接加入 Emoji 圖示**。所有狀態提示與箭頭必須採用純文字（如 `▾`）、 Halfmoon `.badge` 標籤或向量圖示。
3. **硬編碼色彩禁用**：
   - 嚴禁在 Component inline style 中寫死 `#ffffff` 或 `#000000`，統一導轉至 CSS 變數（`var(--text-primary)`, `var(--glass-bg)`, `var(--surface-1)`）。

---

## 6. Agent 遵循、維護與變更 SOP

1. **Agent 開發與維護義務**：
   - 所有 AI Agent 在建立、重構或微調前端 UI 組件、CSS 樣式或佈局時，必須強制對照並維持本規格書之要求。
   - 若引入新的 Halfmoon 組件或變更全域設計變數，必須同步更新 [HALFMOON_SPECIFICATION.md](HALFMOON_SPECIFICATION.md) 與 [SKILL.md](SKILL.md)。
2. **變更測試流程**：
   - 修改 `frontend/src/styles/` 或組件樣式時，請執行 Vite 畫面測試。
   - 修改完畢後，執行前端測試確保零語法與邏輯錯誤：
     ```bash
     cmd /c "pnpm -C frontend run test"
     ```
