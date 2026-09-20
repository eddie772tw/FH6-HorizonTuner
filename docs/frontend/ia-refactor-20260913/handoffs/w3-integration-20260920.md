# W3 coordinator integration handoff

## Delivery identity

- Integration branch: `codex/frontend-ia-w2-integration-20260920`
- A foundation remote head: `c281f504de27bc387d1d4a4570d12ef0eec06eb0`
- B1 foundation remote head: `8442bffdb9393e36a5139b751b723c220a461a08`
- C settings remote head: `6eb93a781f1c9a00d3a3d40815dae1d36255307e`
- AD interface freeze: `b780e0c0000a6c7ae613369e38eaa6715a7355f8`
- B2 panels and composition: `2942b3c83e1c6ab29669e9e233c69561647e9a7e`
- D Road review final handoff: `5cfe75e0e977d5078f253277e0bda9f8d9fcac98` (product code `1f6c3abf6aa78353fb89a7045025a93396dc014c`)
- Coordinator bridge commit: `a9d4503a0b2fe6ea73f56932f2fb4692d35fcbda` (verify with `git rev-parse HEAD` if a commit link is needed)
- All named commits are pushed to their corresponding remote branches; no main merge or PR was created.

## Coordinator-owned bridge

`frontend/src/app/SessionsWorkspaceBridge.tsx` composes the D Road review library and detail view into the A-owned `SessionsWorkspace` slot. It reads the canonical `roadWorkflowId` from `SessionsStateProvider`, routes library selection through `applySessionIntent({ kind: 'road', workflowId })`, and only calls `RoadValidationController.selectWorkflow` plus `onOpenTune` after the explicit `Return to Tune` action. An empty selection remains visible as an accessible review prompt; backend errors stay rendered by the owned Road components.

`frontend/src/App.tsx` now registers this bridge for the `sessions` workspace while preserving the existing `WorkspaceProps` boundary.

## Browser-only integration evidence

- Temporary Vite server: `http://127.0.0.1:1424/`, integration branch, 2026-09-20 Asia/Taipei.
- Closed the Data Out guide, opened Sessions, and observed `Post-Race Debrief & MoTeC Bridge`, `Saved Road workflows`, the backend-disconnected `Failed to fetch` state, and the empty review prompt. This confirms the coordinator slot is mounted in the real Full browser shell; no backend success is claimed.
- Opened HUD and exercised Setup, Layout, and Advanced tabs. Layout showed offset/position, scale, and telemetry element controls; Advanced showed style, speedometer, audio, and performance controls.
- Opened App Menu → Updates and observed the Updates dialog with Software Updates (OTA), the auto-check checkbox, endpoint, and Check for Updates action.
- Browser actions were limited to the local web frontend. Tauri/native interaction, real game/device, backend save, download, and pixel-equivalence proof were not run.

## Validation

- `pnpm -C frontend exec tsc --noEmit`: passed.
- `pnpm -C frontend run test`: 125 files / 884 tests passed.
- `pnpm -C frontend run build`: passed; Full and Lite Vite outputs generated, 772 modules transformed.
- `git diff --check`: passed; only the existing LF/CRLF normalization warning for touched TypeScript files.

## Remaining boundaries

- The old `reviewHistory` adapter remains untouched pending the later cleanup gate.
- New Road/HUD copy uses the existing `t()` fallback path; locale catalog expansion remains a separate coordinator-owned maintenance item.
- Real backend/game/native validation is outside this browser-only objective.
