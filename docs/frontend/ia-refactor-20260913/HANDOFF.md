# Coordinator 交接

目前使用者已恢復 G5 真實證據驗收前的實作目標；即時範圍、寫入 ownership 與驗證狀態以 [execution.md](execution.md) 為準。下列 02:00 規劃交付與停筆結果是歷史快照，不能用來取消後續已恢復的開發授權。

更新：2026-09-14（Asia/Taipei）。本文件先記錄恢復後交接，再保留 02:00 snapshot；不要把歷史的 planning-only 欄位當成目前狀態。

## 恢復後交接（live）

接手先讀 [G1-core 凍結紀錄](evidence/g1-shell-freeze-20260914.md) 與 [G2 五組剩餘操作](evidence/g2-remaining-20260914.md)。三組由 Coordinator 操作 mounted UI，兩組需要實際 Windows 原生視窗觀察；目前共用連接埠已交回原生驗收使用。

本次文件驗證：12 份計畫文件共 97 個連結（排除原始附件副本及 code-fence 範例）無失效本地目標；fixed-SHA GitHub blob 連結已由 Git object 核对來源檔存在。原始附件副本未修改。新增與既有改動一併 stage 後執行 whitespace check；不將產品分支測試當成本文件內容已實作的證據。

| 交接欄位 | 內容 |
| --- | --- |
| Active goal | 恢復實作至 G5 真實證據驗收前；只有已完成 foundation candidate 且逐 PR 的精確 base/head、required checks、獨立 review、ownership 與依賴條件全部成立時才記為 `Ready to Merge`，不把所有非 G5 PR 一律標為 Ready。欠 G5 真實證據的相關 PR 必須保持 draft。 |
| aggregate state-base | [`373c0b81add4b80786617c1b1358ce22ca78944d`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/373c0b81add4b80786617c1b1358ce22ca78944d)；已 push；root 回報 `117/774` 全測與 build 通過。 |
| Shell consumer | [commit `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc)，base `codex/frontend-ia-state-base-20260914`，保留原 ancestry，含已提交的 `App`/`LiteApp` active-only wiring；root 回報 118 files / 788 tests、build/staged diff PASS，native cargo debug compile PASS。Shell [PR #345](https://github.com/eddie772tw/FH6-HorizonTuner/pull/345) 為 draft，5 項 CI SUCCESS、bundle running；consumer review `PASS`。 |
| G1-core | public contract 已 freeze @ [`c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc)；authoritative race 修正與 terminal measurement force-publish 已完成，Terra 最後整合 review PASS、無 P1/P2 blocker。此 freeze 不包含 A-D，也不等於 G2 pass。 |
| G2 | `partial`。已觀察 T3、L3、L4、Road snapshot/T4 與 X1 的受控 UI/整合 evidence；完整 state/identity/race/channel matrix 與 C5/H5 native 尚缺，不宣告 G2 pass、不啟動 W2。 |
| G5 | 尚未通過；Full/Lite/native/game/performance 矩陣與必要真實 evidence 待完成，相關候選保持 draft。 |

### 候選 PR 與檢查快照

| PR | 精確 head | 目前觀察 |
| --- | --- | --- |
| #339 | `c1080684b39fd291a3c972a38e498bf1022819fc` | 本次文件更新前已查證的 non-draft / 12 checks SUCCESS snapshot；更新後不視為 current head |
| #340 | `16aa79aed0eeaa6653f86a72e21a0301f0517619` | non-draft；12 checks SUCCESS |
| #341 | `065d462ea4f29e1c36ed79924714f6848ec034ae` | non-draft；7 checks SUCCESS/CLEAN |
| #342 | `deef1eec61ec0a7fa13028117aa17fe7c98df6c7` | non-draft；7 checks SUCCESS/CLEAN |
| #343 | `550ad69b86986f3430a0bbbef5761e9193b5431d` | non-draft；7 checks SUCCESS/CLEAN |
| #344 | `99527597fecc29aab7f419cbfe89bd7f9072a6e0` | non-draft；7 checks SUCCESS/CLEAN |
| #345 | `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc` | draft；base `codex/frontend-ia-state-base-20260914`；CI pending root 查 |

只有 #341–#344 位於 contract-base；#339/#340 不歸入 contract base。各候選的 Ready to Merge 仍須逐 PR 條件成立；獨立 local reviews 為 PASS，沒有正式 GitHub approval 記錄，也不把 checks 或 non-draft 單獨當成 merged/G5 證據。G0 的 root-owned [g0-lite-browser-20260914.md](evidence/g0-lite-browser-20260914.md) 已納入 evidence input，本次未修改。

### 目前 evidence 連結與 owner

Shell commit 內的三份新文件使用 exact-SHA GitHub 連結：[g2-shell-browser-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/evidence/g2-shell-browser-20260914.md)、[shell-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md)、[g2-native-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md)。三份新 docs links 已通過檢查。

目前 CUA evidence 包含 T3 1080 frames / 18 seconds sweep、高低 RPM HUD 往返、POST pending 切 HUD 後保存成功且 archive 1 筆、timeout 保留量測可 retry；L3 自動開新 80-sample session；L4 HUD completion 不搶頁、pending 入口返 Live 並開 exact new session；Road snapshot fix 已完成，Terra 獨立 review 的 9 tests/tsc PASS 且 UI baseline 建立成功；Road 第一趟 backend 完成 140 samples / 14 seconds、另一趟 recording 7 samples 後 explicit stop 保存 48 samples / 4.7 seconds；T4 reload archive 1 筆與 profile 1500 kg / 215 hp 回讀，未提交 Road finish `1:23.456` 往返 Sessions 並選第 2 run / 48；X1 的 Road poll 8 → 0、Sessions data/debrief 7/6 → HUD 0/0、Diagnostics logs 5 → 關閉 0，無 event truncation。

Vite session `43401`、backend `57351` 已由 root 停止；TCP `1420/8001` 與 UDP `8000` listeners 均為 0，沒有產品寫入者。GitHub main protection 查詢為 404，現有 rules 僅 deletion/non-fast-forward；#339–#345 reviewThreads 均空、reviewDecision 均空，沒有正式 GitHub approval。native C5/H5 Full/Lite 觀察已透過 async input 交由使用者依 [native handoff](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md) 執行，回覆 pending。

### 目前 owner 與下一步

- root：持有 Shell/docs 與 shared wiring；aggregate state-base 已 push，Shell PR #345 仍 draft，5 項 CI SUCCESS、bundle running。
- Terra：narrow Road fix 與最後整合 review 已完成，獨立 review PASS、無 P1/P2 blocker；其餘 review 已完成並停筆。
- Coordinator/root：完成完整 state/identity/race/channel matrix、C5/H5 native 與最終 G5 matrix；不以 local staged/build 或受控 UI evidence 宣告 G2/G5 pass。

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
| 2 | [工作單](work-orders.md) | Coordinator/A/B/C/D ownership、Luna/Terra 派發內容及 handoff 模板 |
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
4. 通過 G2 後公布共同 WAVE2_BASE_SHA，派 A/B/C；在 A-D slot freeze 後才派 D。短期子工作用 Luna/Terra 子代理，獨立使用者任務須有明確建立要求。
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
