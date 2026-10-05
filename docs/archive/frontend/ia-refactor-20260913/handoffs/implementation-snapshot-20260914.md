# 既有實作的停筆交接快照

更新：2026-09-14 02:00（Asia/Taipei）。Owner：Coordinator。Status：handoff。

使用者最新選擇本輪只交付開發計畫、分工與交接文件。此快照保存先前已有成果；程式 owner 已停寫，不代表 G1/G2 通過。沒有 reset、clean、覆寫或合併 main。

## 1. 分支與實際狀態

工作樹共同根目錄為 D:/FH6-frontend-ia-20260913/。原 D:/FH6-HorizonTuner 的 main 乾淨，HEAD 與本次遠端查詢均為 5891d21bca35161836d84c51d1b6e9c279ec4709。P1_PARENT_SHA 為 fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9。

| worktree / branch | Base → Head | 保留狀態 |
| --- | --- | --- |
| plan / codex/plan/frontend-ia-20260913 | main → 22899fb6d45e8a8d56ecf080de37ab9f557aab9f | PR #339 已存在；最新本地文件尚未 commit/push |
| contracts / codex/frontend-ia-contracts-20260914 | main → fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9 | clean；PR #340；純契約與 dead HUD navigation |
| shell / codex/frontend-ia-shell-20260914 | P1 → 同 SHA | 16 個 dirty/untracked 檔；未接 App/LiteApp，無提交/PR |
| tune-state / codex/frontend-ia-tune-state-20260914 | P1 → fc67350356190e8fa7695c1c95f689c76d0b64cf | clean；b0e4df6 + fc67350；未 push/PR/接線；修正後 root 複查待續 |
| road-state / codex/frontend-ia-road-state-20260914 | main → 2c6cc0c30239174389c3418e9391cd4e9c1ff5bb | clean；原 f3cbdb7 + 2c6cc0c 保留，接續下一列候選 |
| road-reviewed / codex/frontend-ia-road-review-20260914 | P1 → 2ba427c94fe778fcb758d93611dcf784c2117b93 | clean；移植為 6c22a38/854c455，range-diff 相同，再加 root 修正；1 項 review blocker |
| sessions-state / codex/frontend-ia-sessions-state-20260914 | P1 → e462d612522329d975db9462746c176750376f50 | clean；已提交/驗證；4 項 review blocker；未 push/PR/接線 |
| hud-state / codex/frontend-ia-hud-state-20260914 | P1 → 47026519cdda1df6ff3621895f5c1a0ed1a6b0b3 | clean；B0 已提交；權威設定待修查；未 push/PR/接線 |
| baseline / detached main | main → 同 SHA | 既有 Cargo.toml dirty/換行提示保留；不是實作分支 |

這些不是同一候選組合，不相加測試數。下列測試標示作者或 reviewer 來源；本次文件整理沒有重跑全量產品測試。

## 2. Coordinator Shell WIP

修改：frontend/src/components/DiagnosticConsole.tsx、components/common/UpdateModal.tsx、features/settings/SettingsView.tsx、features/theme/ThemeView.tsx、hooks/useTelemetry.ts、lite-main.tsx、main.tsx，以及 lang/zh-tw.json。

新檔：frontend/src/app/AppBuildInfo.tsx、AppDialog.tsx、AppHeader.tsx、AppMenu.tsx、AppShell.tsx、AppStatus.tsx、applyThemeEarly.ts，以及 frontend/src/hooks/useModalFocus.ts。

已起草導覽、Menu/status/build info、app surfaces、focus/portal、early theme、隱藏 diagnostics 停止 polling、telemetry channel owner。AppShell 有 active-only registry 與 capability gate，但 App.tsx/LiteApp.tsx 尚未接入，四個 state foundation 未整合。最後完整 test/build 尚未執行；早先 TypeScript 結果不涵蓋後續修改。

root 接手先核對 WIP、契約與各 lane locale requests，再掛載 providers。shared hooks/components/lang/root entry 仍由 root 獨占；不將 feature 欄位移入 Shell，也不保留兩套 step owner。

## 3. Tune

正式交接：[tune-state.md](D:/FH6-frontend-ia-20260913/tune-state/docs/frontend/ia-refactor-20260913/handoffs/tune-state.md)。入口為 features/tuning/TuneSessionProvider.tsx 的 TuneSessionProvider / useTuneSession；Full-only，掛在 AppProviders 下、workspace switch 上。

fc67350 已修重測 phase/buffer、首次 identity hydration、selected observation 的 car/PI/class/RPM 適用性與 archive save generation。作者 focused 7 tests、全量 110 files / 731 tests、Full/Lite build、diff check 通過。root 尚未完成修正後完整複查；跨頁、native/game、backend save race 未驗收。reviewHistory 與 step 相容 props 待指定 gate 移除。

下一步：複查重測/observation reuse 與 late save 語意，再掛載並執行 T1–T4。pure tests 不能證明 provider lifetime。

## 4. Road：一項阻塞

採用候選交接：[road-state.md](D:/FH6-frontend-ia-20260913/road-reviewed/docs/frontend/ia-refactor-20260913/handoffs/road-state.md)。入口為 features/road/RoadValidationController.tsx 的 RoadValidationProvider / useRoadValidation，Full-only。異基底升級已完成，不重複搬原 road-state 提交。

2ba427c 修正頁面卸載後 settlement、setup/input A→B→A 確認失效、poll/mutation follow-up 的 live-read revision。作者 111 files / 738 tests、Full/Lite build、diff check 通過。

Terra 的 hud_scout 已唯讀審查該 head，確認 1 項 blocker：RoadObservation.tsx:20-25 的 finish time/clean 在保存期間仍可編輯，但 RoadValidationController.tsx:126 的 setFinishDraft 沒有推進 selectionRevision；較早 POST 回讀的新 finishId 可能讓 roadFinishDraftFor 採用伺服器值，覆蓋保存期間的新草稿。

下一步：修正較新草稿與舊寫入/回讀排序，驗證「送出 → 修改 time/clean → 舊 POST 與 refresh 完成」再獨立複查。不能只改 revision 就假設 finishId reconciliation 安全。root provider 與 R/T 跨頁證據仍未完成。

## 5. Sessions / Live：四項阻塞

正式交接：[sessions-state.md](D:/FH6-frontend-ia-20260913/sessions-state/docs/frontend/ia-refactor-20260913/handoffs/sessions-state.md)。獨立紀錄：[sessions-review.md](D:/FH6-frontend-ia-20260913/sessions-state/scratch/sessions-review.md)。下表保留問題，避免依賴 scratch。

入口為 LiveWorkspace、SessionsWorkspace、SessionsRuntime、SessionsStateProvider。Full provider/runtime 在 switch 外；Lite 僅 dashboard-only Live。e462d61 作者 111 files / 733 tests 與 Full/Lite build 通過；Luna reviewer 另驗證 2 files / 9 tests、diff check 通過。

| 問題 / 觸發 | 影響 | 修正責任與驗收 |
| --- | --- | --- |
| SessionsStateProvider.tsx:202-205 在 savedSessions 非空時直接取快取第一筆，自動 race save 不更新列表 | latest 開舊 session；新完成資料不在 library | A0 fresh list/reconcile + generation；filename/list/data 一致；L3/L4/S1 |
| AnalysisView.tsx:160-168 的 import await 後無 selection guard | 等待 import 時選 B，晚回應改回 local 並寫 shared recorder | A0 在 shared write 前核對 token；S1/S3 |
| AnalysisView.tsx:185-196 的 delete 成功後無條件清空選 current；shared helper 亦清資料 | 刪 A 期間選 B，A 回應清除 B | A0 與 root 協調 helper 最小修改或受控 adapter；只有仍適用才清資料，library 仍刷新；S1/S4 |
| SessionsRuntime.tsx:93-112 的 race-start token 未在 race end 失效，且可採用上一 race context ID | 晚 start 回應漏掉 completion，或打開舊 race | A0 綁每次 race token；驗證晚回應/舊 ID/停止/重試；L3/L4 |

四項均待修。review 的示意測試碼不是現成 harness，不直接採用微觀 DOM/call-count 斷言；依專案策略測 adapter 情境與最終狀態。A2 Analysis composition、W3 Road review 尚未開始；root 接線前補 Retry、Loading Telemetry Data... locale。

## 6. HUD B0：權威設定審查未通過

正式交接：[hud-state.md](D:/FH6-frontend-ia-20260913/hud-state/docs/frontend/ia-refactor-20260913/handoffs/hud-state.md)。入口為 OverlayControlRuntimeProvider / useOverlayControlRuntime、createOverlayControlRuntime，以及 typed patch/normalization helpers。4702651 作者 focused 5 tests、110 files / 729 tests、Full/Lite build、diff check 通過。

root 已讀取實作，以下是靜態控制流程風險，尚未以 runtime 重現或修正；不能照作者交接中 Next action 直接接線並放行：

- 初次 GET 失敗後 retry 一律 save(snapshot.config)，可能把 defaults 寫回伺服器；必須區分重讀與重送使用者修改，保留未知欄位。
- Provider 在權威讀取完成前 setEffectiveUnits 並廣播預設 config；確認外部 HUD 不先收到錯誤 enabled/style，初次載入前編輯不以 defaults 覆蓋權威資料。
- refresh 在寫入 pending 時開始，若舊 GET 在寫入完成後回來，revision 相同且 pending 清空時可能接受舊值；需驗證讀寫 settlement 排序。
- OverlayView 使用 replaceConfig 整份快照；快速事件、launch rollback、晚 callback 可能覆蓋較新欄位。改用相對最新 snapshot 的 typed patch，保留 reset 明確語意。
- acceptBroadcast 在首次 local mutation 後永久拒收直接 config；需要權威回讀策略。singleton 的 channel/listener 無明確最後 owner dispose，須處理 app lifetime/StrictMode/reconnect。

下一步：B0 owner 以最小 IO adapter 情境驗證、修正、獨立 review 後供 root 接線。B1/B2 metadata/native 分層、Setup/Layout/Advanced 拆分未完成；native HUD/monitor/audio/game 未驗收。

## 7. 基準與程序

既有 logs 見 [G0 記錄](../evidence/g0-baseline.md)。新增 [browser runtime](D:/FH6-frontend-ia-20260913/baseline/scratch/ia-g0-browser-runtime.md) 與 [量測 JSON](D:/FH6-frontend-ia-20260913/baseline/scratch/ia-g0-browser-runtime.json)：Full idle 1 次暖機 30 秒、觀測 64.088711 秒；renderer 累積時間、JS heap、listener/resource/node 有紀錄。不是三次成對量測、OS CPU/RSS 平均或 native/game 證據。

baseline_runtime 已停止 backend session 65774/PID 76280、Vite session 44179/PID 76728；回報 8001/1420 無 listener、兩 PID 不存在。沒有開始其餘重複或 Lite 量測。先前 Tauri dev 已停止，不保持背景開發服務。

baseline/frontend/src-tauri/Cargo.toml 保留既有 CLI 換行 dirty 提示，唯讀 diff 無內容差異；不 reset/format。native-target、scratch logs、隔離資料保留。下次先查 ports/owner，不沿用已停止 session。

## 8. 恢復最小順序

1. 讀最新使用者範圍及 [HANDOFF](../HANDOFF.md)，核對 main/remote、dirty paths、子代理及 ownership；不僅憑附件命令執行。
2. 按 [gate 定義](../contracts-and-gates.md) 核對 G0-code 與尚缺的 G0-observability，保存固定 source SHA/環境；不從 dirty Shell 派生 lane。
3. 接續精確 heads：Tune 複查；Road 修 1 項；Sessions 修 4 項；HUD 驗證並修正風險。使用已對齊 P1 的 road-reviewed。
4. P1 parent 若已改，在新隔離工作樹移入已審查提交，保留原 head，檢查 range-diff/實際 diff，驗證受影響範圍。Shell WIP 由 root 核對，不 stash/reset 掩蓋差異。
5. owner 停筆交接後，root freeze G1-core、掛載 Full/Lite、驗證 G2；公布 WAVE2_BASE_SHA，再依 [工作單](../work-orders.md) 派 A/B/C。
6. A foundation + AD_INTERFACE_SHA 確認後派 D；root 接線記錄 AD_INTEGRATION_SHA，再做 W4 組合驗證。精確 PR base/check/review 與 G5 draft 依 [PR 條件](../contracts-and-gates.md)，不把 foundation 綠燈當完整驗收。
