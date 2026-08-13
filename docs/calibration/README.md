# Tuning calibration data boundary

This directory is reserved for versioned FH6 tuning observations. The schema deliberately keeps `min`, `max`, `step`, and `precision` as `unknown` until they are observed from an in-game capture or a reviewed community fixture.

`tuning-calibration/v1` is a capture record, not a solver profile. A record must not change `tuningMath_dev.ts` constants solely because it exists; promotion requires a reviewed source, a game-build key, and a repeatable A/B measurement.

## Confidence levels

- `unverified`: schema or manual note only; never used to calibrate production output.
- `community`: community observation with a link/screenshot and capture context; review required.
- `in_game_capture`: direct game UI/telemetry capture with build and installed-part context; still requires repeatability checks.

## Required review fields

Every promoted fixture should identify the car, drivetrain, class/PI, installed parts, tire type, surface/weather, event/track, control section/field, displayed value, bounds/step/precision, screenshot or capture path, telemetry session, timing metric, notes, and confidence.

The current developer UI will continue to show `unknown` boundaries as unknown. This prevents a guessed FH6 slider increment or upgrade lock from silently constraining the solver.
