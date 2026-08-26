## 2024-05-24 - Pre-allocating Module-Level Arrays in 60Hz Render Loops
**Learning:** In high-frequency 60Hz telemetry HUD rendering loops, creating inline arrays like `var slipRatios = [a, b, c, d];` results in 240 arrays per second per wheel being created and discarded, increasing GC pressure and causing micro-stutters.
**Action:** Instead of dynamic arrays, pre-allocate module-scoped static arrays (e.g., `var _slipRatios = [0, 0, 0, 0];`) and mutate them by index (`_slipRatios[0] = a;`). Then, reassign the local variable to the pre-allocated array (`var slipRatios = _slipRatios;`).
## 2024-08-26 - Caching DOM Queries in High-Frequency Loops
**Learning:** Calling `document.getElementById()` repeatedly inside high-frequency 60Hz telemetry render loops (e.g., in `onFrame`, `setAdvSpeedDisplay`, `updateDotGroup`) causes severe GC pressure and CPU overhead, especially when multiplied across many elements.
**Action:** Pre-allocate a global cache object (`var _advDomCache = {}`) and resolve/cache references to elements on their first query. Then always reuse the cached node rather than requesting it from the DOM again.
