# HUD 設定工作區

[English](hud-settings-workspace.en.md)

HUD 設定依「主儀表／遙測卡片／一般／音響系統／輔助儀表」分類。啟閉 HUD 與同步狀態留在共用工具列，設定即時套用並自動儲存。

## 操作與設定對照

| 舊入口 | 新位置 | 保留的設定與語意 |
|---|---|---|
| Setup：樣式、作者；Layout：主儀表開關 | 主儀表 | 關閉顯示後仍可挑選樣式；作者、WIP 篩選與目前選項保留規則沿用 |
| Setup：Overall HUD Scale；Advanced：光暈、動態效果 | 主儀表 | `scale` 仍為原欄位，範圍 0.5–2；光暈 0–2，動態效果維持既有 renderer 語意 |
| Advanced：Speedometer Settings | 主儀表的樣式專屬設定 | S650、Classic JDM、R34、ST8100、LFA、VFD 沿用原值與適用條件；Classic JDM 隱藏輔助表時也能預先選擇來源 |
| Layout：遙測總開關、透明度、字體、錨點與格線 | 遙測卡片的共用區 | 透明度 0.1–1、字體 0.5–2；總開關關閉不清除子卡片設定 |
| Layout：懸吊、胎滑、胎溫與四角位置／大小 | 輪胎／懸吊卡片 | 共用縮放 0.5–2、X ±500px、Y ±300px；啟用胎滑或胎溫仍連動 `showTeleTires` |
| Layout：G 力大小、錨點、X/Y | G 力與姿態卡片 | 左錨點 X ≥ 0、右錨點 X ≤ 0；切換時同步限制 X；縮放與 Y 範圍不變 |
| Layout：動力／踏板開關、合併、位置與大小 | 動力／踏板曲線卡片 | 合併與個別模式各保留自己的縮放、位置與 X；切換模式不互相覆寫 |
| Layout：指南針開關與上下位置 | 指南針卡片 | 原開關與 `top/bottom` 值不變 |
| Layout：手把開關、樣式、X/Y | 控制器卡片 | Xbox／DualSense、X/Y ±50%、步進 0.5%；隱藏時仍可編輯 |
| Setup：螢幕、HUD 單位抽屜 | 一般 | 單位內嵌顯示；保留全域繼承及獨立覆寫，修改速度同步舊 `unit` 欄位 |
| Advanced：預設／自訂配色 | 一般的共用配色 | 共用主儀表與遙測卡片的既有配色欄位，不宣稱為各元素獨立配色 |
| Advanced：音源、暫停遙測工作區、重設；Setup：重載 | 一般的效能與系統選項 | 音源維持設定保存與專用 endpoint；重設需確認並保留 `enabled`；重載與 metadata refresh 沿用 |
| #541 原獨立音響區塊 | 音響系統（第四頁） | 九款主機、顯示、四邊對齊及 Offset；新增獨立 `audioHeadScale` 0.5–2，舊共用縮放只遷移一次 |
| #540 原獨立輔助儀表區塊 | 輔助儀表（第五頁） | 五款複選、橫直換排、四邊對齊與共用來源；保留既有向內／沿邊位移及共用 HUD scale |

遙測卡片的顯示開關常駐，詳細設定預設收合，可同時展開。所有分頁表單維持掛載，各自保留捲動位置、展開狀態與尚未提交的輸入；隱藏面板使用 `hidden` 排除鍵盤與輔助技術導覽。分頁支援左右方向鍵、Home／End 與 roving tab index。離開整個 HUD 頁面後再進入，回到主儀表及預設收合狀態。

元素關閉只控制顯示，不鎖住編輯。載入中的表單、單位繼承下的覆寫欄位、缺少原生能力的啟閉／螢幕操作仍有各自限制。重載在瀏覽器也可刷新設定、樣式清單及傳送重載訊息，不以原生視窗不存在而停用整個動作。

## 分頁與狀態邊界

`HudWorkspace` 接受有序的 `HudSettingsTabDefinition[]`，每筆只有 `id`、`labelKey`、`content`。`id` 在同一工作區必須唯一且保持穩定；預設選取第一筆，已選分頁移除時回到第一筆。`labelKey` 使用英文顯示文字，符合目前 `SettingsContext.t` 的英文 identity 行為，並在三個語言檔補齊對應值。

```tsx
const tabs: HudSettingsTabDefinition[] = [
  { id: 'gauge', labelKey: 'Main gauge', content: <HudGaugePanel {...gaugeProps} /> },
  { id: 'telemetry', labelKey: 'Telemetry cards', content: <HudTelemetryPanel {...telemetryProps} /> },
  { id: 'general', labelKey: 'General', content: <HudGeneralPanel {...generalProps} /> },
  { id: 'audio-head', labelKey: 'Audio Head', content: <HudAudioHeadPanel {...audioHeadProps} /> },
  { id: 'auxiliary-gauges', labelKey: 'Auxiliary Gauges', content: <HudAuxiliaryPanel {...auxiliaryProps} /> },
];
```

`OverlayView` 協調 metadata、原生視窗動作、音源及面板。`OverlayControlRuntimeProvider` 繼續唯一管理設定、串行寫入、廣播、單位投影與重試。分頁不建立自己的 store、WebSocket、native adapter 或保存佇列。各面板的設定型別只暴露相關欄位，操作使用 `HudConfigPatch`；`elements`／`units` 必須送局部 patch，不展開過期完整物件。HUD 單位型別位於 `hudDisplayUnits.ts`，不依賴表單或抽屜。

輔助儀表的 `gaugeValueSources` 同樣支援每個讀值內的局部欄位更新。例如 `{ gaugeValueSources: { boost: { label } } }` 保留目前來源、單位及其他讀值。`HudAuxiliaryPanel` 負責顯示／排列，`HudGaugeSourcesPanel` 負責共用來源表單；分頁容器不加入功能判斷。

新增表單要保留無副作用掛載；分頁切換不執行保存、HUD 啟閉、renderer 重載或 metadata refresh。顯示開關與編輯控制項的 disabled 狀態分開處理。

新增面板沿用 `HudSettingsSection`：使用與 Tune 相同的 `glass-panel`、內縮 `workspace-panel-header` 與 `workspace-section-heading`，由設計系統 tokens 決定材質、標頭與邊線。不要再套一層滿版 `card-header` 或工作區水平 padding；正式 `AppShell` 已提供外層留白。遙測卡片也共用此面板外觀，不各自維護一套卡片標頭。

需要草稿的數值欄位在 Enter 或一般失焦時提交；焦點移往 HUD 分頁按鈕時以 `isHudSettingsTab` 保留草稿，不提交。共用百分比數字輸入與 ST8100 閾值均遵守此規則，百分比數字輸入仍以 1% 步進，滑桿沿用原步進。

## Audio Head 接入範例（PR #541）

基礎 #615 合併後，#541 已將舊 `audioHead` workspace slot 改為一般頁之後的第四個分頁。英文鍵 `Audio Head` 的繁中定義為「音響系統」：

```tsx
{ id: 'audio-head', labelKey: 'Audio Head', content: <HudAudioHeadPanel {...audioHeadProps} /> }
```

面板使用 `HudPanelActions` 與 Audio Head 專屬設定切片，寫入 `elements: { showAudioHead }` 局部 patch。沿用 `HudSettingsSection` 與共用滑桿；X／Y 位移隨對齊鎖定向外方向的 0 界限，直接對應既有向內／沿邊儲存欄位。縮放輸入草稿仍在切頁時保留。分頁容器沒有加入 Audio Head 判斷。

`audioHeadScale` 控制獨立縮放。舊音響設定缺少此欄位時，從有效的 `scale` 遷移；之後兩者各自保存。HUDCore 使用樣式宣告的 `scaleConfigKey`，未宣告的主儀表維持原 `scale`。詳見[音響系統設定、遷移與圖集](../hud/audio-head.md)。#540 的分支更新及其他 HUD 功能不在此次交付範圍。

## 驗證入口

日常 gate：`cmd /c "pnpm -C frontend run test"`、`cmd /c "pnpm -C frontend run build"`、`git diff --check`。

獨立瀏覽器驗證：`node frontend/src/features/overlay_control/tests/browser/verify.cjs`。以 `PLAYWRIGHT_MODULE_PATH` 指向既有或任務專用 Playwright，`PLAYWRIGHT_CHANNEL` 選擇已安裝的瀏覽器，例如 Windows 的 `msedge`；保持 sandbox。`OUTPUT_DIR` 可指定輸出位置，預設 `scratch/hud-settings-browser`。使用正式 `AppShell`、Live／Tune／HUD 元件與真實 React/runtime/theme provider，從應用程式導覽列進入 HUD。HTTP 資料與無遊戲封包的 WebSocket 為隔離 fixture，不寫入使用者設定；Sessions／Companion 不在此 fixture 範圍。截圖包含應用程式導覽、正式外層留白與 app-scoped 主題規則，不能以裸面板截圖取代。

[跨設計系統截圖與來源](hud-settings-screenshots/README.md) 提供 Halfmoon Default、Swiss Technical、Rhine Lab 日夜模式的三分頁、同主題 Tune 參考畫面與 320px 範例。

案例涵蓋鍵盤／ARIA、關閉後預先設定、快速跨頁修改、錯誤重試、單位、重設、保留草稿／捲動／展開，以及七核心 × 日夜 × 三語 × 1280／320px 的四分頁版面，另檢查 1920px 與 reduced motion。R34、LFA、ST8100 各自的 `tests/browser/verify.cjs` 保留原契約，入口改為分頁及內嵌單位區；Windows 字型可用性探針採 Microsoft JhengHei／YuGothic-Regular，Linux 維持 Noto CJK，均保留實際字形像素檢查。

原生 Windows 啟閉、螢幕與實際設定套用另行記錄 smoke evidence。瀏覽器結果不是遊戲、實體輸入裝置或 Narrator／NVDA 驗收。

## 2026-11-04 Audio Head 接入驗證

#541 接入第四頁並將位移改為 X／Y 拉桿後，完整前端 1,939 passed／1 個既有 skip、build 通過。瀏覽器涵蓋 336 組版面與 66 張截圖，包含獨立縮放、九款實際 renderer、四邊對齊的方向限制及音響掛載／卸載；90 次 fixture 保存、零 page errors 或未預期 API。最新[音響圖集與驗證紀錄](../hud/audio-head.md)另列，不覆蓋下方 #615 的歷史證據。

## 2026-11-04 基礎分頁驗證紀錄（#615）

- 視覺審查修訂：HUD 改用與 Tune 共通的面板／內縮標頭，移除工作區重複留白。改在正式 AppShell 內重跑 252 組版面與全部互動案例，45 張截圖包含三套設計系統的日夜三分頁、窄幅及 Live／Tune／HUD 參考；`scratch/hud-settings-theme-review/report.json` 記錄 35 次保存、零 page errors 與零未預期 API。完整前端測試及 build 重新通過。截圖素材選用 18 張桌面分頁、3 張窄幅與 3 張 Tune 參考；原生 smoke 沿用下方先前紀錄，這次樣式修訂未重跑原生或遊戲驗收。

- 前端完整 Vitest：233 個測試檔通過、1 個既有跳過；1,862 項通過、1 項既有跳過。TypeScript／Vite build 與 `git diff --check` 通過。
- Edge 瀏覽器 fixture：252 組分頁版面檢查，涵蓋七核心、日夜、三語與 1280／320px，另檢查 1920px、reduced motion 與六種專屬表單的三語 320px 版面；包含保存失敗重試、未知欄位保留、單位、重設、折疊鍵盤焦點與跨頁草稿契約。最終完整輸出位於任務 worktree 的 `scratch/hud-settings-browser-final/report.json`。
- R34、ST8100、LFA 獨立瀏覽器腳本通過，保留各自設定／renderer 斷言及 CJK 字形檢查；LFA 另保留 11 組展開模式檢查。
- Windows 原生 smoke：本分支 `cargo build --locked --manifest-path frontend/src-tauri/Cargo.toml` 通過，以本分支 Vite 前端、獨立 `scratch/native-data` 及 HTTP 18111 執行；後端沿用 main 同版本的本機 debug binary。本次沒有後端或原生 Rust 修改。
- 實際操作已確認：工具列啟動／關閉 HUD；主儀表隱藏後原生畫面立即消失、再開後恢復；API 讀回 `showGauge` 與 `enabled`；由 `DISPLAY1` 1920×1080 移至 `DISPLAY2` 2560×1440 主螢幕，原生視窗尺寸及 `selectedMonitorIndex=1` 均確認；重新載入設定頁後繁中分頁正確，回到主儀表。
- 測試版 HUD、主程式與自建服務於驗證後關閉。未啟動遊戲、未注入真實遙測，也未執行 Narrator／NVDA；以上不是遊戲或讀屏實機驗收。原生截圖包含桌面背景，未納入 repository。
- 原生日誌邊界：隔離後端 stderr 有未附路徑的 `storage error: ... (os error 2)`，WebView2 退出時有 `Chrome_WidgetWin_0` unregister 1412 訊息；本次沒有定位或修復這些日誌。上述 HUD 操作、API 讀回與視窗驗證通過，不代表整個原生執行日誌零錯誤。
