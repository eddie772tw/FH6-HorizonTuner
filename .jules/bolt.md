<!-- Raw Jules work log. Promote only after local verification; see .jules/README.md. -->

## 2025-03-03 - Decouple WebSocket Streams to Prevent Concurrent Write Crashes
**Learning:** High-frequency backend asyncio broadcast tasks (e.g., telemetry vs overlay states) writing to the same FastAPI/Uvicorn WebSocket endpoint concurrently will corrupt frame headers and force the client to disconnect with protocol errors.
**Action:** Decouple logically distinct high-frequency data streams into separate WebSocket endpoints (e.g., `/ws/telemetry` and `/ws/overlay`), each managed by its own `ConnectionManager` instance, eliminating the need for slow runtime locks while fixing concurrent write drops.

## 2025-03-03 - Prevent Endless WebSocket Reconnect Loops on React Unmount
**Learning:** If a shared WebSocket manages its reconnection logic in its `onclose` handler without verifying active listeners, React component unmount lifecycles will trigger endless background reconnect loops, spamming the console with `WebSocket is closed before the connection is established` warnings.
**Action:** Always clear `.onclose` and `.onerror` handlers to `null` during cleanup, and conditionally check if subscriber counts are > 0 before calling `setTimeout` for reconnects inside the closure.

## 2025-03-03 - Isolate Vanilla JS WebSocket Reconnection Loops
**Learning:** Combining multiple WebSocket initializations into a single function with one global auto-reconnect trigger causes connection leaks, as dropping one socket will re-initialize all of them, stranding the still-open ones.
**Action:** In vanilla JS implementations, encapsulate each WebSocket connection in a standalone initialization function, granting each its own dedicated timeout loop for robust partial-drop recovery.

## 2025-03-09 - HTML5 Canvas Optimization for HUD overlays
**Learning:** Replaced heavy image sequence preloading (over 700 frames) with native Canvas API drawing in the HUD overlay to vastly reduce HTTP requests, memory footprint, and initialization latency.
**Action:** When creating animated dials or dynamic text readouts in HUD overlays, favor math-driven rendering using Canvas primitives (`ctx.arc`, `ctx.fillText`, `ctx.rotate`) instead of fetching hundreds of sprite images.
## 2026-08-04 - Fix Telemetry Jitter
**Learning:** High-frequency (60Hz) DOM updates conflict with CSS `transition` properties, causing visual jitter. Also, rendering 60Hz data via standard React state triggers excessive garbage collection, causing UI stutter.
**Action:** Extract high-frequency data fields to separate components that subscribe directly to the event emitter (`telemetryEmitter`) and update the DOM directly via `refs`. Always remove CSS `transition` styles from elements updated at this frequency to prevent visual conflict.
## 2025-03-01 - HUD Overlay Performance GC Pressure
**Learning:** Using array callbacks (`.filter`, `.forEach`) in high-frequency loops (like `requestAnimationFrame` for `g-radar`) allocates closures and intermediate arrays every frame. Combined with unbound data accumulation during pauses, this causes heavy Garbage Collection (GC) spikes and visual stuttering.
**Action:** Replace `.filter` and `.forEach` with native `for` loops in 60Hz rendering code. Implement a time-delta reset (e.g., `now - lastTime > 1500ms`) to cleanly flush stale telemetry data when the game pauses or disconnects. Also ensure lifecycle events like `destroy` properly zero out arrays to prevent cross-HUD memory leaks.
## 2025-03-03 - Remove CSS transitions from high-frequency telemetry components
**Learning:** CSS transitions applied to elements updated at 60Hz via requestAnimationFrame or high-frequency event emitters conflict with the rapid DOM updates. This causes visual jitter and performance degradation because the browser's composite engine attempts to calculate interpolated frames for values that are already being manually interpolated/updated at 60Hz.
**Action:** Always remove CSS `transition` styles from elements updated at high frequencies (like telemetry components) to prevent visual conflict and reduce browser rendering overhead.

## 2025-03-03 - Prevent String Array Allocations in High-Frequency DOM Updates
**Learning:** Using `value.toString().split('').map(...).join('')` inside high-frequency 60Hz telemetry rendering loops (like HUD overlay speed/RPM displays) creates a new array, iterates it with a closure, and joins it back together on every frame. This triggers massive Garbage Collection (GC) pauses and visual jitter. Additionally, blindly updating `innerHTML` every frame when the value hasn't changed causes unnecessary DOM repaints.
**Action:** Replace `split('').map()` with native `for` loops and simple string concatenation. Always implement a cache check (e.g., `if (_lastValue === value) return;`) before updating DOM text or innerHTML in high-frequency functions.
## 2026-08-04 - Chassis Tuning Refactoring & UI Input Bypass for E2E
**Learning:** Refactoring the React TuningView required separating the tuning setup step (`Step 1`), gearing calculation (`Step 2`), and chassis logic (`Step 3`) into distinct stages. Because React state strictly controls input fields mapped via `useCarParams`, directly injecting test variables or dispatching raw JavaScript `click()` events might fail if `onChange` listeners and state hooks are not fully initialized or if they block standard Playwright interactions due to the component structure.
**Action:** When E2E testing multistep React forms in Playwright, bypass UI constraints directly using `CustomEvent` injection tied to window listeners where possible, or directly access `__reactProps$` on DOM elements if necessary to simulate user typing, rather than relying solely on Playwright's native `fill` and `click` actions.
## 2024-08-05 - Avoid .forEach and Object allocation in 60Hz Render Loops
**Learning:** In high-frequency rendering loops (like HUD telemetry updates running at 60Hz), using functional iterations (e.g., `[].forEach`, `Object.keys().forEach`) or allocating objects dynamically every frame creates significant Garbage Collection (GC) pressure, causing visual stuttering and frame drops.
**Action:** Always replace `.forEach` with native `for` loops, pre-compute keys outside the render loop instead of calling `Object.keys()`, and use pre-allocated static variables or objects instead of creating zero-values (like `{x: 0, y: 0}`) on the fly.
## 2025-03-03 - Avoid Higher-Order Array Methods in Large Array Processors
**Learning:** Chained array methods like `.filter().map()` or nested `.forEach` loops inside React hooks or utility functions that process large sets of data (like historical telemetry points in `ChartEditModal.tsx` or `tuningDiagnosis.ts`) cause excessive memory allocations and GC spikes. This leads to noticeable UI stuttering when charts update or calculations run.
**Action:** Always replace `.forEach()`, `.map()`, `.filter()`, and `.reduce()` with standard `for` loops when handling potentially large arrays. For example, merge a map/reduce combination into a single loop accumulator to improve computational throughput and reduce memory footprint.

## 2024-05-18 - Replacing forEach closures in high-frequency React loop
**Learning:** In high-frequency rendering paths (like processing large telemetry dataset for Chart previews), using array methods like `.forEach` creates a new function closure allocation for every data point. This can cause unnecessary garbage collection overhead when parsing thousands of items continuously.
**Action:** Replace `.forEach` or chained array iteration methods with native `for` loops inside expensive data-parsing contexts like `transformTelemetryData` or high-rate UI loops to reduce GC pressure.
## 2026-08-07 - Cache CSS Custom Property Updates in High-Frequency DOM Loops
**Learning:** In a 60Hz high-frequency loop (like `requestAnimationFrame` updates for HUD overlays), blindly calling `style.setProperty()` every frame forces the browser to re-evaluate styles, causing layout thrashing even if the value hasn't changed.
**Action:** Use a closure variable object (e.g. `var _lastStyles = {}`) to cache the currently applied CSS custom property values, and conditionally invoke `style.setProperty()` only when the new value differs from the cached value to avoid redundant DOM operations.

## 2026-08-08 - Prevent Heap Allocation in dict.get Defaults
**Learning:** High-frequency backend methods (like parsing UDP telemetry or rendering hot paths) using inline list allocations (e.g. `[0.0] * 4`) as fallback default arguments in `dict.get()` will instantiate new list objects on every single function call. This places immense pressure on the Garbage Collector.
**Action:** Extract inline list allocations used as default fallback arguments into module-level immutable constants, such as tuples (e.g. `DEFAULT_TIRE_ARRAY = (0.0, 0.0, 0.0, 0.0)`), to completely eliminate the allocation overhead.
## 2026-08-10 - Eliminate .forEach in Vanilla Canvas Rendering
**Learning:** In HUD canvas overlays (`hud_overlay/drift/index.html`), drawing dynamic lists via `.forEach` (like rendering tick marks or multiple pedal UI elements) created closures on every single frame, leading to noticeable GC pauses in high frame rate scenarios.
**Action:** Replace `.forEach` with standard `for` loops and extract helper functions (e.g., `drawPedal`) into the outer scope to remove frame-by-frame closure allocations entirely. Pre-calculate static constant arrays where possible to avoid redundant heap allocation inside `requestAnimationFrame`.

## 2025-03-03 - Eliminate array methods in hot paths like HUD requestAnimationFrame loops
**Learning:** High-frequency rendering loops (like HUD telemetry updates running at 60Hz via `requestAnimationFrame`) that use functional iterations or array allocations create significant Garbage Collection (GC) pressure, causing visual stuttering. In `hud_overlay/s650_hmi/assets/s650_frame.js`, the `getTireTemperatures` function used `.map()` and was allocating closures and temporary arrays continuously.
**Action:** Replace `.map()`, `.filter()`, and `.forEach()` with native `for` loops in any code path executed per-frame. Pre-allocate arrays if their size is known (e.g., `new Array(4)`) to minimize heap allocations during rendering.
## 2025-03-03 - Eliminate .every() and spread operators in high-frequency data loops
**Learning:** Using array functional methods like `.every()` inside high-frequency loops (e.g. iterating over tens of thousands of telemetry data points in `tuningDiagnosis.ts`) creates function closures on every iteration, leading to significant garbage collection pressure. Similarly, using the spread operator `...` on arrays (e.g. `Math.max(...lTravel)`) clones the array internally, adding overhead.
**Action:** Replace `.every()`, `.some()`, etc., with explicit `&&` or `||` index evaluations when array sizes are fixed and small (e.g., 4 wheels). Replace spread operators with direct index arguments for standard mathematical functions (e.g., `Math.max(arr[0], arr[1], arr[2], arr[3])`).

## 2025-02-12 - SQLite get_telemetry_points mapping optimization
**Learning:** For extremely large result sets in `sqlite3`, using `sqlite3.Row` and then manually transforming data using `dict()` and `.pop()` creates huge GC and object creation overhead.
**Action:** Push math down to SQL (e.g. division `/ 57.29578`), set `cursor.row_factory = None` on the local cursor, and construct the target dictionary output in a single list comprehension using explicit tuple index access.
## 2025-03-09 - Eliminate array allocation and closures in 60Hz loop
**Learning:** In high-frequency 60Hz canvas rendering loops (e.g. `renderShiftTacho`), initializing arrays dynamically every frame and using `.forEach` creates unnecessary array allocations and functional closures. This rapidly increases garbage collection (GC) pressure, leading to visual stuttering over time.
**Action:** Extract inner logic from array iteration methods (`.forEach`, `.map`, etc.) into dedicated helper functions outside of the rendering loop, and explicitly unroll the iterations inside the 60Hz loop manually to bypass allocations entirely.
## 2025-02-23 - FastAPI Asyncio Event Loop Blocking by File I/O
**Learning:** Synchronous File I/O (like `os.listdir` and `json.load`) executed within an `async def` FastAPI route blocks the underlying ASGI asyncio event loop, causing severe latency degradation for concurrent requests (e.g., websockets or parallel REST calls).
**Action:** When a FastAPI route requires synchronous operations, either declare the route as a synchronous `def` (which allows FastAPI to natively offload it to an external threadpool) or use `await asyncio.to_thread()` within an `async def` route to manually offload the blocking code. Do not use `async def` with bare synchronous I/O.
## 2026-08-11 - Use useMemo and for loops for telemetry data in React
**Learning:** Calling array methods like `.filter()` that execute closures directly inside the React render cycle (e.g., `<AreaChart data={telemetryPoints.filter(...)}>`) causes severe GC pressure, UI stuttering, and recalculations on every render when working with large telemetry datasets.
**Action:** Always wrap data downsampling or transformation logic for large arrays in a `useMemo` hook, and replace `.filter()`, `.map()`, and chained methods with a native `for` loop to eliminate both redundant computations across renders and per-element closure allocations.
## 2026-08-16 - DOM Caching in High-Frequency HUD Loops
**Learning:** Repeatedly querying document.getElementById inside 60Hz telemetry render loops (e.g. Simple HUD) incurs high GC and CPU overhead.
**Action:** Query elements once during initialization and cache them in a structure (e.g. domCache) to eliminate frame-level lookup overhead.

## 2026-08-15 - Eliminate .forEach array allocations in Live Map Telemetry Card
**Learning:** In high-frequency render paths like the 60Hz Live Map telemetry card, using `.forEach` inside `renderLiveMap` with inline array initializations (e.g. `[40, 80, 120].forEach`) creates unnecessary function closures and inline array allocations on every single render tick. This results in heavy garbage collection pressure, leading to potential frame stuttering and micro-freezes.
**Action:** Replace `.forEach` loops with native `for` loops in high-frequency functions. In scenarios with known numeric step sequences, use mathematical loops (e.g. `for (var r = 40; r <= 120; r += 40)`) to completely eliminate the need for inline array declarations and closure overhead.
## $(date +%Y-%m-%d) - Caching DOM lookups in Vanilla JS Overlays
**Learning:** High-frequency render loops (like 60Hz telemetry overlay functions) calling `document.getElementById` synchronously bottleneck the main thread.
**Action:** Always pre-query static DOM elements during initialization and cache them in a structure (e.g., `this.domCache`). Pass this cache down to sub-renderers instead of querying the DOM in the render loop. Use the logical OR pattern `(domCache && domCache.prop) ? domCache.prop : document.getElementById(...)` as a safe fallback.
## 2026-08-19 - HUDCore DOM Lookup Optimization
**Learning:** High-frequency event handlers in vanilla JS overlays (like HUDCore message events for `hud:elements`, `hud:scale`, and `config`) can cause slight performance degradation if they repeatedly query the DOM (e.g., `document.getElementById`) to find their container elements.
**Action:** When initializing HUD modules, query DOM elements once and cache their references (e.g., `cachedContainer = document.getElementById(...)`), and use those cached references inside hot paths to minimize Garbage Collection and CPU overhead.
## 2026-08-20 - Pre-Allocate Arrays in 60Hz Render Loops
**Learning:** Instantiating new arrays dynamically via `new Array().fill()` inside high-frequency 60Hz render loops (like the `renderCorners` loop spanning 4 wheels) causes massive object creation per second. This spikes garbage collection (GC) pressure, which leads to visual stutters in the HUD rendering.
**Action:** Always extract array instantiations intended as temporary computation buffers into module-level static variables (e.g., `var _sharedBins = [];`) and reuse/overwrite their indices during rendering to entirely eliminate GC heap allocations in the hot path.
## 2026-08-23 - Optimize Live Map Point History Rendering
**Learning:** In the Live Map telemetry card (`hud_overlay/shared/telemetry-cards/live-map.js`), drawing the track history iterated through all historical points and repeatedly invoked `mapToCanvas` for `posHistory[j-1]` and `posHistory[j]`. Because `mapToCanvas` allocates and returns a new `{x, y}` object per call, this resulted in thousands of redundant math calculations and massive Garbage Collection (GC) object allocations per second at 60Hz.
**Action:** Extract the initial coordinate calculation (`pPrev = mapToCanvas(posHistory[0].x, posHistory[0].z)`) before the loop, and inside the loop compute `pCurr`, draw the line, and reassign `pPrev = pCurr`. This cuts object instantiation and redundant calculations exactly in half without violating DRY principles.
