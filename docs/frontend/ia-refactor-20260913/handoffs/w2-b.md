# W2-B B1 handoff

## Scope and ownership

- Base: `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`
- Branch: `codex/frontend-ia-w2-b-20260919`
- B1 keeps `hudConfig.ts`, `s650/config.ts`, and `classic_jdm/config.ts` read-only. Their schemas, defaults, and normalizers were not changed.
- Existing `OverlayView` remains the consumer of all current HUD controls, including Classic JDM and S650 paths. It now consumes the typed `useHudController` facade and renders through `HudWorkspace`.
- B2 panel files were not created. The three panel paths remain pending the B1 to B2 transfer decision and lease.

## Changed files

- `frontend/src/features/overlay_control/OverlayView.tsx`
- `frontend/src/features/overlay_control/HudWorkspace.tsx`
- `frontend/src/features/overlay_control/HudWorkspace.css`
- `frontend/src/features/overlay_control/hudPanelTypes.ts`
- `frontend/src/features/overlay_control/hudNativeAdapter.ts`
- `frontend/src/features/overlay_control/hudNativeAdapter.test.ts`
- `frontend/src/features/overlay_control/hudCapabilities.ts`
- `frontend/src/features/overlay_control/hudCapabilities.test.ts`
- `frontend/src/features/overlay_control/hudMetadata.ts`
- `frontend/src/features/overlay_control/hudMetadata.test.ts`
- `frontend/src/features/overlay_control/useHudController.ts`
- `frontend/src/features/overlay_control/useHudMetadata.ts`

## B1 boundary

`HudNativeAdapter` maps the existing native commands (`get_available_monitors`, `move_hud_to_monitor`, `toggle_hud_window`, `set_hud_click_through`, and `reload_hud_window`) to typed results. Web sessions return `unsupported`; malformed native monitor data returns `degraded`; rejected or timed-out commands return `error`. A persisted `enabled` value is never treated as native command success.

`hudCapabilities.ts` keeps persisted configuration available in web mode while reporting native window, monitor, click-through, and reload capabilities independently. Classic JDM and S650 controls remain available through the existing config contract. `hudMetadata.ts` and `useHudMetadata.ts` isolate style and author metadata IO with request generation protection against stale responses.

`HudWorkspace` is a narrow children-based composition root. It carries the complete existing `OverlayView` content and leaves future panel props in `hudPanelTypes.ts` without creating B2 panel files.

## Validation

- Browser evidence: Vite web app at `http://localhost:1420/`; selecting the HUD workspace rendered `HUD Control Panel`, all existing settings sections, `Launch HUD Overlay`, the style list containing `Ford Mustang HMI` (S650) and `Classic JDM Arcade`, and the existing backend-disconnected/error state. This was browser-only; no native bridge was present.
- `cmd /c "pnpm -C frontend run test"` — pass, 123 test files / 867 tests, validation from base `ee0f7bb9f5e607a682a5136bb0785deb580e51fb` plus B1 worktree changes.
- `cmd /c "pnpm -C frontend run build"` — pass.
- `git diff --check` — pass; Git reported only the existing CRLF normalization warning for `OverlayView.tsx`.
- Native H3/H5: not-run, as required for this B1 web preparation; not blocking.

