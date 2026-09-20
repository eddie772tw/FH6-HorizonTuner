# W4-0 candidate lock and acceptance ledger

> **W4-0 鎖定快照。** 初始 ledger 與 adapter inventory 保留原狀；後續 P7/P8 狀態見本文件 Post-lock 段及 [W4 候選入口](../README.md)。`P7-A may now start` 是當時下一步，並非目前工作指令。

日期：2026-09-20。狀態：`locked-baseline`。Owner：Coordinator/root。

本紀錄把 W4 的候選基線固定在目前 W2/W3 integration head，並保留最後實機驗收前的逐項狀態。`pass` 只表示本列所寫的證據範圍已觀察；browser-only 證據不延伸成 Tauri/native、真實 FH6、MoTeC、外部 HUD 或 G5 通過。沒有在本候選重新取得的舊 SHA 證據維持 `not-run`，避免把歷史結果誤當成 current-head proof。

## Candidate identity

| 欄位 | 值 |
| --- | --- |
| Integration source | `codex/frontend-ia-w2-integration-20260920` |
| Base SHA | `147981c3ea0d68f146e0b2400d147e2346d7930e` |
| W4 branch | `codex/frontend-ia-w4-20260920` |
| W4 candidate SHA at lock | `147981c3ea0d68f146e0b2400d147e2346d7930e` |
| Public contract freeze | `54165303f12c9598872905571f7162cc5f80effa` |
| Contract branch observed | `codex/frontend-ia-contracts-20260914` @ `9baeb1ec6f5edd14b61c6aa90944b1d9bb820623` |
| Working tree at lock | clean; no dirty paths |
| Environment | Windows; Node `v24.13.0`; pnpm `11.20.0`; browser-only for UI evidence |
| Locked at | `2026-09-20T11:58:41+08:00` Asia/Taipei |

The W4 worktree was created at `D:\FH6-frontend-ia-20260920\w4` from the exact integration head. Dependencies were installed with `pnpm install --frozen-lockfile` in this worktree so the gates below do not depend on another worktree's `node_modules`.

## Current-head verification

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm -C frontend exec tsc --noEmit` | pass | exit `0`; no diagnostics |
| `pnpm -C frontend run test` | pass | `125` files / `884` tests passed |
| `pnpm -C frontend run build` | pass | Full/Lite output; `772` modules transformed |
| `git diff --check` | pass | exit `0` |
| `git status --short --branch` | pass | clean W4 branch at lock |

## Acceptance ledger at W4-0

| ID | Result | Current evidence and limitation | Owner / next action |
| --- | --- | --- | --- |
| C1 | pass | W3 browser handoff opened the Full shell and observed Live/Tune/Sessions/HUD surfaces; no native startup proof. | Coordinator; rerun Full/Lite matrix in P7-C |
| C2 | not-run | Lite browser entry was not exercised on this candidate. | Coordinator; run Lite matrix in P7-C |
| C3 | not-run | Provider persistence across a complete workspace loop has no current-head mounted evidence. | Coordinator; collect state comparison in P7-B/C |
| C4 | pass | Full browser App Menu reached Updates and existing Data Out entry; dynamic port/native update launch not proven. | Coordinator; complete Full/Lite capability matrix |
| C5 | not-run | Backend-ready, dynamic port, StrictMode and theme first paint in Tauri are outside browser-only W4-0. | Final machine gate owner: Coordinator |
| L1 | not-run | Backend was disconnected during browser smoke; no live telemetry proof. | A/Coordinator; controlled fixture then real FH6 |
| L2 | not-run | No current-head launch-test interaction was executed. | A/Coordinator; browser and game gate |
| L3 | not-run | No successful race completion/latest readback was available. | A/Coordinator; success fixture and real FH6 |
| L4 | not-run | Slow/failure/intent race fixture not rerun at this candidate. | A/Coordinator; controlled delayed response |
| T1 | not-run | Current-head cross-workspace restore of formal Tune state not rerun. | Coordinator; P7-A adapter audit and browser loop |
| T2 | not-run | Developer Tune persistence/cross-mode loop not rerun. | Coordinator; P7-A |
| T3 | not-run | Current-head capture/save identity behavior lacks controlled mounted evidence. | Coordinator; P7-A then final FH6 |
| T4 | not-run | Restore compatibility tests exist in the suite, but current UI reentry evidence is missing. | Coordinator; P7-A and P8 |
| S1 | not-run | Sessions library was mounted, but backend-disconnected state prevented current/latest/saved success proof. | A/Coordinator; fixture readback |
| S2 | not-run | No current-head lap/compare/debrief data readback. | A/Coordinator; fixture and UI |
| S3 | not-run | MoTeC actions were not executed; external launch remains native-only. | A/Coordinator; browser import/export then native |
| S4 | not-run | Save/delete/reopen was not executed against an isolated fixture. | A/Coordinator; fixture lifecycle |
| R1 | not-run | Road review library/detail mounted, but no successful workflow document readback. | D/Coordinator; P7-A |
| R2 | not-run | No controlled Road start/record/stop run was executed. | D/Coordinator; final game gate |
| R3 | not-run | Decision action and document readback were not executed. | D/Coordinator; P7-A |
| R4 | not-run | Non-Road compatibility behavior was not rerun on this candidate. | D/Coordinator; P7-A |
| R5 | not-run | `reviewHistory` remains; removal decision is intentionally gated on R1/R3/R4 evidence. | Coordinator; P7-A |
| H1 | not-run | HUD page and tabs mounted; complete style/author/units/reset matrix was not exercised. | B/Coordinator; P7-C |
| H2 | not-run | Layout/Advanced controls were visible, but all legacy controls and persistence were not compared. | B/Coordinator; P7-C |
| H3 | not-run | Native monitor/window/audio behavior is excluded from browser-only W4. | Coordinator; final machine gate |
| H4 | not-run | Ordered patch/readback behavior was not exercised with a backend fixture. | B/Coordinator; P7-A/B |
| H5 | not-run | Page reentry was not measured with native overlay and pending writes. | B/Coordinator; P7-B and final machine gate |
| H6 | pass | Browser HUD surface remained a web surface; no claim of native launch was made. | B/Coordinator; add explicit degraded-state matrix |
| U1 | pass | Settings and Updates entry points were reachable in browser shell; focus/keyboard/Lite matrix pending. | C/Coordinator; P7-C |
| U2 | not-run | Full/Lite capability projection was not fully exercised on this candidate. | C/Coordinator; P7-C |
| U3 | not-run | Reload/restart persistence was not executed. | C/Coordinator; final machine gate |
| X1 | not-run | Historical browser observations are on earlier SHA; current candidate inventory has not been measured. | Coordinator; P7-B |
| X2 | not-run | Current candidate theme/keyboard/layering matrix has not been measured. | Coordinator; P7-C |
| X3 | not-run | No three-pair baseline/candidate measurement exists at W4-0. | Coordinator; P7-D and final machine gate |
| X4 | not-run | Final combination is intentionally deferred until P8. | Coordinator; P8 |

## Known compatibility inventory at lock

| Adapter or boundary | Current observation | W4 decision gate |
| --- | --- | --- |
| `reviewHistory` in `TuningView.tsx` / `TuneSessionProvider.tsx` | Still active as a legacy review entry. | Keep until R1/R3/R4/R5 pass on current candidate; then remove or register a named compatibility consumer. |
| `TuneSessionBoundary` | Still wraps formal and developer Tune views. | Inventory the formal Full owner and prove no second step owner before removing. |
| `RoadValidationBoundary` | Still wraps `RoadWorkflowView`. | Compare standalone compatibility entry with the formal Full provider before changing. |
| `currentStep` / `setCurrentStep` | Still used by Tune view and readiness navigation. | Preserve semantics until T1-T4 and provider-owner review complete. |
| Road/HUD translation fallback | New copy uses existing `t()` fallback. | Track locale keys separately; no functional catalog rewrite in W4. |

## W4-0 exit and next action

W4-0 exit criteria are satisfied: isolated W4 branch/worktree exists, candidate SHA and contract references are recorded, the acceptance ledger has every C/L/T/S/R/H/U/X item with an owner and next action, the exact candidate frontend gates pass, and the worktree is clean. P7-A may now start with a bounded adapter/state-owner inventory; no native, game, MoTeC, external HUD or final performance claim is implied by this lock.

## Post-lock W4 updates

The W4-0 table is the locked baseline snapshot. The following updates were obtained on the same W4 branch and are carried into P8:

| Area | Current result | Evidence |
| --- | --- | --- |
| P7-A provider owner | `pass` for the exercised Full browser path; redundant feature fallback boundaries removed; `reviewHistory` retained-gated | [w4-p7-a-adapter-register-20260920.md](./w4-p7-a-adapter-register-20260920.md), [browser evidence](../evidence/w4-p7-a-browser-20260920.md) |
| X1 browser lifecycle | `pass` for observed Full/Lite canvas and page-owned request cleanup; internal/native resources remain not-run | [w4-p7-b-browser-lifecycle-20260920.md](../evidence/w4-p7-b-browser-lifecycle-20260920.md) |
| X2 browser composition | `pass` for tested Full/Lite themes, responsive widths, keyboard/Escape and layering; native/Tauri remains not-run | [w4-p7-c-browser-ui-matrix-20260920.md](../evidence/w4-p7-c-browser-ui-matrix-20260920.md) |
| X3 | `not-run` final; protocol, fixed environment and placeholders prepared | [w4-p7-d-measurement-protocol-20260920.md](../evidence/w4-p7-d-measurement-protocol-20260920.md), [baseline JSON](../evidence/w4-p7-d-baseline-20260920.json) |
| X4/G5 | `not-run` until final machine gate | P8 handoff and final real-machine checklist |
