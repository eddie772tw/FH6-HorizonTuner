# W4-P7-A adapter and state-owner register

> **P7-A 實作時點 register。** 下方 pending-browser 敘述保留初次交付時序；其後已取得 [有限 Full browser reentry](../evidence/w4-p7-a-browser-20260920.md) 與 [P8 smoke](../evidence/w4-p8-browser-smoke-20260920.md)。成功 backend/R1–R5/T1–T4、native 與 game 缺項仍依 [現行入口](../README.md) 保留，`reviewHistory` 仍為 `retained-gated`。

日期：2026-09-20。Status：`implemented`。Owner：Coordinator/root。

本階段只處理已證實由 Full `App` root 持有的 provider boundary。`App.tsx` 在 Full entry 以單一順序掛載 `TuneSessionProvider`、`RoadValidationProvider`、`SessionsStateProvider`；`TuningWorkspace`、`TuningView`、`TuningView_dev`、`SetupVerificationStep` 與 `SessionsWorkspaceBridge` 都在這個 root 下。Lite entry 不註冊 Tune/Road workspace，因此不需要透過 feature wrapper 自動建立第二份 state。

## Adapter register

| Adapter / path | Previous behavior | Current decision | Evidence and removal condition |
| --- | --- | --- | --- |
| `TuneSessionBoundary` in `TuningView.tsx` | Feature page could create a local provider when rendered without the app root. | `removed` from formal Tune view. | `frontend/src/App.tsx` is the only production Full entry and owns the provider; typecheck/build and the existing tuning workflow/identity tests pass on candidate. A standalone story/test that renders `TuningView` without `App` would now need to mount the documented provider explicitly. |
| `TuneSessionBoundary` in `TuningView_dev.tsx` | Developer Tune could create a second provider under the same Full root. | `removed` from Developer Tune view. | Same single-owner root as formal Tune; developer state remains a separate namespace inside the one `TuneSessionProvider`. No solver or persistence key changed. |
| `RoadValidationBoundary` in `RoadWorkflowView.tsx` | Road view could create a local controller when no provider was found. | `removed` from the production Road view. | `RoadValidationProvider` is mounted once in `App.tsx`; `SessionsWorkspaceBridge` and all Road review/run consumers use that context. Existing road state/IO tests and build pass. |
| `reviewHistory` in `TuneSessionProvider.tsx` and `TuningView.tsx` | Legacy Tune button opens the old Road workflow entry. | `retained-gated` | R1/R3/R4/R5 current-head success and return-to-Tune evidence are not yet available. Do not remove before Sessions review can read old workflow documents/actions and preserve an unfinished workflow. |
| `currentStep` / local setter in `TuningView.tsx` | Formal Tune renders readiness-gated steps from the session workflow. | `retained-owner` | The provider's `workflow.step` and `workflow.setStep` remain the only state owner. The local helper only resolves the existing functional updater shape and is not a second state. T1-T4 still require browser reentry evidence. |
| `currentStep` shown by `DevOutputPanel` | Developer output displays its own step. | `retained-owner` | It consumes `session.developer.step`; formal workflow step is not reused. T2 remains pending browser evidence. |

## Current owner map

| State | Owner | Consumers | Lifetime rule |
| --- | --- | --- | --- |
| Formal Tune step/goal/season/review flag | `TuneSessionProvider` | `TuningView`, `SetupVerificationStep`, tuning child components | Full app session; no feature-local provider |
| Developer Tune step and inputs | `TuneSessionProvider.developer` | `TuningView_dev`, `DevInputPanel`, `DevOutputPanel` | Full app session; separate from formal step |
| Engine measurement/capture identity | `TuneSessionProvider` plus its archive/controller hooks | engine and capture children | Provider lifetime; identity guards invalidate stale callbacks |
| Road selection/drafts/active run/operations | `RoadValidationProvider` | `RoadWorkflowView`, `RoadRunPanel`, `useRoadReview`, `SessionsWorkspaceBridge` | Full app session; operation settlement remains controller-owned |
| Sessions analysis selection and Road workflow intent | `SessionsStateProvider` | `SessionsWorkspace`, `SessionsWorkspaceBridge`, `AppShell` | Full app session; intent generation guards late reads |

## Verification

The following current candidate checks were run after the boundary removal:

- `pnpm -C frontend exec tsc --noEmit` — pass.
- `pnpm -C frontend run test` — pass; 125 files / 884 tests.
- `pnpm -C frontend run build` — pass; Full/Lite outputs, 772 modules transformed.
- `git diff --check` — pass.

Browser-only R/T evidence is still pending. The removal is limited to redundant provider fallback wrappers; it does not change the Road controller, backend schema, tuning formulas, persistence keys, or `reviewHistory` behavior.

## Handoff

Next stage may run the browser lifecycle and UI matrix against this candidate. If a production path is found outside `App.tsx` that intentionally renders a Tune/Road feature without the root provider, stop and add an explicit provider-owned entry or restore a named compatibility boundary; do not silently recreate a second owner.

