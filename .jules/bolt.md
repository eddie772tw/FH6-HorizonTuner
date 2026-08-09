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
## 2025-03-10 - Avoid Higher-Order Array Methods in Large Array Processors
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
## 2024-05-18 - Nested Fallback Ternary Danger
**Learning:** Using a ternary operator `obj ? obj.prop : fallback` to check for nested object properties is unsafe if `obj` exists but `obj.prop` does not. In JavaScript, this evaluates to `undefined`, silently bypassing the fallback.
**Action:** Use logical OR evaluation `(obj && obj.prop) || fallback` to ensure the fallback triggers when intermediate properties are missing.
