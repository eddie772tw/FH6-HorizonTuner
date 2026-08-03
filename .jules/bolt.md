## 2024-05-18 - Prevent Blocking Event Loop with Asyncio File I/O
**Learning:** Synchronous file I/O operations (like `open()` and `json.dump()`) in a FastAPI async endpoint block the main event loop, leading to increased latency under load.
**Action:** Wrap synchronous I/O operations in a helper function and use Python's built-in `await asyncio.to_thread(func)` to offload the blocking operations to a separate thread without requiring external dependencies like `aiofiles`.
## 2024-03-XX - Unnecessary React Renders of Standalone Canvas Components
**Learning:** Components containing `canvas` elements that manage their own updates via high-frequency event emitters (like `telemetryEmitter.addEventListener`) can still be unnecessarily re-rendered by the main React state loop in parent components if they are not memoized.
**Action:** When a canvas subcomponent independently renders live data outside the React state cycle, wrap it in `React.memo()` (and ensure any props like inline selector functions are extracted to constants or memoized) to prevent the parent React component from pointlessly re-evaluating the canvas component's virtual DOM structure at high frequencies.

## 2024-03-XX - Recharts Animation Performance with High-Density Data
**Learning:** Recharts animations (`isAnimationActive={true}` by default) can severely degrade performance and block the main thread when rendering high-frequency, high-density telemetry data (like in `DragTestView` and `CarParamsView`). The animation calculations for hundreds or thousands of data points overwhelm the browser.
**Action:** Always explicitly disable animations (`isAnimationActive={false}`) on Recharts components (like `<Line>`) when dealing with large datasets or high-frequency telemetry in this application to ensure smooth rendering and responsiveness.
## 2026-07-25 - Disable Recharts Animations to Improve Performance
**Learning:** SVG animations in Recharts components (`Pie`, `Radar`, `Bar`, `Area`, `Line`) block the main thread and cause frame drops when rendering high-frequency, large datasets (e.g. telemetry charts in `DynamicChartGrid.tsx` and `ChartEditModal.tsx`).
**Action:** Consistently set `isAnimationActive={false}` on all Recharts graphical elements (not just `Line`, but `Pie`, `Radar`, `Bar`, and `Area` as well) to prevent expensive animation calculations and ensure a smooth UI when plotting continuous or dense data.

## 2026-07-29 - Array map and spread operator in High-Frequency Canvas Renders
**Learning:** Using `.map()` to create a new array and `...` spread operator in a 60Hz high-frequency rendering loop (like `Math.max(...hist.map(...))`) causes severe garbage collection pressure and main thread blocking, even when wrapped in React.memo(), because it executes outside the React render cycle during telemetry updates.
**Action:** Avoid `.map()` and `...` on large arrays inside high-frequency event listeners. If an array is chronologically sorted, access the last element directly (e.g., `hist[hist.length - 1]`) instead of calculating min/max.

## 2024-11-20 - Memoizing Base Data and Short-Circuiting Hidden Components
**Learning:** In high-frequency React render cycles (like processing 60Hz live telemetry data), components that perform expensive data transformations (e.g., `transformTelemetryData` or iterating over arrays using `.map` and `.forEach`) can bottleneck the main thread. This is especially problematic if the data transformations are running for components that are visually hidden or paused, or if the base data they are transforming updates infrequently.
**Action:**
1. Use `useMemo` and `useCallback` to prevent unnecessary reprocessing of large arrays (like `fullSessionTrackData` updating only every 5s).
2. Short-circuit expensive transformation functions if their resulting data will not be rendered (e.g., conditionally skip `transformTelemetryData` when `isRecording` is true and charts are hidden).
## 2026-07-31 - Memoizing Derived Chart Data inside Loops
**Learning:** Calling expensive data transformation functions inside a React render loop (like `.map` over an array of configurations) blocks the main thread, especially when mapping over large arrays like telemetry history.
**Action:** Always wrap derived data calculations that rely on large datasets with `useMemo` and map the results locally to avoid redundant O(N*M) operations on every state update, caching the results instead.
## 2025-02-12 - Optimized Audio Spectrum FFT Computation
**Learning:** Manual mathematical loops for operations like Discrete Fourier Transform (DFT) can be computationally expensive and slow.
**Action:** Utilize optimized native libraries like `numpy` and its `np.fft.rfft` implementation to significantly enhance the performance of Fast Fourier Transform computations. Ensure required dependencies like `numpy` are added to `requirements.txt`.
## 2024-12-05 - Avoid spread operator with Math.max/min on large arrays
**Learning:** Using `Math.max(...values)` or `Math.min(...values)` on very large datasets (like full telemetry session histories) throws a "Maximum call stack size exceeded" error. The array spread operator expands into function arguments, and V8 limits the number of arguments to roughly 125,000.
**Action:** Always compute `min` and `max` values iteratively within an O(N) loop rather than using the spread operator for telemetry history arrays. This prevents stack overflow exceptions and reduces garbage collection pressure by avoiding intermediate array creations (like from `.map()`).
## 2024-03-XX - Memoize Data Transformations in Modals to Avoid Keystroke Blocking
**Learning:** Calling expensive data transformation functions (like `transformTelemetryData` over large `sampleData` arrays) directly within a functional component like a Modal blocks the main thread. If the component has string inputs (e.g., for titles), the re-renders triggered by typing will re-execute the expensive transformation, leading to significant input lag and poor user experience.
**Action:** Always wrap expensive derived data calculations within UI components (especially Modals with text inputs) in `useMemo` blocks, ensuring that the heavy computation is only re-run when actual data dependencies (like the dataset or selected channels) change, not when unrelated UI state updates.
