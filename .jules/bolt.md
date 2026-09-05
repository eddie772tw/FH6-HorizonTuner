## 2024-05-24 - Pre-allocating Module-Level Arrays in 60Hz Render Loops
**Learning:** In high-frequency 60Hz telemetry HUD rendering loops, creating inline arrays like `var slipRatios = [a, b, c, d];` results in 240 arrays per second per wheel being created and discarded, increasing GC pressure and causing micro-stutters.
**Action:** Instead of dynamic arrays, pre-allocate module-scoped static arrays (e.g., `var _slipRatios = [0, 0, 0, 0];`) and mutate them by index (`_slipRatios[0] = a;`). Then, reassign the local variable to the pre-allocated array (`var slipRatios = _slipRatios;`).
## 2026-08-27 - DOM Caching in Advanced HUD Telemetry Render Path
**Learning:** Advanced HUD `onFrame` and `drawAdvancedHUD` run on telemetry updates; repeated `document.getElementById()` calls add avoidable DOM lookup overhead in the render path.
**Action:** Initialize `domCache` for static HUD nodes, lazily cache wheel-lockup dot elements, and route the `onFrame`, `drawAdvancedHUD`, display, animation, and visibility paths through cached references. Keep the cache contract covered by `advancedHudContract.test.ts`.
## 2024-08-28 - Caching `new Function` Calls in High-Frequency Data Loops
**Learning:** In frontend telemetry processing loops (e.g., custom math evaluations across massive data arrays), calling `new Function(...)` repeatedly is severely detrimental to CPU performance and creates excessive Garbage Collection (GC) overhead.
**Action:** Use a memoization cache (like `new Map()`) to pre-compile and store dynamically generated functions at the module level. Ensure the cache key uniquely identifies the logic, allowing the render and data processing paths to immediately reuse compiled functions.
## 2024-05-25 - Single-Pass Array Accumulation in Telemetry Math
**Learning:** Chaining `.map()` over 2D array coordinates inside `calculateSuspensionMetrics` (e.g., mapping corner axes against the entire 30s history frame) allocates heavily at 10-60Hz, increasing GC pauses and hurting telemetry smoothness.
**Action:** Unroll intermediate `.map()` extractions directly into a single pass `for` loop that iterates the history array exactly once, calculating minimums, maximums, and sums inline to return summary objects directly.
## 2024-05-30 - DOM Pooling for Text Rendering in 60Hz Render Loops
**Learning:** Overwriting `innerHTML` in a 60Hz render loop (e.g. for dynamic HUD speed values) causes unnecessary DOM destruction/recreation, layout thrashing, and immense Garbage Collection overhead.
**Action:** Replace `innerHTML` concatenation loops with DOM pooling: match existing children's length, update `textContent` only when characters differ, and dynamically add/remove `<span>` elements only when string length changes.
## 2024-10-25 - Eliminating Object Allocation in Large Render Loops
**Learning:** Returning objects like `{ x, y }` from helper functions inside a large data iteration loop (e.g., iterating a 10,000-element tracking history at 60Hz) causes massive object allocation and GC pauses.
**Action:** In high-frequency rendering loops, compute parameters inline using isolated primitive values (e.g., `pPrevX`, `pPrevY`, `pCurrX`, `pCurrY`), replacing the helper function call entirely and eliminating all object creation in the hot path.

## 2024-11-25 - Eliminating Spread Operator Call Stack Overflows
**Learning:** Using `Math.max(...array.map(...))` on large dynamic arrays (e.g., telemetry history points mapped to speed values) causes `RangeError: Maximum call stack size exceeded` because V8 has a strict limit on the number of arguments a function can accept via the spread operator. It also increases GC pressure by creating temporary mapped arrays.
**Action:** Replace `...array.map()` and `Math.max()` combinations with standard single-pass `for` loops that iterate the array by index, extracting values and comparing them directly against an inline maximum variable to ensure safe execution on large datasets and eliminate allocations.

## 2026-09-05 - Pre-computing HUD layout anchors on resize instead of render
**Learning:** Computing layout variables by querying anchor points and applying viewport transforms inside a 60Hz render loop (e.g. `driftLayout.getBottomRightAnchor()`) allocates unnecessary objects and performs redundant math 60 times a second.
**Action:** Move anchor layout computations to the window resize event handler (e.g. `resizeDriftCanvas()`), cache the transformed `logicalCenterX`, `logicalCenterY`, and scaling parameters in module-scoped variables (`primaryAnchorCache`), and reference them in the render loop to eliminate object allocation and mathematical overhead.
