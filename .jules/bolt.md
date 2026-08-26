## 2024-05-24 - Pre-allocating Module-Level Arrays in 60Hz Render Loops
**Learning:** In high-frequency 60Hz telemetry HUD rendering loops, creating inline arrays like `var slipRatios = [a, b, c, d];` results in 240 arrays per second per wheel being created and discarded, increasing GC pressure and causing micro-stutters.
**Action:** Instead of dynamic arrays, pre-allocate module-scoped static arrays (e.g., `var _slipRatios = [0, 0, 0, 0];`) and mutate them by index (`_slipRatios[0] = a;`). Then, reassign the local variable to the pre-allocated array (`var slipRatios = _slipRatios;`).
## 2023-10-25 - Prevent O(N) regex evaluation on Custom Math Parsing
**Learning:** Using `new Function()` inside high-frequency evaluation loops combined with multiple string replacements over a large dataset creates immense GC pressure and CPU blocking latency.
**Action:** Always pre-compile these mathematical or programmatic snippets using a memoized cache (`new Map()`). Inject variables securely via a `ctx` dictionary reference rather than inline string replacement to bypass `Function` instantiation overhead in loops.
