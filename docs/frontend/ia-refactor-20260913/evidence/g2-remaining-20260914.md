# G2 最小剩餘操作

更新：2026-09-19（Asia/Taipei）。這份文件登記目前 rebase 後 candidate 的剩餘驗收；文件檔名保留原日期路徑以避免破壞既有連結。G2 仍為 `partial`，W2 尚未啟動，也不公布 `WAVE2_BASE_SHA`。

## 目前基準與已取得證據

- 目前產品基準：`568da2041e0cb4bbb58583c3a4dc9a279508094d`（`origin/main`）。9/16 active IA candidates 的 rebase 基準是 `cd96d86f017fa43f4f3d429155a08aa77dc74bac`；9/19 contracts local candidate 是 `9baeb1ec6f5edd14b61c6aa90944b1d9bb820623`。
- G1-core public contract 的歷史 freeze 仍登記於 `54165303f12c9598872905571f7162cc5f80effa`；Shell 9/16 local implementation candidate `ca942a95c4edb80b777c0b7989ed6b108270cbde` 有 119 files／827 frontend tests、build PASS、335 backend passed／8 deselected、Ruff 208 files、version 11.45.18 PASS，但未推送。
- Contracts 9/19 local candidate `9baeb1ec...` 有 frontend 110 files／789 tests、build PASS；backend 348 passed／8 deselected、Ruff check PASS、format 207 files PASS、version 11.45.18 PASS。sidecar 首輪 HTTP 8001 GET timeout、focused 3-test retry 與完整 revalidation 分別保留於 `contracts/scratch/rebase-sidecar-retest-20260919.log`、`contracts/scratch/rebase-backend-retest-20260919.log` 等 log；不放寬 timeout，也未修改產品程式。
- 2026-09-16 舊 2cb 的 Full/Lite 原生觀察已整理至 [正式 evidence](g2-native-observations-20260916.md)。Full 有 HUD 跨頁、theme 與 fallback 局部觀察；Lite 只有 fallback 啟動局部觀察；pending config write 跨頁仍缺。它們不等於 9/19 rebase 後 candidate native PASS。

## 新 candidate 尚缺的兩項 G2 native 操作

| 操作 | 新候選的最小步驟與可接受觀察 | 目前狀態 |
| --- | --- | --- |
| C5 native | 以新 candidate 產物分別啟動 Full/Lite；記錄完整 artifact SHA、backend-ready、entry、guide/menu、dark/light/core 首幀與 default/fallback dynamic-port。兩入口須各自使用隔離資料目錄與程序。 | `not-run`；舊 2cb 的 Full/Lite 觀察不能回填 |
| H5 native | 以新 candidate 分別啟動 Full/Lite HUD，觀察啟動 → 離開 HUD → 回到頁面 → 重入；以人工延遲或可觀察的慢回應驗證 pending config write 在離頁後完成並回讀一致，外部 HUD 不跟 page 關閉。 | `not-run`；舊 2cb Full 的一般跨頁生命週期不足以證明 pending write |

### 操作與證據規則

每個結果記錄 candidate SHA、variant、Tauri/Windows 環境、artifact SHA-256、dynamic port、資料目錄、步驟、錯誤、listener cleanup 與 `pass | fail | not-run`。新候選 native 需要重新建置與重新觀察；不得以舊 PID、舊 listener、browser/mocked UI、config readback 單獨推論原生視窗存在。

若新候選只取得 Full 或 Lite 的局部結果，另一入口與缺少的 H5/pending-write 仍維持 `not-run`。完成 C5/H5 並由 Coordinator 複核後，才可重新評估 G2；其後才可依序啟動 W2 A/B/C、W3 D 與 W4 組合清理。G5 的真實 FH6、完整資源生命週期與三次效能比較另依 [驗收矩陣](../acceptance.md) 記錄。

## 2026-09-14 舊候選快照（保留歷史）

以下內容是 `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe` 的歷史 mounted 證據摘要，不是目前新 candidate 的完成宣告：

1. Archive/Road identity：車 A archive/8000 RPM 與 Road A active run 在 HUD 期間切到車 B 後，A 歷史可讀但 B 不繼承確認；新 run 不可提交。
2. Race A/B 第二段交接：A 的第二個 saved-data GET 在 lifecycle 交給 Shell 後暫停，B 開始後釋放 A；A 不導頁或覆蓋，B 完成後 Sessions 精確選取 B 的非空資料。
3. 重入 cadence：Sessions → HUD → Sessions、Road 與 Diagnostics 反覆重入沒有累積 page reads；HUD 離頁為零次。這只證明列出的 page reads，不等同所有 channel/listener 或效能量測。

完整歷史來源見 [g2-mounted-reentry-20260914](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md) 與 [2026-09-16 native observations](g2-native-observations-20260916.md)。2026-09-14 的 activation failure/等待使用者敘述留在[帶日期的產物快照](g2-native-artifacts-20260914.md)作歷史紀錄，不作目前 live blocker。
