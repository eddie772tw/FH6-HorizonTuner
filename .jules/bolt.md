## 2024-03-XX - Unnecessary React Renders of Standalone Canvas Components
**Learning:** Components containing `canvas` elements that manage their own updates via high-frequency event emitters (like `telemetryEmitter.addEventListener`) can still be unnecessarily re-rendered by the main React state loop in parent components if they are not memoized.
**Action:** When a canvas subcomponent independently renders live data outside the React state cycle, wrap it in `React.memo()` (and ensure any props like inline selector functions are extracted to constants or memoized) to prevent the parent React component from pointlessly re-evaluating the canvas component's virtual DOM structure at high frequencies.

## 2024-03-XX - Recharts Animation Performance with High-Density Data
**Learning:** Recharts animations (`isAnimationActive={true}` by default) can severely degrade performance and block the main thread when rendering high-frequency, high-density telemetry data (like in `DragTestView` and `CarParamsView`). The animation calculations for hundreds or thousands of data points overwhelm the browser.
**Action:** Always explicitly disable animations (`isAnimationActive={false}`) on Recharts components (like `<Line>`) when dealing with large datasets or high-frequency telemetry in this application to ensure smooth rendering and responsiveness.
