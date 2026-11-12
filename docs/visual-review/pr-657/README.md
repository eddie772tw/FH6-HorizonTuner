# AEGO v4 整合視覺備查

2026-11-12 獨立審查補記：本圖集沿用 `2c72bed878b84d40ba47ec5c41edaa16fa9157ce` 保存的實作畫面。本輪 Rally 相鄰刻度與 ICE 原始證據重播修正只改後端；`frontend` 與 `lang` 的 Git tree 與該版本完全相同。下列 manifest 的全部來源雜湊描述原擷取版本，不作為本輪新後端的證明；新後端由本輪完整 locked Cargo、篡改／原始證據缺失回歸及新 head CI 另行驗證。圖片保留原擷取版本，未標成重新擷取。

本圖集使用實際 AppShell、Companion App、providers 與 renderer，驗證獨立模型的輸入、診斷、不可行狀態及前輪圖表語意。日期為 2026-11-12；擷取版本、Chromium 版本、後端執行檔、來源及圖片 SHA-256 以 [manifest.json](manifest.json) 為準。

## 資料與證據界線

- 桌面所有調校計算、量測分析、profile 正規化、保存及重讀都呼叫隔離 Rust 後端，未 mock 求解器結果。
- 引擎證據重播自已入庫的 `tests/fixtures/aego_beetle_engine_captures.json`。車重、配件、驅動、輪胎與工作目標為測試靜態 profile；FWD 畫面使用合成 FWD／前輪設定，不代表該歷史車輛的真實改裝或本輪遊戲測試。
- 即時 WebSocket 保持靜默；桌面原生專用 Companion host exchange 使用空指令 fixture，不冒充受信任原生 host。
- Companion 畫面使用真實 Rust workflow 回應的 snapshot 投影，只有 relay transport 使用 fixture。沒有執行配對、Android 裝置或原生橋接驗收，也沒有擴張 LAN 或 host Origin 權限。
- 圖片不證明漂移地面速度、牽引力、換檔最佳點、最短 ET、圈速、實車 A/B 或讀屏驗收。Drift 工作點是使用者目標；未校準形狀先驗與量測來源分開呈現。

## 覆蓋與版本

完整矩陣含 29 個桌面案例：七個 core 的日／夜、繁中／英文／日文、1280×720 與三系統 320×720。另含 10 個 Companion 投影案例，390×844 為代表手機尺寸，另有 320×844 日文窄幅。

七個 core 均執行實際頁面的狀態、overflow 與 JavaScript／API 檢查。公開代表圖涵蓋 Halfmoon Default、Swiss Technical 與 Rhine Lab 的日／夜；其他 core 結果保存在 manifest。另覆蓋 Road FWD、Rally Mixed／Cross Country、Drift 缺目標／飽和、Drag 明確末速拒絕及工程先驗。

可行 Drift 案例實際以鍵盤將輪速目標改為 90 km/h，再透過正式保存／導航與引擎觀察確認流程求解；飽和案例改為 200 km/h。不可用案例確認沒有虛構齒比圖表，且設定驗證步驟保持停用。Companion 同時確認不可用結果不呈現零終傳或可套用比值。

Drag 工程先驗案例先載入 manual 250 km/h，再於實際介面清空末速及來源、導航保存，讀回確認兩欄為明確 null；結果必須回到工程先驗，不能復活舊 manual 設定。每個案例的 optional fixture 欄位亦明確重設，避免持續保存的 profile 混入上一案例資料。

`*-setup.png`、`*-result.png` 與 `*-chart.png` 是實際應用程式 viewport 圖。`*-panel.png` 是同頁模型面板裁切；為完整顯示長面板，先採用 manifest 的 `panelViewport` 真實 viewport 高度，再裁切元素。保持原寬度、DPR 1 與 100% zoom，沒有隱藏頁首、改寫產品樣式或修圖。捲動以實際 sticky header 高度對齊，避免標題被遮住。

Companion 檔名沿用配對的桌面案例名稱；實際手機尺寸記於每個案例的 `companion.width`／`height`。來源在擷取前後逐檔比對；`baseCommit` 加 `sourceHashes` 明確記錄當時尚未提交的完整實作，後續只有證據／文件提交時可沿用相同介面。

## 代表畫面

| 畫面 | 圖片 |
| --- | --- |
| Halfmoon／日間／Drift | [桌面](default-light-en-us-1280-drift-feasible-result.png) · [完整面板](default-light-en-us-1280-drift-feasible-panel.png) |
| Swiss／夜間／Drift | [桌面](swiss-dark-zh-tw-1280-drift-feasible-result.png) · [手機](swiss-dark-zh-tw-1280-drift-feasible-companion.png) |
| Rhine／日間／Drift | [桌面](rhine-lab-light-en-us-1280-drift-feasible-result.png) · [手機](rhine-lab-light-en-us-1280-drift-feasible-companion.png) |
| 日文 320px | [桌面](default-light-ja-jp-320-drift-feasible-result.png) · [完整面板](default-light-ja-jp-320-drift-feasible-panel.png) · [Companion](default-light-ja-jp-320-drift-feasible-companion.png) |
| FWD 前輪語意 | [圖表](default-light-en-us-1280-road-fwd-chart.png) |
| Drift 缺少目標 | [桌面](default-light-en-us-1280-drift-missing-target-result.png) · [Companion](default-light-en-us-1280-drift-missing-target-companion.png) |
| Drift 飽和折衷 | [完整面板](default-light-en-us-1280-drift-saturated-panel.png) |
| Drag 末速無解 | [桌面](default-light-en-us-1280-drag-infeasible-finish-result.png) · [Companion](default-light-en-us-1280-drag-infeasible-finish-companion.png) |
| Drag 來源分層 | [明確末速與起步先驗](default-light-en-us-1280-drag-feasible-panel.png) · [工程先驗](default-light-en-us-1280-drag-engineering-prior-panel.png) |

## 重現

先依專案規範安裝前端依賴並建立最新 `server-sidecar`。準備 Playwright core 與 Chromium；需要時設定 `FH6_PLAYWRIGHT`、`FH6_CHROMIUM`、`FH6_CAPTURE_BACKEND` 指向本機工具。工具不加入產品依賴。

```powershell
node scripts/capture_pr657.cjs
```

腳本只啟動並清理自己的後端與 Vite process，資料放在新的 `scratch/pr657-capture-*`。預設 HTTP 18757、UDP 18758、Vite 1437，可用 `FH6_CAPTURE_BACKEND_PORT`／`FH6_CAPTURE_VITE_PORT` 改變；不接管使用者正在執行的後端。`FH6_CAPTURE_CASE` 可選取單一案例做診斷，正式交付 manifest 應使用完整矩陣。

寬幅與窄幅／Companion 圖片由兩位子代理完成逐檔實看核對：46 張寬幅與 38 張窄幅／Companion，共 84 張全部符合最終 manifest。68 張本輪重新檢視，16 張雜湊完全相同而沿用先前實看結果；沒有剩餘的新 UI 視覺阻擋。逐檔 SHA-256、檢視／沿用方式與觀察保存在 [qa-review.json](qa-review.json)，與程式／CI、遊戲及裝置證據分開。
