# 前端版型一致化：Live 基準、成熟應用與設計系統研究

日期：2026-09-24。狀態：active；使用者已授權依本方案實作、分階段提交與 PR／CI 交付。

基準：`main` / `2426238`（v1.6.1）。研究由使用者指定的 `gpt-6-luna` 子代理執行，主代理核對官方來源、參考圖片與本地元件。採用技能：`halfmoon-design-system`、`ponytail`、`cross-agent-collaboration`。

## 已確認的方向

- 使用者選定 Live 的 Dashboard 作為視覺與資訊密度基準；保留現有 Halfmoon 主題、配色與功能流程。
- 成熟設計系統用來校準規則：以 Fluent 2 為主要參照、Carbon 補充資料密集操作與狀態回饋；不刻意模仿品牌外觀，也不替換 Halfmoon。
- 一致化涵蓋 Live、Tune、Sessions、HUD，以及桌面設定、外觀、診斷、更新、關於、Companion 設定與單位抽屜。
- HUD 自動儲存採固定位置、常駐占位的狀態提示。遊戲內 HUD 素材與 Android Companion 畫面不在本次範圍。
- Live 的優點是薄工具列、透明內容分區、小標題、細分隔線與就近操作；不要求其他頁面照搬固定六欄、列高比例或內容裁切。

## 官方來源與證據

| 來源 | 可確認的設計做法 | 本專案採用方式 |
| --- | --- | --- |
| [VS Code 狀態列指南](https://code.visualstudio.com/api/ux-guidelines/status-bar)與[通知指南](https://code.visualstudio.com/api/ux-guidelines/notifications) | 短狀態文字、低干擾的背景進度、限制通知數量；一般進度優先留在操作情境內。 | HUD 頁內常駐狀態，不逐次發成功 Toast。這些文件沒有證明零位移；固定占位是針對本地缺陷的設計。 |
| [VS Code 設定介面](https://code.visualstudio.com/docs/configure/settings) | 設定分組、說明文字、立即套用變更；官方圖片可見低裝飾的列式內容與已修改標記。 | 沿用既有自動套用與設定分組，維持標籤、說明、控制項的閱讀順序。不新增設定搜尋或修改標記功能。 |
| [Grafana 儀表板](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/) | 頁面工具列、分組與圖表面板有不同職責，資料區擁有標題及局部操作。 | 四頁使用一致的操作層級；Sessions、Drag Test 的頁首收斂，圖表操作留在所屬區塊。 |
| [Microsoft 設定頁指南](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings) | 建議可捲動且限寬的設定內容、相關選項分組、右側控制項及至多一層的進階展開。 | 桌面一般設定沿用 SettingsPrimitives，限定可讀寬度；不強迫 HUD 多欄控制與 Live 圖表使用同一寬度。 |
| [W3C 狀態訊息說明](https://www.w3.org/WAI/WCAG21/Understanding/status-messages) | 狀態變化應能被輔助技術辨識，而不必移動焦點。 | 背景儲存使用 polite status，保留鍵盤焦點；只宣告語意狀態改變，不逐筆播報滑桿寫入。 |

主代理實際檢視的官方圖片：

- [Grafana 儀表板參考圖](https://grafana.com/media/docs/grafana/dashboards/screenshot-dashboard-image-map-v13.1.png)：薄工具列、分組標題、內嵌圖表面板。
- [VS Code 設定修改示例](https://code.visualstudio.com/assets/docs/configure/settings/settings-modified.png)：標籤與說明的層級、表單內容排列。
- [Microsoft 設定版型示例](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/images/appsettings-layout-navpane-desktop.png)：畫面是 WinUI 3 Gallery，不能稱為已測試的 Windows Settings 應用。

這些是官方文件及靜態參考圖片研究，沒有操作上述應用，也沒有測量它們的儲存延遲或版面位移。套用到 FH6 的建議屬本地設計判斷。

## 設計系統參照與本地轉譯

採用順序：使用者已確認的 Live 基準與實際操作需求 → 本地 Halfmoon／語意 tokens → 外部設計原則。Fluent 2 與 Carbon 是評估依據，不直接成為新元件庫或第二套 CSS 系統。

| 面向 | 官方原則 | 本次轉譯 |
| --- | --- | --- |
| 間距與密度 | [Fluent Layout](https://fluent2.microsoft.design/layout)以接近程度表達關係，並強調間距階梯需按內容與裝置調整。 | 沿用 Live 已存在的 `0.5rem`／`1rem` 節奏；同一組欄位靠近，不同功能群組拉開。不是把所有容器都設成相同 padding，也不是照抄完整 Fluent 尺寸表。 |
| 文字層級 | [Fluent Typography](https://fluent2.microsoft.design/typography)以語意角色、基線對齊與對比建立可掃讀層級。 | 統一頁級／區段標題、欄位標籤、說明與數值角色；沿用既有字型及 text tokens。一般說明不因追求密度而繼續縮小。 |
| 表面與浮動層 | [Fluent Material](https://fluent2.microsoft.design/material)區分一般實色表面、短暫浮動介面及 modal 遮罩；[Elevation](https://fluent2.microsoft.design/elevation)以層次提示重要性。 | Live 式透明分區與內層 surface 保留；浮動詳情／彈窗才用較強邊框、陰影與既有玻璃材質。以層次功能做對照，不實作 Windows Mica，也不新增裝飾性模糊。 |
| 操作回饋 | [Carbon Inline loading](https://carbondesignsystem.com/components/inline-loading/usage/)區分 active／finished／error，建議替換內容時維持原位置與對齊，並使用描述操作的文字。 | HUD 使用常駐位置與「儲存中」等具體狀態，成功必須有 runtime 證據；固定尺寸及多來源錯誤處理是本專案進一步的要求，並非引用即已證明零位移。 |
| 動效 | [Fluent Motion](https://fluent2.microsoft.design/motion)要求動效有目的、避免突然干擾，並提供無動效體驗。 | HUD 自動儲存不增加高度、寬度、位置動畫或成功跳動。新增狀態展示遵循 `prefers-reduced-motion`，Canvas、range、color input 維持原有 transition 排除。 |

現有 `--text-primary/secondary`、`--surface-1/2/3`、`--glass-*`、`--panel-radius`、`--input-radius` 已能承接上述語意。使用者的深淺色、core、品牌色與 customCSS 優先，不引入 Fluent 或 Carbon 的同名 token 命名空間。

Carbon 的提交動作可能停用相關按鈕，並提供成功停留時間；這不適用於 HUD 的連續自動儲存。本方案不因參照它而鎖住滑桿，也不新增固定 1.5 秒的成功計時流程。需要防止重複操作的原生 HUD 啟動／關閉，仍使用既有 busy 控制。

不採用的品牌表徵包括 Segoe 字型替換、Microsoft／IBM 品牌色、特定圖示套件、整套卡片外形與平台材質效果。設計系統文件研究與 FH6 實際瀏覽器驗收分開記錄。

## MCP 工具接入與驗證

依使用者授權，2026-09-24 已在本機 Codex 使用者設定加入以下服務。這是開發工具設定，不是 FH6 前端依賴變更；本專案的 Halfmoon、Live 基準與主題決策維持優先。

| 工具 | 狀態與證據 | 本次用途 |
| --- | --- | --- |
| [Carbon 官方 MCP](https://carbondesignsystem.com/developing/carbon-mcp/onboarding-and-setup/) | `carbon-design` 已備妥，`enabled = false`。使用者確認尚未取得預覽存取權。官方要求 IBMid、token 與 session ID；本機未帶憑證探測另收到 Cloudflare 403，尚未完成 MCP 握手或文件查詢。 | 取得存取權後查狀態回饋、無障礙與元件使用規則。當前繼續使用官方公開文件，不宣稱已透過 Carbon MCP 核對。 |
| [Microsoft Learn MCP](https://learn.microsoft.com/en-us/training/support/mcp-developer-reference) | `microsoft-learn` 已啟用；SDK 實測 initialize、tools/list、`microsoft_docs_search` 與 `microsoft_docs_fetch` 成功。 | 查官方 Windows 設定頁與 Fluent 相關指引；它不是 Fluent 2 專屬 MCP，也不保證索引 fluent2.microsoft.design 全站。 |
| [MUI 官方 MCP](https://mui.com/material-ui/getting-started/mcp/) | `mui-docs` 已安裝 `@mui/mcp@0.1.6` 並鎖版（MIT，Node 24.13.0）；實測 `useMuiDocs`、`fetchDocs` 成功取得 Material UI 9.4.0 的 Progress、Tabs 文件。Codex 工具白名單僅開這兩個文件工具，未開 `generateReactCode`。 | 補充元件狀態與鍵盤／ARIA 規則；MUI 是 Material UI 實作文件來源，不等同 Google Material 3 全部規範，也不導入 MUI 控制項或品牌外觀。 |

本次找到 [Fluent UI Blazor 公開 MCP](https://www.nuget.org/packages/Microsoft.FluentUI.AspNetCore.McpServer/5.0.0-rc.5-26219.1)，但其元件/API 文件對象是 Blazor，不適用本案 React + Halfmoon；未安裝。本次未找到 Microsoft Fluent 2 通用設計系統的公開專屬 MCP，不能據此宣稱所有 Fluent 產品都沒有 MCP。

實際透過 MCP 再核對的設計事項：

- Microsoft 設定頁文件支持相關設定分組與約 1000–1100 px 的可讀寬度，與本方案一般單欄設定 `65rem` 的方向一致；不延伸限制 Live 圖表寬度。
- MUI Progress 區分可量化進度與不定時等待。HUD 現有儲存沒有總量／完成比例契約，不能顯示捏造的百分比；維持文字狀態與固定占位。
- MUI Tabs 文件提供可存取標籤、tab 與 panel 關聯及鍵盤行為核對依據。採用語意驗收，不搬入其 Tab 元件。
- 若未來將 spinner 暴露成獨立 progressbar，需提供 accessible name；本方案的 polite status 已有文字時，裝飾性 spinner 應避免重複播報。

安裝位於 `C:\Users\eddie\AppData\Local\CodexIntegrations\DesignSystems`，設定位於 `C:\Users\eddie\.codex\config.toml`，完整查詢驗證結果位於安裝目錄的 `mcp-verification.json`。修改前已備份設定，並比對既有設定保持不變。新服務已經獨立 MCP client 實測；目前對話的原生工具清單尚未重載，不能將此等同本對話已原生呼叫新工具。依 Codex 官方設定流程重啟 MCP 連線後使用。

Carbon 憑證只預留 `CARBON_MCP_TOKEN` 與 `CARBON_MCP_SESSION` 環境變數名稱；沒有把憑證放入專案或對話。待使用者完成官方存取流程，再於本機設定憑證、啟用並驗證。詳細設定／移除方法保存在安裝目錄 `README.md`。

## 本地核對結果

- `LiveWorkspace`：子分頁與頁級操作同列；`TelemetryView` 另有緊湊的狀態／車輛資訊列。
- `TelemetryCardShell`：一般狀態採 `p-2`、透明區塊、小標題與分隔線，展開時才加背景、邊框與陰影。保留這個密度，不為一致化增加大型主標題或外層卡片。
- `SettingsPrimitives`：已提供 section、label/description/control 與 switch 的結構。優先調整共用樣式，不建立第二套表單系統。
- `OverlayView` 與 `HudSetupPanel`：分別依 `pendingWrites` 插入 Processing 徽章；前者改變狀態列高度，後者可能擠壓並換行。狀態展示需要收斂。
- HUD 當前將 native、config runtime、metadata 錯誤合成一個展示字串。新展示需保留錯誤來源，成功儲存不能抹去尚未解決的啟動或 metadata 錯誤。
- 全域 `.row` 邊距覆寫、各頁獨立 padding 和巢狀 overflow，需在版型遷移時逐項收斂；不直接刪除全域規則而忽略既有使用者。
- 現有 `useModalFocus` 會限制 Tab 焦點。一般自動儲存提示不應套用此 modal 行為；浮動錯誤詳情只在使用者開啟時處理焦點，關閉後返回觸發鈕。
- 現有 App.css 有通用色彩／陰影 transition 及高頻控制項排除，尚未找到 `prefers-reduced-motion` 規則；新增狀態展示需處理這項動效偏好，不擴張成無關的全站動畫重寫。

## 修訂後的實作方案

### 共用視覺與版型

- AppShell 頁面外距與大區塊間距保留 `1rem`；輕量區塊內距與工具列間距使用 `0.5rem`；表單群組內距可使用 `1rem`。沿用語意色彩、圓角與 Halfmoon 控制項，不增加 UI 依賴。
- 一般區塊採小標題、細分隔線；數據與表單內層使用適度的語意底色。浮動詳情和彈窗保留毛玻璃層次。不為每個靜態分區增加陰影卡片。
- 頁級操作放在頁內工具列，局部操作放在區塊標題旁。常用操作持續可見，不因選取、hover 或狀態切換突然增加寬度；狹窄視窗以響應式換行承接。
- 共用部分優先使用 CSS 與小型展示元件。若需要 WorkspaceFrame，只處理結構與 scroll/fill 模式；主標題與說明為選用，避免每頁多一列重複頁名。
- 一般單欄設定內容最大寬度採 `65rem`（16px 基準字級時為 1040px），在可用內容區置中；彈窗和抽屜的可用寬度優先。HUD 多欄控制與資料儀表維持流動寬度，不套這個上限。
- 每頁／彈窗有一個主要垂直捲動區。保留有明確用途的圖表詳情與表格局部捲動；浮動詳情透過 Portal 避免裁切。

### 各頁收斂

| 介面 | 變更 |
| --- | --- |
| Live Dashboard | 保留現有桌面密度與區塊結構，作回歸基準；窄螢幕與長翻譯需要可讀、可捲動，不能只靠 hidden 裁掉內容。 |
| HUD | 子分頁與狀態放在精簡工具列；移除獨有的整頁實色底板；三個面板採共同標題、分隔線、間距。啟動／關閉操作仍在 Setup。 |
| Tune | 保留步驟、車輛資訊與常用調校操作的位置；減少重複標題、說明卡片和多層外框，保留必要操作指引。 |
| Sessions | 將大型標題卡片收斂為精簡工具列，分組既有 Session 選取與匯入／匯出操作；保留現有分析和 Road 流程。 |
| Drag Test | 對齊 Live 的工具列、標題與留白；保留測試進度和結果需要的視覺重點。 |
| 設定及相關介面 | 保留一個外殼標題、表單區段及單一主要捲動區；一般設定列對齊並限寬，進階資訊沿用現有展開／抽屜。 |

### HUD 狀態與介面邊界

- 建立 HUD 專用的常駐狀態展示，消除 Setup 與其他子分頁的重複提示。輸入沿用 runtime snapshot、pendingWrites、各來源錯誤及既有 retry callback。
- 載入中、儲存中、已同步、需處理共用同一占位；圖示槽與文字槽使用所有狀態的最大需求，不隨翻譯文字或狀態改變尺寸。錯誤存在時不顯示綠色的整體成功。
- 浮動詳情分列仍有效的 config、native、metadata 問題，retry 只接對應已存在的操作；不假設每個錯誤都能呼叫 runtime.retry。儲存中仍允許原本可編輯的控制項。
- 原生啟動／關閉按鈕保留文字占位，以預留圖示槽和 aria-busy 表示忙碌。一般背景儲存不移動焦點、不打開 modal、不逐次發送 Toast。
- 狀態用語採具體的「儲存中」，避免所有操作都顯示「處理中」。狀態成功以既有 runtime 回應為準，不能僅憑本地控制值已改變。
- 只調整前端展示 props；序列化寫入、巢狀 patch、跨頁持續寫入、API、設定檔與 BroadcastChannel 語意維持原樣，不新增 debounce。

### 不納入本次的研究建議

- 不新增 VS Code 式大型側欄、全域底部狀態列或可停駐面板。
- 不新增 Sessions 搜尋、篩選抽屜、主從清單或設定搜尋；這些是功能與流程擴充。
- 不全面照搬 WinUI 的逐列卡片、全螢幕設定頁或固定像素尺寸；只取分組、對齊與可讀寬度的原則。
- 不以精簡為由縮小所有字體、隱藏常用命令或移除錯誤資訊。

## 驗收與交付順序

1. 先完成 HUD 狀態穩定性與外觀收斂，再與 Live 並排核對；接著處理 Tune、Sessions、Drag Test，最後收斂設定介面。
2. HUD 在立即成功、延遲成功、HTTP 失敗、逾時、重試與多筆排隊時，比較同一控制項的前／中／後相對邊界、捲動位置與焦點；不只看 CLS。驗證離頁／重入及三個子分頁。
3. 測試 config 成功但 native 或 metadata 仍失敗的組合，確保錯誤不被掩蓋；狀態文字／圖示及其讀屏語意一致。
4. Full／Lite、深淺色與三種 core、繁中／英文、390／768／1280／1920px 寬度都要核對。比較相同高度視窗中 Live 的可見內容，避免新增裝飾造成資訊量退步。
5. 核對鍵盤分頁、錯誤詳情關閉和焦點返回、彈窗焦點、Live 圖表展開、Tune 步驟和 Sessions 選取；60Hz Canvas、range、color input 維持無 transition，新增展示需通過 reduced-motion 模式。一般文字與主要控制的對比不能因輕量化而降低。
6. 新增必要的純函數狀態映射測試；瀏覽器位移驗收獨立於 Vitest。完成後執行 `cmd /c "pnpm -C frontend run test"`、`cmd /c "pnpm -C frontend run build"` 與 `git diff --check`。Tauri 原生 HUD 忙碌狀態另行驗證。

本次研究沒有重跑產品測試。先前本任務的 3 個聚焦測試檔、14 項通過是既有基線，不是修正後的證據；先前本機瀏覽器預覽在後端未連線下完成，尚無成功儲存的位移量測。

## 交接

### 實作階段與 ownership

分支：`codex/live-layout-consistency`，從與 `origin/main` 一致的 `2426238` 建立。

1. 規劃提交：保存本方案、交付階段與寫入範圍。
2. HUD／共用基礎提交：主代理負責 HUD 常駐狀態、錯誤來源、固定按鈕占位、共用樣式、語系及純狀態測試；不更改 runtime 寫入語意。
3. 主頁一致化提交：Sol workspaces 負責 Tune、Sessions／Analysis 展示及 Drag Test；主代理負責 Live 響應式和共同外殼整合。
4. 設定介面提交：Sol settings 負責 Settings、Appearance、Diagnostics、Updates、Companion、AppDialog 與單位抽屜；主代理整合 About 外殼。
5. 驗收修正提交：主代理完成視覺／互動／主題矩陣、測試與 build；Luna 獨立視覺風格審查並提供畫面缺陷，主代理逐項處置。
6. PR 與 CI：建立一個 PR，等待目前 head 的 GitHub CI／CodeQL 全數完成；失敗則修復提交並重新核對最新 head。

所有代理共用此分支但擁有不重疊檔案；只有主代理執行 git add／commit／push。主代理擁有 App.css、AppShell、Live／Telemetry、HUD（HudUnitSettingsSidebar 除外）、lang、此文件與驗收資料。子代理不得修改依賴、後端、公式或未分派檔案。交接保存在 `scratch/ui-layout/`，正式驗收結果回填本文件／交付紀錄。

採用技能：`halfmoon-design-system`、`ponytail`、`cross-agent-collaboration`、`pr-author-maintainer`。本階段新增的是任務分工，不升級為長期治理規則。

Task: Live 基準版型一致化與 HUD 狀態穩定性

Status: active

Owner: 主代理維護本提案；Luna 外部研究已完成，無程式碼寫入 ownership

Branch: codex/live-layout-consistency / base 2426238

Changed: Repo 僅新增本研究與方案文件；另完成使用者層級 MCP 工具設定、獨立安裝及使用說明。產品程式碼與前端依賴未修改

Pending: 依上述順序實作及驗收；Carbon 待使用者取得官方存取權後啟用驗證

Blocked by: None

Verification: 官方文件與三張官方參考圖已核對；本地展示元件已檢查；Microsoft Learn 與 MUI MCP 握手、工具列表及文件查詢成功；既有 Codex 設定比對通過；git diff --check 與新檔案的 git diff --no-index --check 通過

Next action: 實作開始時重新核對 Git 狀態與 ownership，先修 HUD 常駐狀態展示；外部指南保留為參考，未經本地驗收不升級為 Journal 或強制治理規則

Last updated: 2026-09-24
