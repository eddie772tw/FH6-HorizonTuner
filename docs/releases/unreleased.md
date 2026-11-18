# 開發分支變更 / Unreleased

本頁記錄尚未發布的修正，不代表 V1.8.4 安裝檔或 OTA 已更新。

## 調校流程

- 「下一步」、後續步驟分頁與流程引導的前進操作會先驗證草稿、儲存車輛參數，套用目前賽事目標與本地基準，再以新計算結果檢查是否能前進。不必先捲到頁面下方另按套用；套用不會改寫遊戲設定。
- 儲存失敗會保留草稿並停留原頁；套用後計算失敗會保留正式目標，允許重試。返回前一步與單獨儲存不會套用草稿。
- 內燃機 Step3 等待新遙測與身分資訊；首次補齊身分不再誤判為改裝。同車時間戳重設會自動重建量測區段，未完成進度清除，已完成結果及對應樣本分開保留，不跨場景拼接曲線。
- 區分資料停滯、時間戳重設與車輛／設定變更提示。實際改裝仍使量測失效，手動暫停不會被自動解除；只有存在完成快照時才提示已保留可用結果。

## Tuning workflow

- Next, forward step tabs and guide actions validate the draft, save vehicle parameters, apply the draft target and local baseline, and check the newly calculated readiness before moving forward. Applying a local baseline does not change settings in the game.
- Save failures retain the draft and current step. Calculation failures retain the applied target and allow retry. Going back or explicitly saving vehicle parameters does not apply a draft.
- ICE Step 3 waits for fresh telemetry and identity. First identity hydration no longer invalidates preparation. A same-build clock reset automatically starts a new measurement segment, clearing unfinished progress while retaining completed results with their original frames. Curves are never joined across clock resets.
- Status messages distinguish stalled telemetry, a restarted driving session and a changed car or setup. Real build changes still invalidate measurement, and automatic recovery never resumes a manual pause.

## 驗證邊界 / Validation boundary

Cargo 契約測試以既有實車紀錄回放驗證兩次時間戳重設及儲存區段的分析一致性；Vitest 驗證導航失敗、重試、身分補齊、區段切換、已完成結果回復及暫停。瀏覽器使用正式 AppShell、Rust API 與模擬遙測，不代表遊戲、Windows 原生視窗或手機實機驗收。

Cargo replays existing recorded captures to verify clock-reset recovery and agreement with saved-segment analysis. Vitest covers navigation failures and retries, identity hydration, segment boundaries, retained results and pause handling. Browser checks use the real AppShell and Rust API with simulated telemetry; in-game and native-device acceptance remain outstanding.

[介面證據 / Visual evidence](../visual-review/tuning-navigation-recovery/README.md)
