# W4-P8 candidate freeze and final pre-machine handoff

日期：2026-09-20。狀態：`candidate-pre-machine`。Owner：Coordinator/root。

This handoff freezes the W4 browser-only candidate before the final real-machine gate. The product code is unchanged after P7-A; P7-B/C/D and this P8 package synchronize evidence and boundaries around that code. The exact commit carrying this handoff is the W4 candidate SHA after the final amend/push.

## Candidate identity

| Field | Value |
| --- | --- |
| Branch | `codex/frontend-ia-w4-20260920` |
| Worktree | `D:\FH6-frontend-ia-20260920\w4` |
| W2/W3 integration parent | `147981c3ea0d68f146e0b2400d147e2346d7930e` |
| Product code candidate | `30fedc3833383dc646c724fb918b19830c52451f` |
| Contract freeze | `54165303f12c9598872905571f7162cc5f80effa` |
| Candidate docs/evidence | this handoff commit; exact local/remote SHA is recorded by the final gate below |
| Working tree at handoff | must be clean; no user or collaborator paths touched |

## Current verified behavior

- Full root owns `TuneSessionProvider`, `RoadValidationProvider`, `SessionsStateProvider` and `OverlayControlRuntimeProvider` in `frontend/src/App.tsx`. Formal Tune/Developer Tune/Road views no longer create feature-local fallback providers.
- `reviewHistory` remains a named compatibility adapter until current-head R1/R3/R4/R5 workflow-document and Return-to-Tune evidence is available.
- Full/Lite browser lifecycle evidence covers Live/Tune/Sessions/HUD reentry, canvas counts, page-owned request cessation, Settings/Updates/Theme Escape and focus behavior.
- Full/Lite browser UI evidence covers dark/light and default/modern/elegant themes, 390px and desktop overflow, App Menu layering and workspace reachability.
- X3 has a fixed protocol, machine metadata and explicit not-run slots; no final CPU/RSS/frame regression or improvement claim is made.

## P8 validation gate

Run at the exact candidate head and record output in the release review:

```text
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend run test
pnpm -C frontend run build
git diff --check
git status --short --branch
git rev-parse HEAD
git ls-remote origin refs/heads/codex/frontend-ia-w4-20260920
```

The frontend suite currently has 125 test files and 884 tests; the build must produce Full/Lite entries. Browser-only smoke must re-open Full Live/Tune/Sessions/HUD and Lite Live/HUD from the candidate Vite server and retain the backend-disconnected boundary. No Tauri/native frontend interaction is part of this gate.

## Evidence index

- [W4-0 acceptance ledger](./w4-0-acceptance-ledger-20260920.md)
- [P7-A adapter register](./w4-p7-a-adapter-register-20260920.md)
- [P7-A browser reentry](../evidence/w4-p7-a-browser-20260920.md)
- [P7-B X1 lifecycle](../evidence/w4-p7-b-browser-lifecycle-20260920.md)
- [P7-C X2 UI matrix](../evidence/w4-p7-c-browser-ui-matrix-20260920.md)
- [P7-D X3 protocol](../evidence/w4-p7-d-measurement-protocol-20260920.md)
- [P7-D baseline metadata](../evidence/w4-p7-d-baseline-20260920.json)
- [P8 exact candidate smoke](../evidence/w4-p8-browser-smoke-20260920.md)

## Final real-machine gate after W4

The following are deliberately left `not-run` and require the same candidate SHA:

1. Full/Lite Tauri startup, backend-ready/dynamic port, StrictMode, theme first paint and navigation (C1–C5).
2. Windows HUD monitor enumerate/move, launch/close, click-through, reload, audio and page reentry (H3/H5).
3. Real FH6 UDP/Live, race completion/latest, Tune capture across pages, Road start/record/finish and external MoTeC actions (L1–L3, S3, R2, T3).
4. Three paired baseline/candidate runs with the P7-D protocol, including WebView/backend/native HUD CPU/RSS/working set and frame/page metrics (X3).
5. Same-head Full/Lite/native smoke, README/architecture consistency and reviewer sign-off (X4/G5).

Missing device/game/native conditions keep the affected rows `not-run`; browser evidence, mock/config state and build success cannot substitute for them. The W4 branch is not merged into `main` by this handoff.
