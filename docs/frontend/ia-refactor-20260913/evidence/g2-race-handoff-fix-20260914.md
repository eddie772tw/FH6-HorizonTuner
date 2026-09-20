# G2 賽事完成交接的取消修正

> **歷史 evidence；進度敘述已 superseded（2026-09-20）。** 下列觀察只適用其原始 SHA／條件；原測試、限制與 `not-run` 完整保留。目前 W4 狀態請讀 [候選入口](../README.md)，勿沿用本文的 W2–W4 開工狀態。

日期：2026-09-14。Owner：IA Coordinator as Codex；獨立重現／審查：Terra；回歸測試：另一個 Terra 子代理。

## 問題與修正範圍

原候選 `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc` 存在 P1：race A 通過 lifecycle 的 persisted header/samples 檢查並呼叫 `onCompleted` 後，Shell 還會進行第二段資料準備。若此時 race B 開始，A 的第二段請求仍可能套用 selection 並切至 Sessions。先前單一賽事的 browser pass 與 callback 之前的 cancellation tests 沒有涵蓋這個交接邊界。

修正由 `RaceCompletionLifecycle` 把綁定 race/token/completion generation 的 `isCurrent` 交給 consumer。`SessionsRuntime` 的 Live 自動開啟與非 Live pending action 都傳遞同一 guard；`AppShell` 將它和 navigation generation 結合，保留到資料準備、selection 提交、導航以及失敗後的 Retry。新賽事開始或 lifecycle dispose 後，舊操作不再有效。

`retry(sessionId)` 在已捕獲 identity 時拒絕不同 session ID，避免舊 pending action 改用新賽事的 ownership 驗證舊檔；沒有 captured identity 的 legacy late-capture 相容路徑保留。一般明確手動的 Sessions intent 不綁定賽事 lifetime。

公開 runtime callback 增加可選的第二參數 `isRequestCurrent?: () => boolean`，所有 producer/consumer 已同步核對；`SessionIntent` 資料格式、backend、公式、UDP、native HUD 與 persistence schema 都沒有改變。原 G1-core 的 c5e7fdf 紀錄仍是歷史快照；新 contract SHA 由 Coordinator 在計畫執行紀錄登記後供後續使用。

## 驗證

- 新增的 `raceNavigationHandoff.test.ts` 使用真實 lifecycle、`prepareAnalysisSessionIntent` 與 `SessionOperationGate`，沒有 React/DOM 或替代 ownership guard。
- 三個延遲場景分別在 A 的第二段 list、samples、refresh 真正 in-flight 後開始 B；釋放 A 後回傳 false，selection 保持原值、workspace 保持 Live；B 隨後完成並正確開啟 B。
- lifecycle dispose 使已交出的 A completion 失效。
- lifecycle 測試另驗不同 identity 的 stale retry 不影響目前 completion，同一 identity 的 explicit retry 使前次 guard 失效並產生新的有效 completion。
- 04:00 完整前端：**119 files / 794 tests passed**；Full/Lite production build 與 TypeScript passed。
- Terra 獨立檢查 lifecycle → Runtime → Shell → Retry，PASS，無 P1/P2 finding。這是本地獨立審查，不是 GitHub 正式 approval。

## 候選隔離與剩餘證據

後續更新：已完成新版 mounted 第二段 A/B 交錯、archive/Road ordinal identity 與兩轮 request reentry；重入另外暴露 recorder status/callback 放大問題，最小 Context 修正後重驗通過。精確 source blob、有限输入、有效與排除操作及限制見 [重入與 mounted 證據](g2-mounted-reentry-20260914.md)。下列未啟服務／not-run 敘述保留為 04:00 初次交付快照；C5/H5 native 仍未完成，G2 仍 partial。

修改在 `D:/FH6-frontend-ia-20260913/shell-race-fix`、`codex/frontend-ia-shell-race-fix-20260914`，從 c5e7fdf 分出。原 `shell` 工作樹仍固定 c5e7fdf，保留給先前已交付的原生操作；修正的提交與 PR #345 exact-head checks 由計畫與 PR 另記，不能用 c5 的 CI 當新版 CI。

本次沒有啟動服務、占用 1420/8001/8000 或操作原生視窗。mounted A/B race competition 仍待新版實際 UI 驗證；C5/H5 native、archive/Road identity、重入 request cadence 也維持原來的待驗狀態。G2 partial，PR #345 draft，沒有公布 WAVE2_BASE_SHA，也沒有開始 W2 面板重構。

先前的 [browser 證據](g2-shell-browser-20260914.md) 僅保留其已觀察場景；[原生交接](../handoffs/g2-native-20260914.md) 的 c5 候選結果須記錄精確 SHA，不能當作新版完整驗收。沒有真實 FH6 或效能改善結論。
