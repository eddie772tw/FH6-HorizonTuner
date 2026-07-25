## 2024-03-XX - Unnecessary React Renders of Standalone Canvas Components
**Learning:** Components containing `canvas` elements that manage their own updates via high-frequency event emitters (like `telemetryEmitter.addEventListener`) can still be unnecessarily re-rendered by the main React state loop in parent components if they are not memoized.
**Action:** When a canvas subcomponent independently renders live data outside the React state cycle, wrap it in `React.memo()` (and ensure any props like inline selector functions are extracted to constants or memoized) to prevent the parent React component from pointlessly re-evaluating the canvas component's virtual DOM structure at high frequencies.

## 2024-03-XX - Recharts Animation Performance with High-Density Data
**Learning:** Recharts animations (`isAnimationActive={true}` by default) can severely degrade performance and block the main thread when rendering high-frequency, high-density telemetry data (like in `DragTestView` and `CarParamsView`). The animation calculations for hundreds or thousands of data points overwhelm the browser.
**Action:** Always explicitly disable animations (`isAnimationActive={false}`) on Recharts components (like `<Line>`) when dealing with large datasets or high-frequency telemetry in this application to ensure smooth rendering and responsiveness.
## 2026-07-25 - Disable Recharts Animations to Improve Performance
**Learning:** SVG animations in Recharts components (`Pie`, `Radar`, `Bar`, `Area`, `Line`) block the main thread and cause frame drops when rendering high-frequency, large datasets (e.g. telemetry charts in `DynamicChartGrid.tsx` and `ChartEditModal.tsx`).
**Action:** Consistently set `isAnimationActive={false}` on all Recharts graphical elements (not just `Line`, but `Pie`, `Radar`, `Bar`, and `Area` as well) to prevent expensive animation calculations and ensure a smooth UI when plotting continuous or dense data.
