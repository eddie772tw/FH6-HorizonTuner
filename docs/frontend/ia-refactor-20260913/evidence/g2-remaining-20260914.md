# G2 剩餘操作清單

候選：`c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`，PR #345 draft。Terra 對 P2 範圍做唯讀缺項稽核，Coordinator 核對；未新增產品程式。

已具備足夠的純邏輯邊界證據：Full/Lite capability、Sessions exact selection/late response/navigation cancellation、race identity/unknown/bounded retry、Tune ordinal/PI/class/RPM/late-save、Road canonical snapshot、HUD initial GET/serialized writes/unknown fields。既有受控 browser 已覆蓋一般往返、量測保存、archive、Road start/stop、Live completion、HUD pending、故障 retry 與離頁停止 page requests。

只保留以下五組 G2 操作；不提前要求 W2/W3 重構或 G5 全矩陣。

| 操作 | 最小步驟與觀察 | Owner / 狀態 |
| --- | --- | --- |
| 1. Archive/Road identity | Full 沿用合成車 A 的 archive；HUD 期間送車 B 或變更 PI/class/RPM，返回後 A 不能仍是 B 已確認的量測。另在 Road A active run 期間換 identity，確認舊 run/setup/input confirmation 或晚回應不能啟用 B 的提交。 | Coordinator；mounted UI not-run。純 identity/operation tests 已通過，不重開公式設計。 |
| 2. Race A/B 競爭 | Live 的 race A completion read 延遲，開始 B 後才釋放 A；只可開已驗證非空的 B，A 不能覆蓋。再檢查 HUD 完成不搶頁、保留一個 exact pending entry。 | Coordinator；mounted A/B competition not-run。既有單一 Live/HUD completion 與 pure cancellation tests 可沿用。 |
| 3. 重入更新頻率 | Road → HUD → Road，用 8 秒視窗核對 mounted 約一秒一次、HUD 零次；recording Sessions → HUD → Sessions，用 6 秒視窗核對正常更新/零次/正常更新；Diagnostics 開／關／重開／關，核對 logs 只在開啟時出現。重複兩輪，沒有隨重入增長。 | Coordinator；離頁停止已觀察，重入 cadence 尚待完整記錄。Network request 不宣稱等於所有 channel/listener 計數。 |
| 4. C5 native | Full/Lite 各自真實 Tauri startup、backend-ready、entry、guide/menu、設定的 dark/light/core 首幀；另驗正常 dynamic-port path。 | 使用者觀察＋Coordinator 記錄；not-run。8001 外部 backend 程序不能單獨證明 dynamic-port。 |
| 5. H5 native | Full/Lite 分別觀察獨立 HUD：啟動 → 離開 HUD → 重入 → 明確關閉；pending config write 結束後回讀一致，外部視窗不能跟 page 一起關閉。 | 使用者觀察＋Coordinator 記錄；not-run。按鈕變字不等於原生視窗證據。 |

原生程序見 [固定候選交接](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md)。Coordinator 已停止自有 Vite/backend，釋放 1420/8001/8000 供原生程序使用，並請使用者回報；在確認原生程序已結束前，不搶用這些共用連接埠繼續 browser 測試。

每組結果記錄完整 SHA、variant、browser/Tauri、synthetic source、實際 selection/identity、步驟、時間窗、錯誤及 pass/fail/not-run。完成以上缺項並複核後才可宣告 G2；目前不公布 WAVE2_BASE_SHA。之後依序進 W2 A/B/C、W3 D、W4 組合清理，G5 真實 FH6/效能/native 最終證據另記。
