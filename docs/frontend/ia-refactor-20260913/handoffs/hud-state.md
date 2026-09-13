# HUD B0 Runtime Handoff

Task: W1/B0 HUD authoritative config and pending-write runtime
Status: handoff
Owner / Task ID / Model / Thinking: hud_scout / 未建立 / inherited / inherited
Worktree / Branch: `D:/FH6-frontend-ia-20260913/hud-state` / `codex/frontend-ia-hud-state-20260914`
Base SHA / Head SHA / Contract SHA: `fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9` / branch `HEAD` (exact SHA supplied with this handoff) / not-frozen
Write ownership / Transferred paths: `frontend/src/features/overlay_control/**` excluding `hudConfig.ts`; this handoff only.

## Changed

- `overlayControlRuntime.ts` provides the non-React app-session state machine.
  - Public exports: `createOverlayControlRuntime`, `normalizeHudRuntimeConfig`, `applyHudConfigPatch`, `HudConfigPatch`, `HudConfigRecord`, `OverlayControlRuntime`.
  - Nested `elements` and `units` patches merge instead of replacing siblings; unknown persisted fields are retained; S650 normalization remains at every config boundary.
  - Complete config snapshots POST in a serial queue. HTTP non-success and `{ success: false }` are failures, never saved success.
  - A read started before a local edit, a read while writes are pending, and all BroadcastChannel config payloads after the first local edit cannot roll config back. `retry()` resubmits the current desired snapshot.
- `OverlayControlRuntimeProvider.tsx` exposes `OverlayControlRuntimeProvider` and `useOverlayControlRuntime()` for Coordinator mounting outside Full/Lite workspace switching. It reads config on app-runtime mount, relays effective units, owns the config BroadcastChannel, and leaves external overlay window ownership unchanged.
- `OverlayView.tsx` now consumes the runtime config/save/refresh/retry APIs. Its existing page-local metadata remains page-local with mounted and author-generation guards. A compatibility wrapper creates the provider only until Coordinator mounts it at the app-session boundary; the module runtime lets queued writes survive page remount during that transition.
- `overlayControlRuntime.test.ts` covers nested/unknown/S650 patching, serialized rapid writes, slow GET and later Broadcast rollback protection, failed HTTP/retry, and a fresh authoritative enabled read.

## Coordinator integration required

Mount one `OverlayControlRuntimeProvider` inside the existing `AppProviders` tree and outside Full/Lite workspace conditionals. Do not duplicate it per workspace and do not move it into `OverlayView`. Once both app variants mount it, remove `OverlayView`'s compatibility wrapper in the Coordinator-owned integration change if desired.

The provider must remain below `SettingsProvider`, because it projects existing app units to the HUD BroadcastChannel. It intentionally does not own `useOverlayWebSocket`, `useTelemetry`, native invokes, renderer resources, backend schema, or Tauri windows.

## Contracts consumed / requested

- Consumed: existing `HudConfig`/`DEFAULT_HUD_CONFIG`, `normalizeS650HmiConfig`, `backendFetch`, and `SettingsContext` unit values.
- Requested: Coordinator records the actual root mount commit as `CONTRACT_SHA` before declaring G1/G2 complete.
- No locale additions. Existing `Retry Update` key is reused.

## Verification

- `cmd /c "pnpm -C frontend exec vitest run src/features/overlay_control/overlayControlRuntime.test.ts"` — exit 0; 5 tests passed.
- `cmd /c "pnpm -C frontend run test"` — exit 0; 110 files, 729 tests passed.
- `cmd /c "pnpm -C frontend run build"` — exit 0; TypeScript and Vite build passed.
- `git diff --check` — exit 0.

## Native / game evidence

not-run. The lane deliberately does not change Tauri, backend, or `hud_overlay`; native monitor/click-through/window behaviour still needs the Coordinator's Full/Lite native smoke and G5 evidence.

## Risks / Pending / Blocked by

- The current backend config API has no revision token. After the first local mutation the runtime rejects direct config BroadcastChannel adoption, because it cannot prove a delayed payload is newer. Explicit `refresh()` remains the authority-read path once no write is pending.
- This lane preserves the existing duplicate audio selection path and frontend reset semantics as required. Resolving either requires a separate backend/public-contract decision.
- B2 retains responsibility for capability mapping and Setup/Layout/Advanced JSX decomposition.

## Next action

Coordinator mounts the provider in the shared Full/Lite app-session boundary, records the exact integration SHA, then performs G2 remount/active-workspace acceptance. HUD B1/B2 may consume the exported runtime API without changing its persistence transport.

Last updated: 2026-09-14
