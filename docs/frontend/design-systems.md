# 主題與設計系統開發指南

本指南說明 Halfmoon／Swiss／Rhine 的實作入口與變更驗收方式。元件約束以 [UI 架構規則](../../.agents/rules/ui-architecture.md)及[設計規格](../../.agents/skills/halfmoon-design-system/HALFMOON_SPECIFICATION.md)為準；具日期的版型研究與 Journal 保留當時的背景及驗證結果。

## 核心、設計系統與配色的責任

Core Theme 決定表面、字體層級與元件細節；其所屬設計系統由 [themeCatalog.ts](../../frontend/src/context/themeCatalog.ts) 推導。Color Presets 只更新主要、次要及點綴色，不切換核心或模式。

| 設計系統 | Core ID | 顯示名稱與定位 |
| --- | --- | --- |
| Halfmoon | `default` | Default：經典中性介面 |
| Halfmoon | `modern` | Modern：石板與深藍表面 |
| Halfmoon | `elegant` | Elegant：暖色與細緻排版 |
| Swiss | `swiss` | Swiss Technical：冷色消光表面、工程數值層級 |
| Swiss | `swiss-editorial` | Swiss Editorial：暖紙色／暖炭色、較舒展的標題 |
| Swiss | `swiss-contrast` | Swiss Contrast：中性黑白、直角與反差標頭 |
| Rhine | `rhine-lab` | Rhine Lab：紙面檔案工作台、MiSans、刻度導覽 |

七個核心皆支援日夜模式及十一組配色預設。`swiss` 是既有 Swiss Technical 的持久化 ID；Swiss Editorial 是獨立核心，不能與 Technical 的淺色模式混為一談。Bauhaus Mono 與 Rhine Lab 配色以完整三色組識別，模式切換時調整黑白主色；其他自訂配色維持原值。成功、警告與錯誤仍使用功能語意色。

## 設定與 CSS 路徑

| 入口 | 責任 |
| --- | --- |
| [themeSettings.ts](../../frontend/src/context/themeSettings.ts) | 設定正規化、有效 Core ID／HEX、Mono／Rhine 模式轉換、`themeColorProperties` 配色映射 |
| [themeDocument.ts](../../frontend/src/context/themeDocument.ts) | 統一寫入 `data-bs-theme`、`data-bs-core`、`data-design-system` 與顏色變數 |
| [applyThemeEarly.ts](../../frontend/src/app/applyThemeEarly.ts) | React 掛載前套用本機設定，避免首幀閃爍 |
| [ThemeContext.tsx](../../frontend/src/context/ThemeContext.tsx) | React 更新、localStorage、後端設定同步、自訂 CSS 與 JSON 匯入匯出 |
| [App.css](../../frontend/src/App.css) | 依序載入共用 CSS 與設計系統模組 |
| [themes.css](../../frontend/src/styles/themes.css) | 中性 token 預設與共同變數名稱 |
| [base.css](../../frontend/src/styles/base.css) | 頁面結構、間距、捲動、數值排版及高頻元素例外 |
| [components.css](../../frontend/src/styles/components.css) | 讓共用元件消費 token；不依核心名稱分支 |
| [navigation.css](../../frontend/src/styles/navigation.css) | 分頁結構、寬度、響應式與焦點 |
| [design-systems/index.css](../../frontend/src/styles/design-systems/index.css) | 靜態載入 Halfmoon／Swiss／Rhine 模組，各自限定 `data-design-system` |
| [features/theme](../../frontend/src/features/theme/ThemeView.tsx) | 外觀設定、核心預覽、三色色票／HEX、配色預設及進階 CSS |
| [canvasTheme.ts](../../frontend/src/utils/canvasTheme.ts) | 跨頁 Canvas 的主題快取、屬性／字體完成通知與 React 圖表 hook |

保留 `themeSettings` localStorage key、後端 `theme` 設定、`halfmoonCore` 欄位與 JSON schema 2。設計系統是衍生值，不另存一份可與核心矛盾的狀態。新增核心不需要變更 API 或遷移現有主題。

`themeColorProperties` 同時供應專案三色與 Halfmoon 原生 Primary／HSL／勾選圖示；只改 `--primary` 會漏掉原生控制項。核心預覽的巢狀 `data-bs-theme` 也必須套用這份映射，避免預覽回到框架預設主色。進階區預設折疊，已儲存的自訂 CSS 仍會套用；驗收內建主題時應記錄是否存在自訂 CSS。

## 共用元件的使用邊界

- **分頁**：主導覽與無順序子分頁使用 `.workspace-tabs`，不加編號，依內容寬度且上限 14rem。調校 Step 1–4 使用 `.tuning-workflow__steps`，保留編號、桌面四欄滿列與手機兩欄。Halfmoon 使用實色作用中樣式，Swiss 使用底線，Rhine 使用刻度與展開底線；步驟資格與鍵盤操作不由 CSS 改寫。
- **面板標頭**：沿用 `.workspace-panel-header` 及既有標題 hook。`--panel-heading-*` 定義標題、成對底色／文字、內距與分隔線。Contrast 只反轉標頭及標題；控制項、徽章、提示保有自己的表面，焦點線也須在反差背景上可辨識。
- **按鈕、徽章與輸入**：使用現有語意類別，讓系統模組決定圓角、細框與材質。頁面不直接加入核心選擇器或複製固定色值。
- **高頻畫面**：Canvas／圖表／range／color inputs 保留無 transition／animation 的例外。繪圖效果讀取快取 token，不在繪圖循環查 DOM 或判斷核心名稱。即時卡片與開關提示不疊加背景模糊；Halfmoon 的其他靜態玻璃面板保留原材質。
- **覆蓋層與捲動**：抽屜／對話框沿用 `ModalPortal`；頁面容器需保留可達的捲動區，尤其 Sessions 分析與下方 Road 紀錄。反差標頭不能改變按鈕順序、遮住提示或裁切長標籤。

Rhine 的 2D 版面與短暫動畫適用 Full／Lite 共用前端；設定、外觀、診斷、Companion、MCP 與關於在 1024px 以上統一為置中紙頁，窄畫面沿用抽屜。共用 useDialogTransition 以實際 transition 時長提供關閉保護，退出期間持續限制焦點。切換主題不得重新掛載工作區。素材及驗收邊界見 [Rhine Lab 實作與驗收](rhine-lab.md)。

## 跨頁圖表契約

圖表共用 `utils/canvasTheme.ts`，只在主題屬性變更及字體載入完成時更新快取。即時儀表使用 `observeCanvasTheme`，依資料／尺寸重畫的 React Canvas 使用 `useCanvasTheme`；切換主題不清除資料、量測資格、峰值或選取狀態。SVG 的 CSS 變數直接跟隨主題，無須更換 React key 或重建工作流。

| 圖表 | 實作 | 主題範圍 |
| --- | --- | --- |
| 五卡即時儀表、詳情趨勢 | Canvas | 導引、字體、表面、功能色與 marker |
| AEGO 齒比 | Recharts SVG | 格線、字體、核心圓角、分類色飽和度；保留齒比資料、RPM／速度軸與參考線 |
| 調校引擎量測曲線 | Canvas | 格線、表面；Rhine 加垂直尺規，保留曲線及有效動力帶 |
| 賽道地圖、圈速／輸入比較 | Canvas | 格線、軌跡底色、車輛 marker、圖例系列色與文字；保留熱度色階及比較虛線 |
| Dyno、直線加速分析 | Recharts SVG | 格線、字體、圖例／曲線一致的系列色與 tooltip 表面 |

`--instrument-flat` 控制平直 RPM 及懸吊曲線；`--instrument-alert-flash` 控制 RPM 警示閃爍，Swiss／Rhine 使用平直及穩定提示。`--instrument-linear` 專屬 Rhine 密刻度、方形標記與實線尺規，不用來代表所有平面設計。`--chart-grid`、`--chart-grid-dash`、`--chart-radius` 供 Canvas／SVG 共用，分類齒輪色由 `--chart-series-saturation/lightness` 控制；不以品牌色改寫油門、煞車、胎溫與危險閾值。Swiss 五卡規格見 [研究及實作](swiss-telemetry-design.md)。獨立 HUD 不在本次共用前端範圍。

## 新增核心或設計系統

1. 在 catalog 登錄核心及所屬系統；新系統才新增 `DESIGN_SYSTEMS` 項目。沿用 catalog 推導的型別與外觀分組。
2. 在所屬 `styles/design-systems/<system>.css` 定義日夜 token；新系統模組加入 `index.css` 靜態載入。先調整 token，有不同元件外觀時才加入該系統限定的 selector。
3. 沿用共用頁面結構、標頭與導覽 hook；補齊三語文案及 [Cheatsheet](../../frontend/src/features/theme/components/CustomCSSEditorPanel.tsx)。不要增加第二套正規化、配色映射或每頁核心分支。
4. 依下一節驗證設定往返、系統往返與真正渲染出的控制項。若有新行為，擴充已有主題測試；不以大量 CSS 字串／像素斷言取代瀏覽器驗收。

## 變更驗證與送審

從 repository 根目錄依序執行適用的 gate：

```powershell
cmd /c "pnpm -C frontend run test"
cmd /c "pnpm -C frontend run build"
# 跨端、後端或打包整合變更另執行；不可與前端 build 並行
cargo test --locked --manifest-path backend-rust/Cargo.toml
git diff --check
```

純文件變更依專案規則執行連結／路徑與 `git diff --check`，不重跑產品測試。主題契約案例位於 [ThemeContext.test.ts](../../frontend/src/context/ThemeContext.test.ts) 與 [themeDocument.test.tsx](../../frontend/src/context/themeDocument.test.tsx)。開發啟動與隔離資料目錄見[開發指南](../guides/development.md)。

| 瀏覽器檢查 | 驗收重點 |
| --- | --- |
| 七核心 × 日夜、跨系統往返 | 表面／圓角／分頁正確；Halfmoon 材質保留；三色不重設 |
| Rhine Lab、Swiss Signal、Bauhaus Mono、既有及自訂配色 | 按鈕、開關、連結、圖表及核心預覽同步；語意警示色獨立 |
| 重新載入、JSON 匯入／匯出 | 核心、模式、三色與合法自訂 CSS 保留；首幀與 React 一致 |
| 即時／直線加速／調校／賽事／HUD 設定／系統設定 | 標頭操作與徽章對齊；Contrast 焦點可見；Halfmoon 滑鼠提示無角落模糊 |
| 320／768／1024／1280×720／1920×1080、200% 縮放、長標籤及有資料狀態 | 無頁面水平溢出；可到達頁尾；一般分頁限寬、調校滿列；賽事匯入可用既有 [MoTeC fixture](../../backend-rust/tests/fixtures/motec.csv) |
| Rhine 動效 | reduced motion 直接到終態；高頻畫面及祖先容器排除入場動畫；刻度與底線不引起版面位移 |
| 對話框與進階區 | Escape／焦點還原、Portal 邊界及捲動正常；CSS 編輯器預設折疊 |

送審時在 PR 列出最終範圍、文件入口、驗證的產品提交 SHA、實際頁面／資料／viewport、CI 連結與已知缺口。文件提交如沿用前一產品提交的測試，需明示程式碼樹未變，不能將舊 CI 寫成新 HEAD 的結果。保持 PR 非 Draft，盤點頂層 review 與行內討論；Ready to Review 表示材料已可供審查，核准仍由 Reviewer 決定。

## Companion 與原生驗收邊界

[Issue #485](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485) 追蹤 Companion 功能完善及 Swiss 三核心同步。WebView 已載入共用 CSS，但 Android Compose 原生導覽、連線／離線畫面、跨層主題同步及部分 WebView 區段導覽仍需整合。桌面瀏覽器、窄 viewport、APK 建置或合成資料都不能代替 Android 裝置／模擬器、原生 HUD 或真實遊戲驗收。

需求與實作脈絡：[Issue #480](https://github.com/eddie772tw/FH6-HorizonTuner/issues/480)、[PR #481](https://github.com/eddie772tw/FH6-HorizonTuner/pull/481)。具日期的實作證據保存在 [Journal](../../.agents/Journal.md)，PR 保存對應提交的 CI 狀態。
