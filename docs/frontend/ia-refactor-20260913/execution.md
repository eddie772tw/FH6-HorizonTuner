# IA 執行與交接紀錄

更新：2026-09-14。Owner：Coordinator / Codex。Status：active。

## 當前範圍

使用者已恢復開發目標：實作至 G5 真實證據驗收前。Shell/docs 由 Coordinator 持有；Terra 分別完成 race handoff P1 獨立重現、回歸測試與最終複查。產品作者均已停寫；另有 Terra 只做 W2-A 設計盤點，沒有 W2 write lease。

本頁是當前候選及 gate 的唯一登記；下方 02:00 保留歷史快照，不能覆寫目前授權或狀態。[baseline.md](baseline.md) 是最初靜態基準。

## 2026-09-14 恢復後現況（live）

| 項目 | 精確證據與邊界 |
| --- | --- |
| aggregate state-base | `373c0b81add4b80786617c1b1358ce22ca78944d`；已 push；117 files／774 tests、Full/Lite build 通過。 |
| Shell consumer / G1-core | [54165303f12c9598872905571f7162cc5f80effa](https://github.com/eddie772tw/FH6-HorizonTuner/commit/54165303f12c9598872905571f7162cc5f80effa)；#345 base 仍是 state-base，新增提交以 c5 為 parent，保留所有 foundation ancestry。119 files／794 tests、Full/Lite build、staged whitespace、8 個修改文件 relative links 通過。Terra 獨立 review PASS、無 P1/P2。G1-core callback 增加可選 source ownership guard，producer/consumer 已重新核對；不包含 A-D。 |
| G0 | partial；code baseline 已有，完整 native baseline/三次效能 evidence 未齊。 |
| G2 | partial；c5 單一 Live/HUD completion、Tune 草稿/量測/保存、archive、Road run 與 page request cleanup 的受控證據保留。新 race handoff 具純整合回歸；mounted A/B、archive/Road identity、重入 cadence、C5/H5 native 仍待完成。 |
| G3/G4 | W2 A/B/C、W3 D 未開工；只有 read-only 設計準備，不公布 WAVE2_BASE_SHA。 |
| G5 | not-run；Full/Lite/native/game/performance 最终完整矩陣待取得，欠必要 G5 證據的相關 PR 保持 draft。 |

### PR 精確候選

| PR | 精確 head | 檢查及交付邊界 |
| --- | --- | --- |
| #339 | `5f86a7e16b55590827c73ba74c4a78001fe5a76c` | 本次文件更新前快照：non-draft、12 checks SUCCESS/CLEAN；不冒充本文提交後的 head/checks。 |
| #340 | `16aa79aed0eeaa6653f86a72e21a0301f0517619` | P1；non-draft、12 checks SUCCESS，獨立 local review PASS。 |
| #341 | `065d462ea4f29e1c36ed79924714f6848ec034ae` | Road state；non-draft、7 checks SUCCESS/CLEAN，獨立 local review PASS。 |
| #342 | `deef1eec61ec0a7fa13028117aa17fe7c98df6c7` | Sessions state；non-draft、7 checks SUCCESS/CLEAN，獨立 local review PASS。 |
| #343 | `550ad69b86986f3430a0bbbef5761e9193b5431d` | Tune state；non-draft、7 checks SUCCESS/CLEAN，獨立 local review PASS。 |
| #344 | `99527597fecc29aab7f419cbfe89bd7f9072a6e0` | HUD state；non-draft、7 checks SUCCESS/CLEAN，獨立 local review PASS。 |
| #345 | `54165303f12c9598872905571f7162cc5f80effa` | draft；新版 7 checks 全部 SUCCESS，含 executable bundle；run 34779609748。這是 5416530 的精確 head 結果，非沿用 c5。 |

#341–#344 是 contract-base candidates；#339/#340 不屬於此類。Ready to Merge 仍要求逐 PR 的 exact base/head、checks、獨立 review、ownership 和依賴条件都成立；不等於已 merged，也不代表可略過前置直接合 main。先 P1，再 foundations，最後 Shell；前置進 main 後重查。先前 #339–#345 reviewThreads 均空、reviewDecision 均空，沒有正式 GitHub approval。main protection 為 404、rules 僅 deletion/non-fast-forward；不把此狀態當正式審查。

### 修正與證據

[race handoff 修正](https://github.com/eddie772tw/FH6-HorizonTuner/blob/54165303f12c9598872905571f7162cc5f80effa/docs/frontend/ia-refactor-20260913/evidence/g2-race-handoff-fix-20260914.md)：c5 的 race A 已 onCompleted、Shell 第二段 list/samples/refresh 尚在途時，B 開始沒有取消 A，Terra 純整合 harness 重現 P1。修正使 race guard 跨 lifecycle → Runtime → Shell → Retry，包含不同 identity stale retry；三個交接等待邊界和 dispose 的回歸通過。這是新的產品修正，舊 c5 G1 freeze 是歷史版本，不以舊 review 掩蓋新缺口。

[G1-core 核對](evidence/g1-shell-freeze-20260914.md) 登記新版 contract；[G2 五組操作](evidence/g2-remaining-20260914.md) 保留尚缺 mounted/native evidence。原 [c5 browser evidence](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/evidence/g2-shell-browser-20260914.md) 只證明已記錄場景；新版 [Shell 交接](https://github.com/eddie772tw/FH6-HorizonTuner/blob/54165303f12c9598872905571f7162cc5f80effa/docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md) 區分歷史與新增驗證。Debug Rust compile 是 c5 的可編譯證據，本次僅改 frontend 與 docs，不冒稱重新做了 native compile 或視窗驗收。

### Ownership 與操作隔離

- 新版工作樹：`D:/FH6-frontend-ia-20260913/shell-race-fix`，local branch `codex/frontend-ia-shell-race-fix-20260914`，HEAD `54165303f12c9598872905571f7162cc5f80effa`。已 fast-forward 推入遠端 Shell PR branch；local/remote 新 SHA 一致。
- 原生交接工作樹：`D:/FH6-frontend-ia-20260913/shell` 的 local branch 刻意保留 `c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`、clean。不能直接 pull 或切換候選干擾使用者；native 回報記錄實際 SHA，不當作新版完整驗收。
- 原 Vite `43401`、backend `57351` 已停止，停止時 TCP 1420/8001 與 UDP 8000 listeners 為 0；本次修正未重新啟服務。這些 ports 保留供 pending 原生觀察，不搶用。
- 已透過 async input 請使用者依 [c5 native handoff](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md) 觀察 Full/Lite。尚無回覆；CUA 只有 browser，不能操作／觀察 native。這是工具能力造成的缺項，沒有技能要求新增批准。
- main 與既有調校 worktrees 未修改；不自動合併 main。G2 通過後才移交 W2；局部 tests、build、CI、synthetic browser 均不能替代 native、真實 FH6 或三次效能結果。

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
