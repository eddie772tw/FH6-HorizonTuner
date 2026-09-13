# G2 最小剩餘操作

公開 `CONTRACT_SHA`：`54165303f12c9598872905571f7162cc5f80effa`；最新 implementation candidate：`2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`，PR #345 draft。`2cb2983` 只改 TelemetryRecorder Context 的重入輪詢，沒有改公開 contract。c5 的第二段 preflight race A/B P1 已由 [race handoff 修正](https://github.com/eddie772tw/FH6-HorizonTuner/blob/54165303f12c9598872905571f7162cc5f80effa/docs/frontend/ia-refactor-20260913/evidence/g2-race-handoff-fix-20260914.md) 修正並通過純回歸與獨立 review。

## 已完成的受控 mounted 操作 1–3

[2cb mounted evidence](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md) 使用實際 App/providers/backend 與隔離合成資料，並由 Terra G2 reconciliation 複核：

1. **Archive/Road identity**：車 A archive/8000 RPM 與 Road A active run 在 HUD 期間切至車 B 後，A 歷史可讀但 B 不繼承確認；新 run 不可提交。
2. **Race A/B 第二段交接**：A 的第二個 saved-data GET 在 lifecycle 已交給 Shell 後暫停，B 開始後釋放 A；A 不導頁或覆蓋，B 完成後 Sessions 精確選取 B 的非空資料。
3. **重入 cadence**：Sessions → HUD → Sessions、Road 與 Diagnostics 反覆重入沒有累積 page reads；HUD 離頁仍為零次。request metadata 只證明列出的 page reads，不等同所有 channel/listener 或效能量測。

這三項完成不宣稱 Windows 原生視窗、真實 FH6、資源清理或三次效能比較已完成；那些分屬後期 W2–W4/G5，不回填為新的 G2 blocker。

## 尚缺的兩項 G2 native 操作

| 操作 | 最小步驟與觀察 | Owner / 狀態 |
| --- | --- | --- |
| 4. C5 native | Full/Lite 各自真實 Tauri startup、backend-ready、entry、guide/menu、設定的 dark/light/core 首幀；另驗正常 dynamic-port path。 | 使用者觀察＋Coordinator 記錄；not-run。8001 外部 backend 程序不能單獨證明 dynamic-port。 |
| 5. H5 native | Full/Lite 分別觀察獨立 HUD：啟動 → 離開 HUD → 重入 → 明確關閉；pending config write 結束後回讀一致，外部視窗不能跟 page 一起關閉。 | 使用者觀察＋Coordinator 記錄；not-run。按鈕變字不等於原生視窗證據。 |

原 `shell` 工作樹刻意保持 c5、clean；新版在 `shell-race-fix`。c5 不能當作 2cb native 驗收。所有自有 Vite/backend/sender 測試服務已停止；先前只能請使用者觀察 c5 是歷史限制，Windows native 介面現在已初始化。root 正在準備固定 2cb 的 Full release（session `39383`，sidecar 已完成），尚未執行或通過 C5/H5；完成後必須記錄實際 artifact SHA、variant、dynamic port 與操作結果。

兩項 native 結果記錄完整 SHA、variant、Tauri、dynamic port、步驟、錯誤及 pass/fail/not-run。完成 C5/H5 並複核後才可宣告 G2；目前不公布 WAVE2_BASE_SHA。之後依序進 W2 A/B/C、W3 D、W4 組合清理，G5 真實 FH6/效能/native 最終證據另記。
