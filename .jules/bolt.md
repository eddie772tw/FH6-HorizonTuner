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
## 2026-09-07 - Explicit Array Unrolling vs TypeScript Flow Analysis
**Learning:** In TypeScript, when manually unrolling array iteration methods to eliminate closures (e.g., replacing `values.some((v) => v === null)` with `values[0] === null || values[1] === null`), TypeScript's control flow analysis does not narrow the type of the elements in a generic `readonly (number | null)[]`. Subsequent mathematical operations on the elements will fail with 'Object is possibly null'.
**Action:** When manually unrolling generic arrays for performance in TypeScript, always retain the non-null assertions (e.g., `values[0]!`) when accessing elements after the explicit null checks to satisfy the compiler.
## 2024-11-26 - Eliminating Array Iteration Methods in High-Frequency React Loops
**Learning:** Using array iteration methods like `Array.prototype.some()` inside high-frequency 60Hz React component render loops (e.g., parsing telemetry slip ratios in `DynoChart.tsx`) creates intermediate closures and function invocation overhead on every frame, which contributes to GC stutter.
**Action:** Unroll fixed-length array iteration methods into explicit index checks combined with logical operators (e.g., `values[0] > 0 || values[1] > 0`) to eliminate closure allocations and significantly reduce execution overhead in the critical render path.

## 2024-11-26 - Eliminating Set Iterators in High-Frequency Loops
**Learning:** In high-frequency JavaScript rendering and data loops (like the 60+ Hz `FrameInterpolator`), using `Set` collections and `for...of` loops causes new Iterator objects to be allocated and discarded every frame. This generates significant Garbage Collection (GC) pressure and causes CPU overhead compared to standard array loops.
**Action:** Use standard JavaScript Arrays (`[]`) instead of Sets and iterate over them using traditional indexed `for` loops (`for (let i = 0; i < arr.length; i++)`) to completely eliminate Iterator allocation overhead on the hot path.

## 2024-11-26 - Eliminating Redundant Array Filtering in React Renders
**Learning:** Calling `.filter()` multiple times on the same array during a React component's render cycle (e.g., to compute separate counts for 'active', 'applied', and the filtered list itself) iterates the array redundantly and allocates multiple intermediate arrays, increasing CPU and GC overhead.
**Action:** Replace multiple `.filter()` calls with a single `useMemo` block containing a single-pass `for` loop that accumulates all necessary counts and filtered items simultaneously, completely eliminating redundant iterations and intermediate allocations.

## 2024-05-24 - O(1) Circular Buffers in Canvas Render Loops
**Learning:** Using `Array.shift()` inside a 60Hz high-frequency rendering loop (like telemetry overlays or radar) causes an O(N) penalty as the entire array is shifted in memory on every frame, leading to CPU spikes and GC pressure.
**Action:** Replace `Array.shift()` with a fixed-size array and an `offsetRef` to simulate an O(1) circular buffer. Be sure to update all array iteration logic to modulo arithmetic `(offsetRef.current + index) % capacity` to traverse elements sequentially.
## 2024-11-26 - Eliminating Array.from() and .map() in Telemetry Capture
**Learning:** In the high-frequency telemetry capture loop (60Hz UDP data), parsing small arrays (like the 4-element `SurfaceRumble`) using `Array.from(data.SurfaceRumble ?? []).map((value) => finite(value))` creates severe overhead. It instantiates an intermediate Array and closures for every frame, generating significant Garbage Collection (GC) pressure.
**Action:** Replace `Array.from().map()` operations on fixed-size telemetry arrays with explicit, manual index access (e.g., `finite(data.SurfaceRumble?.[0])`) returning a direct array literal. This eliminates both intermediate object allocations and closure overhead, speeding up execution by ~4.6x in hot paths.
