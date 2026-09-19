# Coordinator 交接

目前使用者已恢復 G5 真實證據驗收前的實作目標；即時範圍、寫入 ownership 與驗證狀態以 [execution.md](execution.md) 為準。2026-09-14 的規劃交付與停筆結果保留為歷史快照，不能用來取消後續已恢復的開發授權。

更新：2026-09-19（Asia/Taipei）。本文件先記錄目前交接，再保留帶日期的歷史 snapshot；不要把歷史的 planning-only 欄位當成目前狀態。

## 2026-09-19 目前交接（live）

接手先讀 [execution.md](execution.md)、[G1-core 凍結紀錄](evidence/g1-shell-freeze-20260914.md)、[G2 最小剩餘操作](evidence/g2-remaining-20260914.md)、[2026-09-16 原生觀察](evidence/g2-native-observations-20260916.md) 與 [2026-09-19 原生觀察](evidence/g2-native-observations-20260919.md)。目前 `origin/main` 是 `568da2041e0cb4bbb58583c3a4dc9a279508094d`；9/16 active IA candidates 已 rebase 到 `cd96d86f017fa43f4f3d429155a08aa77dc74bac`，product refs 與先前 plan head `c219630e...` 已推送。`plan` 已備份 `refs/ia-backup/20260919/plan` 並完成 rebase；本次文件更新 head `70248ce...` 由 root 後續推送。

- #340–#345 的 product refs 已由 root 依 exact old-SHA lease 推送新 heads：contracts `9baeb1e`、Road `575ff0f`、Sessions `4904990`、Tune `2f0ac23`、HUD `83301f6`、Shell `ee0f7bb`；new-head CI 尚待完成。#339 remote plan 仍是舊 `8f8edf2`，隨本次文件 push 更新；remote 舊 snapshots（aggregate `373c0b8`、Shell `2cb2983`）只作歷史對照，不能代表新 candidate 驗證。
- 9/19 contracts `9baeb1ec...`：frontend 110 files／789 tests、build PASS；backend 348 passed／8 deselected、Ruff check PASS、format 207 files PASS、version 11.45.18 PASS。sidecar 首輪 HTTP 8001 GET timeout 與 focused 3-test retry 均保留在 `contracts/scratch/rebase-*.log`；完整 backend revalidation PASS。Full native 已有 partial observation，Lite 尚未啟動，pending-write 尚未人工 delay。
- 新 stack aggregate `c38f13ec90e6de671bea51144446720c461650aa` 為 118 files／839 tests、build PASS、diff-check PASS；Shell `ee0f7bb9f5e607a682a5136bb0785deb580e51fb` 為 120 files／859 tests、build PASS、diff-check PASS，race-fix mapping 是 `d37dbf9`，Context blob 仍 `4b534955`。Shell 新 sidecar 與 Full/Lite Tauri build PASS、version 11.45.18；Full artifact `dist/g2-full-20260919/FH6-HorizonTuner.exe` 已固定，Full native 是 partial observation，Lite 尚未啟動。Sessions `49049908...` 為 114 files／807 tests PASS，Tune `2f0ac23...` 為 111 files／799 tests PASS。product refs 已推送，new-head CI 尚待完成。
- 9/16 Shell 前置 `ca942a95...` 的 frontend 119 files／827 tests、build PASS，backend 335 passed／8 deselected、Ruff 208 files、version 11.45.18 PASS；HUD `83301f68...` 為 111 files／796 tests/build PASS、range 3/3 clean，Road `575ff0f...` 為 112 files／804 tests/build PASS、range 4/4 clean。這些是歷史 local results；不能由舊 CI 推定新 head Ready to Merge。
- 2026-09-16 舊 2cb 原生觀察顯示 Full 的 HUD 跨頁、theme/fallback 與 Lite 的 fallback 啟動局部結果；pending config write 跨頁仍缺。它們已轉成 [正式 evidence](evidence/g2-native-observations-20260916.md)，不能當作 9/19 rebase 後 candidate native PASS。
- G2 維持 `partial`；新 candidate Full partial native observation 已記於 [2026-09-19 evidence](evidence/g2-native-observations-20260919.md)，pending write 尚未人工 delay，Lite 尚未啟動。先完成 G2；G2 通過並完成 handoff 後暫停，不開 W2，也不公布 `WAVE2_BASE_SHA`。完整目標保留至後續恢復；後續 assignments 僅由 Luna 執行，複雜 shared coordination 由 root 保留。

## 2026-09-14 恢復後交接（歷史快照）

接手先讀 [execution.md](execution.md)、[G1-core 凍結紀錄](evidence/g1-shell-freeze-20260914.md)、[G2 最小剩餘操作](evidence/g2-remaining-20260914.md) 與 [原生產物與視窗紀錄](evidence/g2-native-artifacts-20260914.md)。精確 PR 狀態只在 execution 登記，避免多份 current table 漂移。

- Active goal：實作至 G5 真實證據驗收前；逐 PR 滿足實作、必要檢查、獨立審查及依賴，才記 Ready to Merge。欠 G5 真實證據的相關 PR 保持 draft，不自動合 main。
- 當前 Shell public `CONTRACT_SHA`：`54165303f12c9598872905571f7162cc5f80effa`；最新 implementation source 為 `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`，僅調整 TelemetryRecorder Context blob `4b53495569904fb95a19d6195037834f3f8f14ca` 的重入輪詢，沒有 public API 變動。PR #345 draft，base aggregate `373c0b81add4b80786617c1b1358ce22ca78944d`；119 files／794 frontend tests、Full/Lite build、334 backend tests／8 modules、Ruff 214 files、version `11.45.17`、Terra reconciliation 與 Luna exact-head doc review 均 PASS。精確 CI 狀態見 execution/PR，不引用 c5 CI。
- G2 partial：`2cb2983` 的 [受控 mounted evidence](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md) 已完成 archive/Road identity、race A/B 第二段交接與重入 cadence；[原生產物與視窗紀錄](evidence/g2-native-artifacts-20260914.md) 已有 Full/Lite/sidecar 建置與 Full AX 局部成功，兩次前景啟用失敗，因此最小剩餘仍只有 Full/Lite C5/H5 native。G0 native/performance baseline 與最終 G5 仍未完成；W2/W3/W4 沒有開始實作。
- Root 持有 Shell/shared wiring/locales/docs。Terra 的 race fix reviews 與回歸測試已結束；另派 Terra 只做 W2-A read-only 設計準備，沒有產品 write lease。
- 新版源碼在 `D:/FH6-frontend-ia-20260913/shell-race-fix`，local branch `codex/frontend-ia-shell-race-fix-20260914`，HEAD `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`；已推到遠端 `codex/frontend-ia-shell-20260914`。原 `shell` 工作樹刻意保持 c5、clean；不可在觀察中 pull/切換它。
- 舊 browser Vite/backend/sender 測試服務已停止。Windows native 介面已初始化；固定 2cb 的 Full/Lite/sidecar 已建置，root 保留已啟動的 Full 與 owned backend 以等待使用者前景回覆。詳見[原生產物與視窗紀錄](evidence/g2-native-artifacts-20260914.md)：AX 可讀 backend 與四個入口，但前景啟用兩次失敗，C5/H5 尚無操作結果，不能寫 pass。

本次文件交接區分 `5416530` public contract、`2cb2983` internal source 與 native 未測邊界；不將純整合 tests 或 mounted browser evidence 當 native pass。原附件與 02:00 歷史驗證保留，不能冒充此候選的驗收結果。

## 02:00 歷史快照（保留）

| 交接欄位 | 內容 |
| --- | --- |
| Task | 前端資訊架構的開發計畫、分工與交接 |
| Status / Owner | handoff / 本對話 Coordinator |
| Task ID | 01a09aae-8ab0-7f71-8291-9716f27e41bc |
| Worktree | D:/FH6-frontend-ia-20260913/plan |
| Branch | codex/plan/frontend-ia-20260913 |
| Product baseline SHA | 5891d21bca35161836d84c51d1b6e9c279ec4709 |
| Planning branch committed head | 22899fb6d45e8a8d56ecf080de37ab9f557aab9f |
| Current delivery | 本地文件修訂，尚未 commit/push |
| Product work | 已停筆；既有 commits/WIP 保留，未整合 |
| Whole implementation | 尚未完成；G0/G1 partial，G2–G5 尚未通過 |

使用者最新回覆為「先完成開發計畫、分工與交接文件（建議）」。本次收尾只完成該範圍；沒有把附件中的實作/PR/merge 指令當作新的執行授權。未因技能或工具拒絕留下未完成文件，也沒有刪除先前成果。

## 交付文件與閱讀順序

| 順序 | 文件 | 用途 |
| --- | --- | --- |
| 1 | [開發計畫](README.md) | 目標、相對附件修訂、Wave 依賴、模型與整合策略 |
| 2 | [工作單](work-orders.md) | Coordinator/A/B/C/D ownership、Luna 派發內容及 handoff 模板 |
| 3 | [介面與 gate](contracts-and-gates.md) | state-lifetime 表、A-D freeze、adapter 移除、逐波出口與 PR-ready 判定 |
| 4 | [驗收矩陣](acceptance.md) | Full/Lite、Tune、Sessions、HUD、Settings、效能/真實證據要求 |
| 5 | [執行紀錄](execution.md) | 當前 gate、owner 與既有 PR 的精確 head 狀態 |
| 6 | [實作交接快照](handoffs/implementation-snapshot-20260914.md) | 分支、dirty files、現存 API、測試限制與接手最小動作 |
| 參考 | [靜態基準](baseline.md)、[G0 執行結果](evidence/g0-baseline.md) | 分開記錄原始程式事實與已執行測試 |
| 來源 | [附件副本](reference/source-proposal.md) | 原始需求追溯，不作當前授權或產品已完成證據 |

總文件入口 [docs/README.md](../../README.md) 已同步連結。

## 本次完成的工作（02:00 歷史快照）

- 重新核對附件、規劃文件、主分支、隔離工作樹與現有兩個 PR；沒有假設原 main 已含新 Shell。
- 協調 Terra 的 HUD/Sessions owner 停寫並提供交接；保留 Tune/Road/Sessions/HUD 已提交成果與 Shell 草稿。
- 由 Terra 獨立審閱依賴，補上 HUD B0、G1-core 與後期 A-D freeze 分界、G2 前置 owner、G0-code/observability、PR 出口及 adapter 清理表。
- 將原文件「全部 proposed、未建 feature branch」等歷史描述改為帶日期的實際狀態，保留已執行測試與未測證據的差別。
- 正式 handoff 路徑統一到 docs；彙整 Road 1 項與 Sessions 4 項獨立 review blocker、HUD 靜態風險及最新精確 heads。planning branch 與原 main、其他 tuning worktree 分離。
- 停止本任務啟動的基準程序，保存 logs、隔離資料與原生編譯結果；沒有繼續產品測試或 native 操作。

## 下一次恢復開發的第一步（02:00 歷史快照）

1. 先核對使用者當時要求、main/remote SHA、所有 worktree dirty paths 與 ownership；不要重建或覆蓋本快照中的草稿。
2. 讀實作快照，將未合併 commits、未測 WIP 與缺少的 G0 native/performance 分開處理；先核對 G0-code，另列 G0-observability 缺項。
3. 沿已對齊 P1 的 road-reviewed 接續修正，保留原分支；完成 Tune 複查、Road/Sessions blocker 修正與 HUD B0 修查，root 才完成 G1-core 和 Shell/Full/Lite 接線。
4. 通過 G2 後公布共同 WAVE2_BASE_SHA，派 A/B/C；在 A-D slot freeze 後才派 D。短期子工作僅用 Luna 子代理，獨立使用者任務須有明確建立要求；複雜協調與決策由 Coordinator/root 處理。
5. 逐次 review、接線及隔離組合驗證；更新精確 head 的 PR/check/evidence；G5 缺必要真實證據的相關 PR 保持 draft。

根據本次交付範圍，下一輪不直接宣告任一程式 lane done，也不把兩個既有 PR 的 CI 視為未提交 WIP 的驗證。

## 本次文件驗證（02:00 歷史快照）

文件驗證結果在收尾時記錄於此；只檢查文件、來源、連結與差異範圍，不新增產品 test/build。

- 計畫目錄 10 份 Markdown 的 UTF-8 正常，55 個本地連結均存在；docs/README.md 的計畫入口已同步。
- 附件副本在正規化換行/行尾空白後全文相符；原檔 SHA-256 仍為 49f9c0a425222c4f7aa630b2a82a7a12c79f30becec0703b6afde743bfa6553a。
- 已追蹤差異的 git diff --check 通過；兩份新增文件的 no-index whitespace check 無錯誤（exit 1 表示與空檔有差異）。
- 規劃工作樹只有 8 份修改文件與 2 份新文件；main 工作樹乾淨，HEAD、origin/main 與本次遠端查詢均為所列基準。
- Terra 獨立複查提出 G1/A-D 循環、G2 前置 owner 及 G0/G5 證據分界；修訂後再次複查為 pass。G1-core、W1 行為與後期完整驗收已分開，最低證據層表涵蓋全部 acceptance ID；這是文件審查結論，不是產品 gate 通過。
- 原有局部 test/build、native 啟動與 PR checks 結果均標示原 SHA/來源；不作本次未推送文件的 CI 證據。
- 本次只交付本地文件，未 commit、push、新建 PR 或合併 main。

## 本輪文件驗證

本輪只更新本計畫目錄的 `execution.md`、`HANDOFF.md`、`contracts-and-gates.md`、`README.md`；未修改產品、依賴、locale、shared code 或 root-owned evidence，未 commit/push。完成後以 `git diff --check` 與 dirty path 檢查確認範圍。
