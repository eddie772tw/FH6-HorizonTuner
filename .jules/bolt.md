## 2024-05-24 - Pre-allocating Module-Level Arrays in 60Hz Render Loops
**Learning:** In high-frequency 60Hz telemetry HUD rendering loops, creating inline arrays like `var slipRatios = [a, b, c, d];` results in 240 arrays per second per wheel being created and discarded, increasing GC pressure and causing micro-stutters.
**Action:** Instead of dynamic arrays, pre-allocate module-scoped static arrays (e.g., `var _slipRatios = [0, 0, 0, 0];`) and mutate them by index (`_slipRatios[0] = a;`). Then, reassign the local variable to the pre-allocated array (`var slipRatios = _slipRatios;`).
## 2026-08-27 - DOM Caching in Advanced HUD Telemetry Render Path
**Learning:** Advanced HUD `onFrame` and `drawAdvancedHUD` run on telemetry updates; repeated `document.getElementById()` calls add avoidable DOM lookup overhead in the render path.
**Action:** Initialize `domCache` for static HUD nodes, lazily cache wheel-lockup dot elements, and route the `onFrame`, `drawAdvancedHUD`, display, animation, and visibility paths through cached references. Keep the cache contract covered by `advancedHudContract.test.ts`.
## 2024-08-28 - Caching `new Function` Calls in High-Frequency Data Loops
**Learning:** In frontend telemetry processing loops (e.g., custom math evaluations across massive data arrays), calling `new Function(...)` repeatedly is severely detrimental to CPU performance and creates excessive Garbage Collection (GC) overhead.
**Action:** Use a memoization cache (like `new Map()`) to pre-compile and store dynamically generated functions at the module level. Ensure the cache key uniquely identifies the logic, allowing the render and data processing paths to immediately reuse compiled functions.
## 2024-05-24 - Avoiding Spread Operators on Large Arrays
**Learning:** Using the spread operator (`Math.max(...arr)`) inside summary functions (like `summarizeSeries` for historical telemetry) causes `RangeError: Maximum call stack size exceeded` when arrays become too large. Combined with `.filter()` and `.reduce()`, it significantly degrades performance by triggering excessive array allocations and garbage collection.
**Action:** Always replace chained array methods and spread operators with a single-pass `for` loop that calculates `min`, `max`, and `sum` manually to prevent stack overflows and optimize GC in large telemetry paths.
