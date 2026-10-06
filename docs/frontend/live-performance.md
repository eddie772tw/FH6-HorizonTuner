# Live 增量 histogram 與畫面外繪製

## 範圍與相依

這次變更疊在 PR #489 的 `codex/rhine-lab-theme`，基準為 `bca70d38d4a973601879d75b5af2511fecbdc3f5`。必須先合併 #489，再重定向與重新驗證此後續 PR；不直接合併至 main。

只處理兩項工作量：胎溫 histogram 的重複全歷史分類，以及仍掛載的 Live 卡片在畫面外持續繪製。沒有修改 ArcSteerGauge 靜態背景快取、樣式、WebSocket、上游 display rAF、Rust 公式或獨立 HUD。

## 與既有修正的差異

- #237 已重用 histogram `Uint32Array`，減少配置；#327 將歷史寫入改成 O(1) ring overwrite。新變更保留 ring 及固定容量，進一步將每次繪製的 O(N) 全歷史分類移至新增／覆寫時更新計數
- #345 處理頁面離開／卸載的生命週期。本次處理同一 Live 頁面仍掛載、但完全捲出可見區域的卡片，不能以卸載或停止取樣取代停止繪製

## 證據界線

基準全前端測試為 189 files / 1,701 tests passed，各 1 skipped。新增演算法、生命週期與組件行為測試，以及可重複的 Node microbenchmark，分別驗證等值性及分類工作量；不是 Canvas、GPU、WebView2 或整個 Live 的 FPS 數字。

雲端 browser 的 localhost 已受既有存取限制阻擋，本次沒有改換路徑繞過限制。沒有新版原生畫面／真實遊戲 capture 或成對效能 profile。#489 已記錄的 Live p95 100ms 尚未被本次證據證明解決。後續原生比較應固定提交、同機／模式、viewport／DPR、刷新率、完整 fixture、背景負載與 fonts ready，交錯順序量測 baseline 與後續版本；另保留 CPU、style/layout、paint/composite 與 GC 診斷。

## 實作契約

- 每輪保留自己的 histogram 計數。插入加一；滿 900 筆時先扣除即將覆寫的舊樣本，再寫入並加入新樣本。分箱數變更才從 ring 重建，主題／DPR 不改分類
- 原始溫度 100–260°F 映射不變，範圍外數值及正負 Infinity 仍夾在端點；NaN／undefined 不計入有效 typed-array 分箱。車輛／race 變更與關閉圖表時同步清除 ring 與計數
- 保留 O(1) ring 寫入；繪圖仍需 O(B) 取最大分箱及畫柱。滿窗四輪原本每次更新分類 3,600 筆，現在最多分類 8 筆（扣舊／加新），不是消除所有繪圖成本
- 卡片層級 IntersectionObserver 管理穩定的 imperative paint gate；事件訂閱、歷史寫入及峰值更新在 gate 外。部分仍可見的卡片繼續畫，完全離開可見區才停畫，不因一般對話框覆蓋而假定整卡不可見
- 重新進入可見區時直接畫 retained data，不重播 telemetry event，不新增／重新標記歷史時間。ResizeObserver 可保存隱藏時尺寸，重新繪製時依目前 DPR 同步 backing buffer；主題觀察繼續更新 token，observer 不支援則保守繼續繪製
- Gate 不改頁面既有關閉／切頁／明確暫停／關閉圖表語意。卡片的 Canvas、DOM 讀值停止每幀寫入；上游插值與資料流，以及需要持續更新數值的 peak-decay 排程仍保留

## 可重複 microbenchmark

執行：node frontend/src/utils/tireTemperatureHistogram.benchmark.mjs（Node >=22.18，直接引用 production utility）

使用同一 deterministic 10,000-frame／四輪／900容量／72分箱 fixture；兩輪 warmup，七輪交錯順序。舊路徑保留共用 typed buffer 與單次掃描內取最大值，沒有以每幀配置陣列當成較差 baseline。兩側都包含 ring 寫入；新路徑包含 eviction、increment 和 O(B) peak scan。繪製、瀏覽器與 native host 不在量測內。

本輪 Node v24.19.0、linux x64：full-rebin 中位數 354.53ms，incremental 中位數 6.47ms；checksum 同為 8056892。原始七輪資料見 [histogram-node.json](assets/live-performance/histogram-node.json)。雲端 CPU/JIT／背景工作會影響絕對值，不能推論產品加速倍數。

## 可見性工作量契約

TelemetryCardVisibility.test.tsx 以相同 120-frame stream 驅動五個仍掛載的 probe：只有一張相交時，五張各接收 120 次（共 600 次）；只有可見卡片提交 120 次畫面輸出，其餘為 0。第二張重新可見時僅新增一次 retained-state 輸出，接收次數仍是 120。這是高階 paint gate 的 operation-count fixture，不是底層 Canvas 呼叫數、瀏覽器實際 paint 次數或 FPS 量測。

組件測試另驗證 TireRadar 隱藏時 1,000 個更新仍保有完整 900 筆窗口、bin resize／車輛／race／開關重置與資料時間不被重畫改寫；SuspensionBar 保留 history／min-max／當前值與 DPR；VehicleDynamicsDisplay 保留 qualified peaks／原始 top-speed 並在單位改變後正確重畫。StrictMode、舊 observer callback、卸載／重掛與缺少 IntersectionObserver 均有回歸測試。

## 最終本地驗證

- pnpm -C frontend --config.verify-deps-before-run=false test：195 files／1,716 tests passed，各 1 skipped
- pnpm -C frontend --config.verify-deps-before-run=false run build：TypeScript 與 Vite production build 通過
- git diff --check：通過；未變更 Rust／Python，因此未重跑其 scoped gate
- 使用既有已安裝依賴；此隔離 worktree 共用 node_modules，verify-deps-before-run=false 僅停用 pnpm 自動重新安裝檢查，沒有省略測試、型別檢查或構建
- 本輪只有合成／自動化組件與 Node 演算法驗證，原生 UI／完整 frame-time 限制如前述
