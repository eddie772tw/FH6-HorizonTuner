# Coordinator 交接

目前使用者已恢復 G5 真實證據驗收前的實作目標；即時範圍、寫入 ownership 與驗證狀態以 [execution.md](execution.md) 為準。下列 2026-09-14 規劃交付與停筆結果是歷史快照，不能用來取消後續已恢復的開發授權。

更新：2026-09-14（Asia/Taipei）。本文件記錄現在的交接狀態；2026-09-13 的純規劃歷史可從同一分支的 Git 紀錄查看。

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
| 2 | [工作單](work-orders.md) | Coordinator/A/B/C/D ownership、Luna/Terra 派發內容及 handoff 模板 |
| 3 | [介面與 gate](contracts-and-gates.md) | state-lifetime 表、A-D freeze、adapter 移除、逐波出口與 PR-ready 判定 |
| 4 | [驗收矩陣](acceptance.md) | Full/Lite、Tune、Sessions、HUD、Settings、效能/真實證據要求 |
| 5 | [執行紀錄](execution.md) | 當前 gate、owner 與既有 PR 的精確 head 狀態 |
| 6 | [實作交接快照](handoffs/implementation-snapshot-20260914.md) | 分支、dirty files、現存 API、測試限制與接手最小動作 |
| 參考 | [靜態基準](baseline.md)、[G0 執行結果](evidence/g0-baseline.md) | 分開記錄原始程式事實與已執行測試 |
| 來源 | [附件副本](reference/source-proposal.md) | 原始需求追溯，不作當前授權或產品已完成證據 |

總文件入口 [docs/README.md](../../README.md) 已同步連結。

## 本次完成的工作

- 重新核對附件、規劃文件、主分支、隔離工作樹與現有兩個 PR；沒有假設原 main 已含新 Shell。
- 協調 Terra 的 HUD/Sessions owner 停寫並提供交接；保留 Tune/Road/Sessions/HUD 已提交成果與 Shell 草稿。
- 由 Terra 獨立審閱依賴，補上 HUD B0、G1-core 與後期 A-D freeze 分界、G2 前置 owner、G0-code/observability、PR 出口及 adapter 清理表。
- 將原文件「全部 proposed、未建 feature branch」等歷史描述改為帶日期的實際狀態，保留已執行測試與未測證據的差別。
- 正式 handoff 路徑統一到 docs；彙整 Road 1 項與 Sessions 4 項獨立 review blocker、HUD 靜態風險及最新精確 heads。planning branch 與原 main、其他 tuning worktree 分離。
- 停止本任務啟動的基準程序，保存 logs、隔離資料與原生編譯結果；沒有繼續產品測試或 native 操作。

## 下一次恢復開發的第一步

1. 先核對使用者當時要求、main/remote SHA、所有 worktree dirty paths 與 ownership；不要重建或覆蓋本快照中的草稿。
2. 讀實作快照，將未合併 commits、未測 WIP 與缺少的 G0 native/performance 分開處理；先核對 G0-code，另列 G0-observability 缺項。
3. 沿已對齊 P1 的 road-reviewed 接續修正，保留原分支；完成 Tune 複查、Road/Sessions blocker 修正與 HUD B0 修查，root 才完成 G1-core 和 Shell/Full/Lite 接線。
4. 通過 G2 後公布共同 WAVE2_BASE_SHA，派 A/B/C；在 A-D slot freeze 後才派 D。短期子工作用 Luna/Terra 子代理，獨立使用者任務須有明確建立要求。
5. 逐次 review、接線及隔離組合驗證；更新精確 head 的 PR/check/evidence；G5 缺必要真實證據的相關 PR 保持 draft。

根據本次交付範圍，下一輪不直接宣告任一程式 lane done，也不把兩個既有 PR 的 CI 視為未提交 WIP 的驗證。

## 本次文件驗證

文件驗證結果在收尾時記錄於此；只檢查文件、來源、連結與差異範圍，不新增產品 test/build。

- 計畫目錄 10 份 Markdown 的 UTF-8 正常，55 個本地連結均存在；docs/README.md 的計畫入口已同步。
- 附件副本在正規化換行/行尾空白後全文相符；原檔 SHA-256 仍為 49f9c0a425222c4f7aa630b2a82a7a12c79f30becec0703b6afde743bfa6553a。
- 已追蹤差異的 git diff --check 通過；兩份新增文件的 no-index whitespace check 無錯誤（exit 1 表示與空檔有差異）。
- 規劃工作樹只有 8 份修改文件與 2 份新文件；main 工作樹乾淨，HEAD、origin/main 與本次遠端查詢均為所列基準。
- Terra 獨立複查提出 G1/A-D 循環、G2 前置 owner 及 G0/G5 證據分界；修訂後再次複查為 pass。G1-core、W1 行為與後期完整驗收已分開，最低證據層表涵蓋全部 acceptance ID；這是文件審查結論，不是產品 gate 通過。
- 原有局部 test/build、native 啟動與 PR checks 結果均標示原 SHA/來源；不作本次未推送文件的 CI 證據。
- 本次只交付本地文件，未 commit、push、新建 PR 或合併 main。
