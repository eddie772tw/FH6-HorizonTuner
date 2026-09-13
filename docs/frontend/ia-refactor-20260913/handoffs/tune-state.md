# W1 Tune session/capture lifetime handoff

Task: W1 Tune session/capture lifetime

Status: done

Owner: `tune_final_review`

Branch: `codex/frontend-ia-tune-state-20260914`

Base: `fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9`（P1 contracts merge）

Scope: `frontend/src/features/tuning/**`，以及本 handoff。沒有修改 Shell、AppProviders、road、context、hooks、services、formula、backend、schema、locale、設定或 shared docs。

## Coordinator 接線 API

Coordinator 在既有 `AppProviders` 下方、Full workspace switch 上方單次掛載：

```tsx
<TuneSessionProvider>
  <FullWorkspaceSwitch />
</TuneSessionProvider>
```

從 `frontend/src/features/tuning/TuneSessionProvider.tsx` 匯入 `TuneSessionProvider`。Lite 不得掛載它。`TuningView` 和 `TuningViewDev` 已在沒有外層 Provider 時使用 `TuneSessionBoundary` 建立暫時 fallback，讓目前 root 編譯與舊 mount 方式可用；Coordinator 接線後兩者會使用同一個長駐 Provider。

`currentStep` / `setCurrentStep` 保留為短期 source compatibility；Provider 是正式與 Developer step 的權威。兩個 Tune view 的 dead `setActiveTab` prop 已移除。reviewHistory 仍保留在 Tune view，沒有在本 W1 透過 `onOpenSessions` 改為 Sessions 導覽，交由 W3 處理。

## C2 狀態與資源 owner

| 狀態或資源 | owner / 策略 |
| --- | --- |
| 正式 Tune step | `workflow.step`；讀取既有 `tuning-workflow-state` v1/v2/v3，僅以既有 v3 `{ schema, step }` 寫回。 |
| goal、season、reviewHistory | `workflow` session memory；沒有新增 persistence schema。 |
| Developer step 與完整輸入 | `developer`：goal、surface、top speed、前後 ride frequency、前後 damping，以及 capture view open state。 |
| engine archive selected / reuse | `engine`，由原有 `useEngineMeasurementArchive` 置於 Provider；engine archive schema/key 不變。 |
| pending engine save | `engine.pendingSave`；save/reuse 回應同時比對 archive generation 和 Tune identity generation。 |
| 正式 EngineDataStep 的未保存量測 | `engineMeasurement`：measurement state、phase、auto-finish、ready snapshot、frame buffer/count。離頁不停止 decoded telemetry 訂閱；UI 5 Hz timer 只屬頁面。 |
| Developer raw capture 的未保存資料 | `capture`：metadata、status、finished capture、active frame buffer/count；離頁不停止必要 decoded telemetry 訂閱。 |
| unit drawer | `TuningView` local UI state，可隨頁面卸載關閉。 |

`TuningMeasurementStep` 與 `TuningTelemetryCaptureView` 已改為消費 session runtime，沒有只把父層 state 搬走而遺失這兩個元件原本自己的 buffer、metadata、paused/complete/ready snapshot 或 subscription。

## Identity 與 async 規則

`TuneSessionIdentity` 是 `carId`、最近一次已確認賽事的 PI/class 與 `profileKey`。賽事結束時保留最後已確認 PI/class，避免把結束狀態誤判成新車；下一個有效賽事 frame 才能更新它。`profileKey` 沿用既有 `engineDependencyKey`，只含 drivetrain、induction、maxHp、maxTorque；輪胎與懸吊改動不會錯誤使 engine observation 失效，符合原有 engine archive contract。

車輛、PI/class 或 profileKey 改變會遞增 generation、失效 selected engine observation、阻止舊 measurement 完成，並使 raw capture 標示 `identity-changed`。Engine archive 的 POST/save 與 reuse readback 在回應後再次檢查 generation，所以晚回應不能寫入新 identity 的 UI。已送往 backend 的舊 POST 可能仍是 durable server-side 寫入，但不會成為新 identity 的 selected observation。

沿用原 `TuningView` 的額外 live gate：已選 observation 在遊戲中仍須匹配 car、PI、class 與 `EngineMaxRpm`；同車同 PI/class 但 redline 變更時立即失效，不能拿舊的 peak RPM 計算 gearing。這不變更 engine dependency key、archive schema 或 persistence key。

## Changed

- `frontend/src/features/tuning/TuneSessionProvider.tsx`
- `frontend/src/features/tuning/tuneSessionController.ts`
- `frontend/src/features/tuning/tuneSessionController.test.ts`
- `frontend/src/features/tuning/useEngineMeasurementArchive.ts`
- `frontend/src/features/tuning/TuningView.tsx`
- `frontend/src/features/tuning/TuningView_dev.tsx`
- `frontend/src/features/tuning/components/EngineDataStep.tsx`
- `frontend/src/features/tuning/components/TuningMeasurementStep.tsx`
- `frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx`

## Verification

- Baseline: `cmd /c "pnpm -C frontend run test"` — 108 files / 719 tests passed.
- Baseline: `cmd /c "pnpm -C frontend run build"` — passed; generated both Full and Lite entries.
- Targeted controller test: `cmd /c "pnpm -C frontend exec vitest run src/features/tuning/tuneSessionController.test.ts"` — 1 file / 4 tests passed. This exercises asynchronous stale-result rejection plus car/PI/profile identity transitions.
- Candidate (P1 + W1): `cmd /c "pnpm -C frontend run test"` — 110 files / 728 tests passed.
- Candidate (P1 + W1): `cmd /c "pnpm -C frontend run build"` — passed; generated both Full and Lite entries.
- `git diff --check` — passed.

## Not tested / next action

No real game, Tauri Full/Lite smoke, backend save race, or CPU/RSS measurement was run. The Provider must first be mounted by the Coordinator in the Full path before Tune → Sessions/HUD → Tune mount/unmount evidence can be collected. New English UI strings used for capture invalidation/continuation and `Saving engine data…` remain feature keys; locale ownership stays with Coordinator.

## Follow-up: measurement attempt lifecycle (2026-09-14)

- `Collect driving data again` 現在呼叫 session restart，而不是只清除 archive selection：新 attempt 會重建 measurement state、frame buffer、ready snapshot 與 auto-finish，並讓任何 pending engine save 的 archive generation 過期。
- identity/profile 首次 hydration 在 measurement 尚為 `idle` 時保留為 idle；已開始、暫停、完成或已失效的 attempt 仍會依 identity change 失效，避免混用資料。
- save completion 以 archive generation、Tune identity generation 與 dependency key 三者核對。重測或換車後才抵達的成功 response 可留在 server，但不會重新選取舊 observation。
- 更新兩段過時文案：切換 Tune step 時資料在 app session 內保留；只有重啟 collection 或關閉 app 前才需要 export。locale 仍由 Coordinator 寫入，請補下列英文 key 的翻譯：
  - `The observation could not be saved. Retry Continue after the error; collected frames remain available while this app session is open.`
  - `Decoded frames and the measured summary are saved together when you continue. Collection is limited to 30,000 frames. Collected frames remain available while you switch Tune steps; export them before restarting collection or closing the app.`

Verification for this follow-up (before commit):

- `cmd /c "pnpm -C frontend exec vitest run src/features/tuning/tuneSessionController.test.ts"` — 1 file / 7 tests passed.
- `cmd /c "pnpm -C frontend run test"` — 110 files / 731 tests passed.
- `cmd /c "pnpm -C frontend run build"` — passed; Full and Lite entries built.
- `git diff --check` — passed after final handoff edit.

## Follow-up: Tune P2 fixes (2026-09-14)

Task: Tune P2 follow-up fixes
Status: done
Owner: `tune_final_review`
Branch: `codex/frontend-ia-tune-state-20260914`
Scope: `frontend/src/features/tuning/**` and this handoff only
Changed: `TuneSessionProvider.tsx`, `TuningView.tsx`, `components/TuningMeasurementStep.tsx`, `tuneSessionController.ts`, `tuneSessionController.test.ts`, `tuningWorkflow.ts`, `tuningWorkflow.test.ts`
Commit: `b0aeac9` (`fix(tuning): preserve session evidence across follow-up collection`)
Pending: None within this Tune ownership
Blocked by: None

The Step 1 edit path now applies changes to the full `CarParamsContext` profile, while the provider's calculation snapshot continues to exclude background dyno fields. Additional measurement can finish from the 30,000-frame cap pause when a ready snapshot is retained, so the cap no longer traps a valid optional collection. The first complete live PI/class hydration preserves an idle reused observation generation; the existing live gate still rejects mismatched car, PI, class, or `EngineMaxRpm`.

Verification:

- `cmd /c "pnpm -C frontend exec vitest run src/features/tuning/tuneSessionController.test.ts src/features/tuning/tuningWorkflow.test.ts"` — 2 files / 20 tests passed.
- `cmd /c "pnpm -C frontend run test"` — 110 files / 734 tests passed.
- `cmd /c "pnpm -C frontend run build"` — passed; Full and Lite entries built.
- `git diff --check` — passed.

Limits: no real game, Tauri Full/Lite smoke, backend save-race, CPU/RSS, or cross-page Shell runtime evidence. Provider root mounting remains the Coordinator's separate follow-up.
Next action: Coordinator may consume commit `b0aeac9`; no push or PR was created.
Last updated: 2026-09-14
