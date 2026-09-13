# G1-core 凍結紀錄

日期：2026-09-14。Coordinator：IA Coordinator as Codex。狀態：**code contract frozen**；G2 仍為 partial。

- `BASE_SHA`：`373c0b81add4b80786617c1b1358ce22ca78944d`（state-base，已推送）。
- `CONTRACT_SHA`／Shell source candidate：`c5e7fdfb82c4b1f792fd76be4cb796059337bcfc`（已推送，工作樹乾淨）。
- [PR #345](https://github.com/eddie772tw/FH6-HorizonTuner/pull/345) 為 draft，基底 `codex/frontend-ia-state-base-20260914`；凍結公開介面不等於此 PR 已可合併或 G2 通過。

## Producer / consumer 核對

| 已存在的 export | 實際 consumer | 凍結的責任 | 結果 |
| --- | --- | --- | --- |
| `app/workspaceManifest.ts` 的 WorkspaceId/AppVariant/AppCapabilities/AppSurface/AppIntent/SessionIntent | AppShell、AppHeader、LiveWorkspace、SessionsStateProvider | 純 manifest 與能力；Full 四區、Lite 兩區；analysis filename 與 Road workflowId 分離 | pass：純測試、Luna consumer review、Terra 最終整合 review |
| `app/AppShell.tsx` 的 AppShell/WorkspaceRegistry/WorkspaceProps | App.tsx、LiteApp.tsx、commonWorkspaces | Shell 不持有 feature step；lazy registry 固定；只有 active workspace 掛載；global runtime 存活 | pass：原始碼/跨頁/能力核對；原生另屬 G2 |
| `features/tuning/TuneSessionProvider.tsx` 的 TuneSessionProvider/useTuneSession | App.tsx、TuningView、TuningView_dev | 正式與 Developer 分開草稿/step；decoded capture、measurement 與 pending save 歸 provider；identity token 與 terminal publish | pass：純 state/restore/ordering tests、受控量測/保存/identity/往返；完整後期矩陣另列 |
| `features/road/RoadValidationController.tsx` 的 RoadValidationProvider/useRoadValidation | App.tsx、RoadWorkflowView、RoadRunPanel、RoadResults | workflow/prepare/candidate/finish/confirmation/operation identity；頁卸載不停止 backend run | pass：controller/operation tests、獨立 review、受控 baseline/run/stop/finish 草稿往返 |
| `features/sessions/SessionsStateProvider.tsx` 的 SessionsStateProvider/useSessionsState | FullWorkspaceShell、AnalysisView | applySessionIntent 回傳 Promise<boolean>；先 preflight exact saved header/nonempty samples，較新 selection/navigation 優先；普通重入保留 | pass：純 IO/ordering、Luna review、latest failure/retry 與 exact completion UI |
| `features/sessions/SessionsRuntime.tsx` 的 SessionsRuntime | FullWorkspaceShell，Lite 不掛載 | authoritative recording status＋identity、有界 completion retry；Live 自動開啟，其他工作區明確入口 | pass：race/poller tests、Terra review、Live/HUD completion；更多 mounted race competition 仍屬 G2 |
| `features/overlay_control/OverlayControlRuntimeProvider.tsx` 的 OverlayControlRuntimeProvider/useOverlayControlRuntime | Full/Lite root、OverlayView、units bridge | 權威 initial GET、typed nested patch、serial saves、late response guards、app-session channel | pass：IO race tests、Terra review、隔離 backend readback；native overlay 與 channel 計數完整矩陣另列 |

## 驗證及 owner transfer

最終產品修改後 118 files／788 tests、Full/Lite build、staged whitespace check 通過。Luna 先行 consumer review、Terra race/measurement/Road snapshot reviews 與最後 bounded integration review 均無阻塞 finding。最後 review 後只提交原有已審查產品內容及文件，未再改產品。

此表的 `pass` 指 producer/consumer/code contract 核對，不能用來填掉 acceptance matrix 的 native、完整 mounted race/identity/channel 或 G5 證據。來源與實際操作見固定候選的 [Shell 交接](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md) 與 [browser evidence](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/evidence/g2-shell-browser-20260914.md)。

各產品作者已停寫，Coordinator 仍持有 shared wiring/locale/document 權限。尚不發出 WAVE2_BASE_SHA；G2 通過後才移交 A/B/C。A_FOUNDATION_SHA、AD_INTERFACE_SHA、AD_INTEGRATION_SHA 均屬未來 A-D review 接點，不用不存在的 export 阻塞或冒充本次 G1-core。

候選固定後由 Coordinator 停止本輪 Vite/backend 自有終端，TCP 1420/8001 與 UDP 8000 listener 均為 0；已請使用者觀察 [原生 C5/H5 程序](https://github.com/eddie772tw/FH6-HorizonTuner/blob/c5e7fdfb82c4b1f792fd76be4cb796059337bcfc/docs/frontend/ia-refactor-20260913/handoffs/g2-native-20260914.md)，目前尚未取得回報。
