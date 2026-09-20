# W4-P8 exact candidate smoke and gate record

Date: 2026-09-20 Asia/Taipei

## Candidate and commands

The smoke ran from W4 branch `codex/frontend-ia-w4-20260920` with the candidate label visible in both browser entries. The W4 Vite process was started from `D:\FH6-frontend-ia-20260920\w4` at `http://127.0.0.1:1424/` and stopped after the run; port 1424 was verified to have no listener. The final P8 changes are documentation-only after the product-code candidate, so the displayed short SHA can change on the final docs commit without changing the tested bundle.

| Check | Result |
| --- | --- |
| `pnpm -C frontend exec tsc --noEmit` | pass, exit 0 |
| `pnpm -C frontend run test` | pass, 125 files / 884 tests |
| `pnpm -C frontend run build` | pass, Full/Lite entries, 772 modules transformed |
| Markdown relative-link check | pass, `DOC_LINKS_OK` |
| `git diff --check` | pass, clean after the evidence was staged |
| `git status --short --branch` | clean before push |

## Browser smoke

| Entry | Steps | Observed |
| --- | --- | --- |
| Full | Live → Tune → Sessions → HUD → Live | All surfaces rendered; Tune showed Tuning Wizard; Sessions showed Post-Race Debrief & MoTeC Bridge; HUD showed Setup/Layout/Advanced; return to Live rendered telemetry cards. Candidate label remained visible. |
| Lite | Live → HUD → Live | Both exposed workspaces rendered; HUD showed Setup/Layout/Advanced; return to Live rendered telemetry cards. Candidate label remained visible. |

Both entries kept the backend-disconnected state explicit (`Failed to fetch` / `Backend disconnected`). No backend success, save, download, native window, external HUD, game telemetry or MoTeC result was inferred.

## Final boundary status

W4 browser candidate evidence is complete for the scoped P7-A/B/C work and P7-D preparation. C/L/T/S/R/H/U rows that require successful backend data, real game, native controls or restart persistence remain `not-run`; X3 final and X4/G5 remain `not-run` until the final real-machine gate uses this candidate SHA.
