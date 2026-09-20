# W4-P7-C browser UI composition matrix

Date: 2026-09-20 Asia/Taipei  
Candidate SHA: `d36c11a6fdc6a00df9f957648e8ac6d35681951b`  
Surface: local Vite Full/Lite browser entries at `http://127.0.0.1:1424/` and `/lite/`  
Scope: browser-only; no Tauri/native, real FH6, external HUD or G5 claim.

## Matrix evidence

The browser CDP viewport override was used temporarily at `390 × 844`; it was cleared after the run. The normal in-app browser viewport measured `846px` wide for the desktop check.

| Entry | Viewport | Theme/core states | Overflow / layering | Keyboard result |
| --- | --- | --- | --- | --- |
| Full | 390px | dark/default, light/default, light/modern, light/elegant, light/default reset | `documentElement.scrollWidth === innerWidth === 390` in every state; Theme panel mounted as the top surface | App Menu → Appearance → `Escape` closed the panel and returned focus to App Menu; Tab then moved focus to Dashboard. |
| Full | 846px desktop | dark/default reset after the matrix | `scrollWidth === innerWidth === 846` at the desktop check | Settings and Updates Escape checks from P7-B returned focus to App Menu. |
| Lite | 390px | light/default, dark/default, dark/modern, dark/elegant | `documentElement.scrollWidth === innerWidth === 390` in every state; Theme panel mounted as the top surface | App Menu → Appearance → close returned to the Lite App Menu; Settings Escape left the Live surface usable. |

Full exposed Live/Tune/Sessions/HUD. Lite exposed only Live/HUD. Both entries exposed Settings, Appearance, Diagnostics, Updates and About through App Menu. HUD and Live remained reachable after theme changes and after closing the panel.

## Result and limits

- Browser X2 scope: `pass` for the exercised theme, responsive-width, navigation, keyboard, Escape and modal layering matrix.
- Browser portions of C1/C2/C4/U1/U2/H1/H2/H6: evidence updated as reachable/observable in this matrix.
- Backend success, persisted settings after process restart, native window behavior, real HUD/device control, external MoTeC and Full/Lite Tauri startup remain `not-run`.
- `scrollWidth` equality is an overflow signal, not a pixel-equivalence proof. No screenshot comparison or native first-frame claim is made.

The temporary Vite process was stopped after collection. The temporary browser tabs and viewport overrides were not retained as deliverables.

