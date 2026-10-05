# G2 原生觀察（2026-09-16，rebase 前候選）

日期：2026-09-16（Asia/Taipei）。這份證據整理自隔離工作樹
`D:/FH6-frontend-ia-20260913/shell-race-fix/scratch/g2-native-observations-20260916.md`；來源檔案保持唯讀。觀察候選是舊的
`2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`，沿用 11.45.17 的 Full/Lite 產物，並不涵蓋 2026-09-19 rebase 後的新候選。它是 G2 的歷史補充證據，不是新 head 的 native PASS。

## 證據來源與限制

- 透過 `node_repl + sky` 進行原生視窗與 accessibility 觀察；沒有使用 native CDP、外部 UIAutomation 或修改產品 source。
- Full 與 Lite 使用分離的資料目錄；Full 的預設 UDP 是隔離的 8124，HTTP 預設 8001，fallback 觀察為 52716；Lite fallback 觀察為 63964。這些是當次程序的結果，不是新候選的固定 port 保證。
- Full／Lite 與其 owned backend 最後均由各自 titlebar 關閉，並核對 listener 釋放。不能依歷史 PID 或 listener 狀態重啟、終止或推論目前程序狀態。
- Data Out guide 在該隔離測試仍顯示固定 8000；因 source `DataOutGuide.tsx` 有既有硬編碼，不能把它當成自訂 8124 已正確接線的證據。
- Full 未以人工延遲 native save response 驗證 pending write 橫跨卸載；既有 pure IO pending tests 另行記錄。未逐幀觀察 host 首幀，不能宣稱沒有白幀或 flash。

## Full 觀察

1. 正常啟動顯示 Live、Tune、Sessions、HUD 四入口與 Live Dashboard；backend 已連線，dark/default；HTTP 8001、UDP 8124。
2. HUD 啟動外部獨立 `Horizon Tuner HUD` 視窗；HUD → Live → HUD 後外部視窗保持同一 window id。Live 顯示 overlay active 的 paused 狀態。
3. `4 輪懸吊行程` 由 true 改為 false 後，外部 HUD 對應項目消失；跨頁返回後設定仍為 false。`hud_config.json` 與 GET `/api/overlay/config` 均讀到 `enabled=true`、`showTeleSuspension=false`。
4. 明確關閉 HUD 後，外部視窗消失，GET 回讀 `enabled=false`、`showTeleSuspension=false`。
5. App Menu 可開啟系統設定、外觀、診斷、更新、關於；外觀切換與 GET 讀回一致。關閉並重啟後 light/modern 與 dark/elegant 都能讀回。
6. 自有 socket 占用 8001 時，Full fallback 至 HTTP 52716，UI 顯示已連線與 MCP 52716，設定仍可讀回；這是該舊候選的 fallback 觀察。
7. Full 的 HUD 跨頁生命週期與 fallback/主題觀察可作為舊候選的局部證據；pending write 跨頁、rebase 後新 head 的 artifact 與完整 C5/H5 仍未驗證。

## Lite 觀察

1. Lite 使用新建且與 Full 分離的 settings，只有 Live、HUD 兩入口；backend 已連線，dark/default。
2. 自有 socket 占用 8001 時，Lite fallback 至 HTTP 63964，GET settings 成功，UI 顯示 MCP 63964。
3. Data Out guide 與 MCP 提示可見，跳過 guide 後回 Live。
4. 未執行 Lite HUD lifecycle、theme/core 重啟與 default-port 場景。因此 Lite 僅有啟動/fallback 的局部觀察，不能寫成 C5/H5 PASS。

## 對 G2 的結論

這份檔案把 2026-09-16 舊 2cb 的 Full/Lite 原生觀察轉為正式可引用 evidence；它不提升為 rebase 後候選的通過結果。2026-09-19 的新 head 必須重新建置並重跑 Full/Lite C5/H5，另補 Full/Lite 的 pending config write 跨頁觀察。G2 仍為 `partial`，W2 尚未啟動，也不發布 `WAVE2_BASE_SHA`。
