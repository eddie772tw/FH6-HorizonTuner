# TuningMath human review and telemetry test plan

This document defines the manual evidence required before any experimental tuning output can become a validated profile. The test page is available from `TuningView_dev` through `Open Telemetry Capture`.

## Required capture metadata

Before pressing `Start Capture`, enter:

- car ID/name, game build, PI/class and drivetrain;
- installed tire, suspension, ARB, differential, gearbox, aero and brake parts;
- surface, weather, event/track, share code and driver assists;
- the single variable being tested and the expected hypothesis;
- whether the run is baseline, candidate A, candidate B or a boundary observation.

The page collects raw frames from the existing telemetry WebSocket emitter while capture is active. It does not alter the recorder, UDP listener or game settings. Download both JSON and CSV; JSON is canonical because it preserves metadata and schema, while CSV is for spreadsheet/MoTeC-style inspection.

## Minimum run protocol

1. Warm the car and tires using the same route and driving procedure.
2. Change one variable only: part, slider value, tire, surface or assist.
3. Perform one familiarization run, then at least three measured repetitions.
4. Keep launch, braking point, line, gear strategy and assists constant.
5. Record failures, wheelspin, off-track events and traffic instead of deleting them.
6. Export each run with a unique label and link candidate A/B files in the notes.
7. Review sample count, median cadence, non-monotonic timestamps and metadata completeness before using the file for calibration.

## Test matrices

### Control-boundary tests

For each adjustable part and car:

- capture the displayed value at the minimum, maximum and three interior positions;
- record whether the value changes continuously, snaps, or is rejected;
- capture both front and rear controls independently;
- repeat after changing the relevant upgrade part;
- repeat after changing units if the UI supports unit conversion;
- keep `step`, `precision`, `min` and `max` as unknown until the screenshots and repeated observations agree.

Required coverage: spring/ride height/damping, ARB, aero front/rear, brake balance/pressure, differential axes, final drive and gear ratios, tire pressure and alignment.

### Road / circuit

Compare baseline and candidate on the same dry tarmac route. Capture steady cornering, trail braking, throttle-on exit and one straight-line power segment. Review lateral G, longitudinal G, speed, steering, slip angle, slip ratio and tire temperatures. Use lap time only when line and traffic are controlled.

### Rally / off-road

Use the same gravel or snow route and record roughness, jumps and landings separately. Review suspension travel, combined slip, wheel-to-wheel asymmetry, speed and landing transients. Do not mix gravel and snow in one calibration fixture.

### Drift

Use a fixed corner or marked practice area. Record entry, steady-state and transition as separate captures. Review vehicle velocity direction, steering, slip angle, rear slip ratio, throttle and handbrake. Evaluate stability and repeatability, not only peak angle.

### Drag

Use the same strip and launch procedure. Capture launch, 60-foot/100-m equivalent markers if available, gear shifts and wheelspin. Review speed, longitudinal G, slip ratio, RPM and shift timing. Compare RWD/AWD only as separate matrices; do not infer a universal differential split.

## Acceptance rules

A fixture is eligible for community evidence only when it has complete metadata and a source URL. It is eligible for in-game evidence only when the displayed control and installed part are captured directly. A numeric coefficient is eligible for solver calibration only when:

- at least three repeated runs support the same directional conclusion;
- baseline/candidate conditions differ by one controlled variable;
- cadence and timestamps pass integrity checks;
- the result is not explained by traffic, line, launch or temperature drift;
- the promotion record contains the game build, car, parts, surface and confidence.

The AI/MCP layer may flag missing metadata, compare runs and propose the next experiment. It must not promote a value automatically.
