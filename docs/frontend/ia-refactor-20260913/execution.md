# IA 執行與交接紀錄

更新：2026-09-14。Owner：Coordinator / Codex。Status：active。

## 當前範圍

使用者已恢復開發目標：實作至 G5 真實證據驗收前；欠 G5 真實證據的相關 PR 必須保持 draft。aggregate 已 push；Shell/docs 由 root 持有，Terra 的 narrow Road fix 與最後整合 review 已完成並停筆，獨立 review PASS、無 P1/P2 blocker。

完整 Git/dirty paths、exports、檢查限制與恢復順序見 [實作交接快照](handoffs/implementation-snapshot-20260914.md)。本頁的「恢復後現況」是當前 gate 狀態的唯一登記；下方 02:00 區段保留為歷史快照，不能覆寫目前實作狀態。[baseline.md](baseline.md) 是 2026-09-13 的靜態基準。

## 2026-09-14 恢復後現況（live）

公開介面精確核對見 [G1-core 凍結紀錄](evidence/g1-shell-freeze-20260914.md)；G2 不再用籠統缺項作交接，依 [五組剩餘操作](evidence/g2-remaining-20260914.md) 逐項補證。

使用者已恢復至 G5 真實證據驗收前的完整實作目標。只有已完成 foundation candidate 且逐 PR 的精確 base/head、required checks、獨立 review、ownership 與依賴條件全部成立時，才記為 `Ready to Merge`；不把所有非 G5 PR 一律標為 Ready，也不代表已 merged 或有正式 GitHub approval。欠 G5 真實證據的相關 PR 必須保持 draft；目前 Shell PR #345 仍為 draft。

| 項目 | 目前精確證據與邊界 |
| --- | --- |
| aggregate state-base | [`373c0b81add4b80786617c1b1358ce22ca78944d`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/373c0b81add4b80786617c1b1358ce22ca78944d)；已 push；root 回報全測 `117/774` 與 build 通過。 |
| Shell consumer | [commit `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc)，base `codex/frontend-ia-state-base-20260914`，保留原提交 ancestry，含已提交的 `App`/`LiteApp` active-only wiring；root 回報 118 files / 788 tests、build/staged diff PASS，native cargo debug compile PASS。Shell [PR #345](https://github.com/eddie772tw/FH6-HorizonTuner/pull/345) 為 draft；consumer review `PASS`。 |
| 候選 PR | #339 `c1080684b39fd291a3c972a38e498bf1022819fc`：本次文件更新前已查證的 non-draft / 12 checks SUCCESS snapshot，文件更新後不把它當 current head；#340 `16aa79aed0eeaa6653f86a72e21a0301f0517619`：non-draft、12 checks SUCCESS；#341 `065d462ea4f29e1c36ed79924714f6848ec034ae`、#342 `deef1eec61ec0a7fa13028117aa17fe7c98df6c7`、#343 `550ad69b86986f3430a0bbbef5761e9193b5431d`、#344 `99527597fecc29aab7f419cbfe89bd7f9072a6e0`：各 non-draft、7 checks SUCCESS/CLEAN；#345 `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`：draft，5 項 CI SUCCESS、bundle running。只有 #341–#344 記為 contract-base candidates；#339/#340 不歸入 contract base。各候選的 Ready to Merge 仍須逐 PR 條件成立；#339–#345 reviewThreads 均空、reviewDecision 均空，沒有正式 GitHub approval 記錄；後續以各 PR 最新 head/checks 重查。 |
| G0 | `partial`。新增 [g0-lite-browser-20260914.md](evidence/g0-lite-browser-20260914.md) 作為 root-owned evidence input；native handoff 與 X1 局部量測已保存，但完整 native baseline/三次效能 evidence 仍未齊，不能宣告 G0 pass。 |
| G1-core | `public contract frozen @` [`c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc)。authoritative race 修正與 terminal measurement force-publish 已完成，Terra 最後整合 review PASS、無 P1/P2 blocker；此 freeze 不包含 A-D，亦不等於 G2 pass。 |
| G2 | `partial`。T3、L3、L4、Road snapshot/T4 與 X1 已有受控 UI/整合 evidence；完整 state/identity/race/channel matrix 與 C5/H5 native 仍缺，故不宣告 G2 pass，也不啟動 W2。 |
| G5 | `not-run`。最終 Full/Lite/native/game/performance 矩陣尚未完成；欠必要 G5 證據的相關候選保持 draft。 |

目前已觀察的 G2 局部證據包括：Full/Lite navigation、settings modal、Escape 與 capability；Tune goal/weight/Developer 301 跨頁；T3 的 1080 frames / 18 seconds sweep 中途完成高低 RPM HUD 往返且 Next enabled；保存 POST pending 時切 HUD，返回 Tune 後保存成功且 archive 僅 1 筆；首次 timeout failure 保留量測並可 retry；L3 Live 賽事終了自動開新 session 並有 80 samples；L4 HUD completion 不搶頁、pending 入口可返 Live，點選 exact new session 成功；Road snapshot fix 已完成，Terra 獨立 review 的 9 tests/tsc PASS 且 UI baseline 建立成功；Road 第一趟 HUD 時由 backend 完成 140 samples / 14 seconds，另有 run 開始後 HUD → Tune 仍 recording 7 samples，explicit stop 保存 48 samples / 4.7 seconds；T4 reload 後 archive 1 筆可沿用，profile 1500 kg / 215 hp 回讀，Road finish 未提交文字 `1:23.456` 的 Sessions 往返保留並選第 2 run / 48 samples；HUD offset 5 跨頁與 backend readback；latest backend down 時保留 Live + Retry 並恢復 B80；raw Developer Capture 合成 120 → HUD → 240，且新 identity 失效後保留 240。X1 觀察為 Road 8 seconds 離頁 poll 8 → 0、Sessions current recording 6 seconds data 7 / debrief 6 → HUD 兩者 0、Diagnostics 5 seconds logs 5 → 關閉 0，無 event truncation。這些是受控 UI/整合觀察，不取代完整 state/identity/race/channel matrix、C5/H5 native、真實遊戲、效能或完整 G5 evidence。

新增文件 evidence 使用 Shell commit 的 exact-SHA GitHub 連結：[g2-shell-browser-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/evidence/g2-shell-browser-20260914.md)、[shell-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md)、[g2-native-20260914.md](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md)。三份新 docs links 已通過檢查。

目前 remaining：完整 state/identity/race/channel matrix、C5/H5 native、以及最後的 Full/Lite/native/game/performance G5 矩陣。Shell PR #345 仍為 draft，5 項 CI 已成功但 bundle running；root 已透過 async input 請使用者依 native handoff 觀察固定 `c5e7fdf` 的 Full/Lite C5/H5，等待回覆。aggregate 已 push，沒有把 local staged/build 或受控 UI evidence 當成 G5 pass。

本次協調也確認 Vite session `43401`、backend `57351` 已由 root 停止；TCP `1420/8001` 與 UDP `8000` listeners 均為 0，沒有產品寫入者。GitHub main protection 查詢為 404，現有 rules 僅 deletion/non-fast-forward；不把它解讀成正式 approval 或完整 branch protection。

## 2026-09-14 02:00 歷史快照：Gate 狀態（保留）

| Gate | 狀態 | 已有證據 / 未完成事項 |
| --- | --- | --- |
| 規劃交付 | handoff | 計畫、分工、欄位/介面與 PR 出口、驗收矩陣、交接已整理；文件驗證見 HANDOFF |
| G0 | partial / handoff | main 與遠端均為 5891d21bca35161836d84c51d1b6e9c279ec4709，main clean；108 files / 719 tests、Full/Lite build；Full browser/native dev 啟動局部紀錄。新增 Full idle 單次 browser renderer 觀測已保存；G0-observability 仍缺 native/三次效能，整體未通過 |
| G1 | partial / handoff | P1 fc79608 純契約已有測試；Tune/Road/Sessions/HUD 提交已保留。Road 1 項、Sessions 4 項獨立 review blocker 待修；HUD 權威設定與生命週期待修查，G1-core freeze 尚未完成 |
| G2 | not-run | Shell 尚未接入 App/LiteApp；providers 尚未整合，沒有跨頁/active-only 驗收，W2 不開工 |
| G3 | proposed | W2 A/B/C 面板與完整重構未啟動；W1 最小前置不算 W2 完成 |
| G4 | proposed | A-D 介面尚未 freeze；D review export/接線未啟動 |
| G5 | not-run | 最終 Full/Lite/native/game/performance 矩陣未完成，不能宣告整體 done |

局部 unit/build 通過不代表所有 acceptance ID 已通過；沒有對應環境證據的項目維持 not-run。後續恢復時，非 G5 PR 的完整交付要求與 G5 draft 邊界按 [contracts-and-gates.md](contracts-and-gates.md) 執行。

## 2026-09-14 02:00 歷史快照：前次交接與 ownership（保留）

下表保留前次提交與 review 起點。當前 active lease 以上方範圍為準；修正交回後更新精確 head，未轉交不得寫其他 lane。

| 範圍 | Owner / 模型 | Worktree | 交接狀態 |
| --- | --- | --- | --- |
| 計畫、契約、共享 Shell、root wiring | Coordinator | plan / contracts / shell | docs 本次修訂；contracts clean；shell WIP 保留 |
| Tune state | road_state / Terra；原 tune owner 成果續修 | tune-state | fc67350 clean；量測重測/identity/RPM 修正已提交，作者 110 files / 731 tests 與 build 通過；root 複查待續 |
| Road state | Coordinator 修正；hud_scout 獨立 review | road-reviewed；原 road-state 保留 | 950390c5ffb5f3e1fbad1e7b21e2e8f885ce6ab0 clean，已對齊 P1；finish 草稿修正後 111 files / 739 tests 與 build 通過；獨立複查待續 |
| Sessions state / Live adapter | sessions_state / Terra；sessions_review / Luna xhigh 唯讀 | sessions-state | e462d61 clean；111 files / 733 tests 與 build 通過；獨立 review 4 項 blocker 待修 |
| HUD state B0 | hud_scout / Terra | hud-state | 4702651 clean；110 files / 729 tests 與 build 通過；root 權威設定/非同步審查尚未通過 |
| G0 / P1 reviewer | baseline_evidence；baseline_runtime / Luna high | baseline | 既有 baseline/review 與新增局部 runtime 記錄分開保存；沒有完整 G0 通過證據 |
| 計畫獨立複查 | road_state、hud_scout / Terra | 唯讀 plan | 補充 state table、A-D freeze、PR 出口、adapter register、gate 證據界線 |

未建立使用者擁有的新實作任務。不同子代理工作樹沒有共同使用同一份 node_modules，也沒有同時寫共享 Shell。各分支 base 不完全相同，必須按快照對齊後再整合。

## 2026-09-14 02:00 歷史快照：既有 PR 的唯讀查詢（保留）

查詢時間：2026-09-14（Asia/Taipei）。這是當時遠端 head 的狀態，後續 branch/base 改變須重查。此表是遠端查詢快照；恢復實作後每次推送重查，不據此宣告尚未推送內容已驗證。

| PR | 遠端 Head | 本次查詢結果 / 邊界 |
| --- | --- | --- |
| [#339：規劃文件](https://github.com/eddie772tw/FH6-HorizonTuner/pull/339) | 22899fb6d45e8a8d56ecf080de37ab9f557aab9f | OPEN、non-draft、MERGEABLE/CLEAN、12 checks SUCCESS；最新本地文件修訂未包含在此 head，不能把 CI 綠燈延伸到未推送內容 |
| [#340：P1 契約與 dead navigation](https://github.com/eddie772tw/FH6-HorizonTuner/pull/340) | fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9 | OPEN、non-draft、MERGEABLE/CLEAN、12 checks SUCCESS；先前 Luna 獨立 local review 已回報。此 PR 只涵蓋 foundation，runtime enforcement 留待 P2 |

兩者查詢的 reviewDecision 均為空字串，不將其翻譯成 GitHub 正式 approval；本次沒有完成新的 branch-protection/review-thread 全量 readiness 稽核。沒有把其他 WIP 稱為 PR-ready。既有 #337/#338 為其他工作，未納入或修改。

## 本次文件審閱的採納決策

- 納入每列 state 的 lifetime、identity、pending/late response 與 Full/Lite 邊界。
- 把 HUD B0 放在 G2 前；G1-core 不包含後期 A→D review slot；G2 前置驗收由 W1 owners 負責，各 lane 遷移後再完整重驗。
- G0-code 是純契約/狀態前置的開工條件；G0-observability 保留為 X3/G5 比較前置。G2 所需 native HUD lifecycle 仍須當場完成，缺項不假稱通過。
- 納入 A→D 介面 freeze、版本與 owner transfer，及 compatibility adapter 的移除條件。
- 統一正式 handoff 為各 worktree 的 docs/frontend/ia-refactor-20260913/handoffs/；scratch 僅作 log。
- 明定相依 PR 的 base/整合順序與 Ready to Merge 條件。
- 未採納將所有既有測試結果一律改成 not-run 的建議：已執行的 unit/build 仍保留為局部歷史證據；只對沒有實際證據的驗收項寫 not-run。

本次採用 cross-agent-collaboration；先前程式階段採用的 UI、modular、PR、portable 技能是歷史執行紀錄，不代表本次新增該範圍的開發。沒有把尚未重現的猜測寫入 Journal 或長期記憶。
