## 2024-05-24 - Pre-allocating Module-Level Arrays in 60Hz Render Loops
**Learning:** In high-frequency 60Hz telemetry HUD rendering loops, creating inline arrays like `var slipRatios = [a, b, c, d];` results in 240 arrays per second per wheel being created and discarded, increasing GC pressure and causing micro-stutters.
**Action:** Instead of dynamic arrays, pre-allocate module-scoped static arrays (e.g., `var _slipRatios = [0, 0, 0, 0];`) and mutate them by index (`_slipRatios[0] = a;`). Then, reassign the local variable to the pre-allocated array (`var slipRatios = _slipRatios;`).
## 2026-08-27 - DOM Caching in Advanced HUD Telemetry Render Path
**Learning:** Advanced HUD `onFrame` and `drawAdvancedHUD` run on telemetry updates; repeated `document.getElementById()` calls add avoidable DOM lookup overhead in the render path.
**Action:** Initialize `domCache` for static HUD nodes, lazily cache wheel-lockup dot elements, and route the `onFrame`, `drawAdvancedHUD`, display, animation, and visibility paths through cached references. Keep the cache contract covered by `advancedHudContract.test.ts`.
