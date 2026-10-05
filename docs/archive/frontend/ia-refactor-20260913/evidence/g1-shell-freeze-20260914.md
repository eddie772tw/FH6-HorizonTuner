# G1-core 凍結紀錄

日期：2026-09-14。Coordinator：IA Coordinator as Codex。狀態：**code contract frozen**；G2 仍為 partial。

- `BASE_SHA`：`373c0b81add4b80786617c1b1358ce22ca78944d`（state-base，已推送）。
- `CONTRACT_SHA`：`54165303f12c9598872905571f7162cc5f80effa`（已推送；此 SHA 凍結公開 producer/consumer API）。
- `IMPLEMENTATION_SOURCE_SHA`：`2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`，只修改 `frontend/src/context/TelemetryRecorderContext.tsx` blob `4b53495569904fb95a19d6195037834f3f8f14ca` 的重入輪詢；不改 public contract。
- [PR #345](https://github.com/eddie772tw/FH6-HorizonTuner/pull/345) 為 draft，基底 `codex/frontend-ia-state-base-20260914`；凍結公開介面或新增內部 implementation source 都不等於此 PR 已可合併或 G2 通過。

## 04:00 交接契約修訂

c5e7fdf 是上一版 freeze，之後發現 race A 已交給 Shell、第二段 preflight 尚在途時，B 未使 A 失效。[race handoff 修正](https://github.com/eddie772tw/FH6-HorizonTuner/blob/54165303f12c9598872905571f7162cc5f80effa/docs/frontend/ia-refactor-20260913/evidence/g2-race-handoff-fix-20260914.md) 已重現並修正；新版 `WorkspaceRuntimeProps.onOpenSessions` / `SessionsRuntimeProps.onOpenSessions` 增加可選 `isRequestCurrent?: () => boolean`，`RaceCompletionLifecycle.onCompleted` 提供綁定 race/token/generation 的 guard。Runtime 的 Live/pending、Shell prepare/selection/navigation/Retry 全部傳遞與核對；一般 WorkspaceProps 與 SessionIntent 格式不變。

公開 contract 候選的 119 files／794 frontend tests、Full/Lite build、staged whitespace 與相對連結檢查通過；最新 2cb controlled delivery 另記 334 backend tests／8 modules、Ruff 214 files 與 version `11.45.17`。Terra 獨立 review 無 P1/P2；另一 Terra 回歸涵蓋 list/samples/refresh 交接競爭及 dispose，root 補相異/相同 identity retry。`2cb2983` 不重登記 CONTRACT_SHA，因 public API 沒有變動。原 shell 工作樹仍固定 c5，不能當作 2cb native 程序。

## Producer / consumer 核對

| 已存在的 export | 實際 consumer | 凍結的責任 | 結果 |
| --- | --- | --- | --- |
| `app/workspaceManifest.ts` 的 WorkspaceId/AppVariant/AppCapabilities/AppSurface/AppIntent/SessionIntent | AppShell、AppHeader、LiveWorkspace、SessionsStateProvider | 純 manifest 與能力；Full 四區、Lite 兩區；analysis filename 與 Road workflowId 分離 | pass：純測試、Luna consumer review、Terra 最終整合 review |
| `app/AppShell.tsx` 的 AppShell/WorkspaceRegistry/WorkspaceProps | App.tsx、LiteApp.tsx、commonWorkspaces | Shell 不持有 feature step；lazy registry 固定；只有 active workspace 掛載；global runtime 存活 | pass：原始碼/跨頁/能力核對；原生另屬 G2 |
| `features/tuning/TuneSessionProvider.tsx` 的 TuneSessionProvider/useTuneSession | App.tsx、TuningView、TuningView_dev | 正式與 Developer 分開草稿/step；decoded capture、measurement 與 pending save 歸 provider；identity token 與 terminal publish | pass：純 state/restore/ordering tests、受控量測/保存/identity/往返；完整後期矩陣另列 |
| `features/road/RoadValidationController.tsx` 的 RoadValidationProvider/useRoadValidation | App.tsx、RoadWorkflowView、RoadRunPanel、RoadResults | workflow/prepare/candidate/finish/confirmation/operation identity；頁卸載不停止 backend run | pass：controller/operation tests、獨立 review、受控 baseline/run/stop/finish 草稿往返 |
| `features/sessions/SessionsStateProvider.tsx` 的 SessionsStateProvider/useSessionsState | FullWorkspaceShell、AnalysisView | applySessionIntent 回傳 Promise<boolean>；先 preflight exact saved header/nonempty samples，較新 selection/navigation 優先；普通重入保留 | pass：純 IO/ordering、Luna review、latest failure/retry 與 exact completion UI |
| `features/sessions/SessionsRuntime.tsx` 的 SessionsRuntime | FullWorkspaceShell，Lite 不掛載 | authoritative recording status＋identity、有界 completion retry；Live 自動開啟，其他工作區明確入口 | pass：race/poller tests、Terra review、`2cb2983` mounted A/B 第二段交接；C5/H5 native 仍屬 G2 |
| `features/overlay_control/OverlayControlRuntimeProvider.tsx` 的 OverlayControlRuntimeProvider/useOverlayControlRuntime | Full/Lite root、OverlayView、units bridge | 權威 initial GET、typed nested patch、serial saves、late response guards、app-session channel | pass：IO race tests、Terra review、隔離 backend readback；native overlay 與 channel 計數完整矩陣另列 |

## 驗證及 owner transfer

上一版 c5 產品修改後 118 files／788 tests、Full/Lite build、staged whitespace check 通過。Luna 先行 consumer review、Terra race/measurement/Road snapshot reviews 與最後 bounded integration review 均無阻塞 finding。這是 c5 歷史驗證；新增 race handoff 產品修改與新版證據以上方 04:00 修訂為準。

此表的 `pass` 指 producer/consumer/code contract 核對，不能用來填掉 acceptance matrix 的 native 或 G5 證據。來源與實際操作見 `2cb2983` 的 [mounted reentry evidence](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md)；Full/Lite/sidecar 產物與目前的 Full AX 局部操作見[原生產物與視窗紀錄](g2-native-artifacts-20260914.md)，c5 Shell 交接與 browser evidence 僅保留歷史場景。

各產品作者已停寫，Coordinator 仍持有 shared wiring/locale/document 權限。尚不發出 WAVE2_BASE_SHA；G2 通過後才移交 A/B/C。A_FOUNDATION_SHA、AD_INTERFACE_SHA、AD_INTEGRATION_SHA 均屬未來 A-D review 接點，不用不存在的 export 阻塞或冒充本次 G1-core。

舊 browser Vite/backend/sender 測試服務已停止；固定 `2cb2983` 的 Full/Lite/sidecar 已建置。先前 c5 原生觀察是歷史限制；Windows native 介面已初始化，root 保留已啟動的 Full 與 owned backend 等待使用者帶到前景。依[原生產物與視窗紀錄](g2-native-artifacts-20260914.md)，AX 可讀 backend 與四個入口，但前景啟用兩次失敗。C5/H5 尚未取得操作結果，不能以 build、AX 局部成功或本表的 contract pass 取代 native 驗收。
