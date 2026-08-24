# TelemetryView V1.5 Development Roadmap

## Branch overview

| Field | Value |
| --- | --- |
| Base branch | `main` |
| Development branch | `feat/V1.5-arch` |
| Baseline | v1.4.4 |
| Current status | In progress |
| Scope | TelemetryView live card expansion and detailed telemetry display |

This branch introduces a usable TelemetryView architecture for V1.5.0. The
initial release focuses on a reliable interaction and data-history foundation;
later V1.5.x releases add richer views without changing the existing UDP or
WebSocket topology.

## Product goal

Users can select one of the five live dashboard cards and expand it to use the
full TelemetryView content area. The expanded card shows larger live values and
trend charts, and can be closed to return to the existing multi-card layout.

"Full screen" means the available TelemetryView content area. It does not use
the browser or operating-system Fullscreen API, and it does not cover the
application navigation outside TelemetryView.

The five expansion units are:

1. Driver Inputs & Engine
2. Live Telemetry Traces
3. Vehicle Dynamics Overview
4. Tire Grip & Status
5. Suspension Travel

## Scope and data boundary

- Consume the existing shared telemetry emitter and `useTelemetry` data.
- Keep the existing UDP parser, packet offsets, WebSocket endpoint, recorder,
  MCP service and HUD overlay topology unchanged.
- Use currently collected and parsed fields only. Unparsed packet fields and
  reserved areas remain outside V1.5 scope.
- Keep 60Hz Canvas/ref rendering on the existing live cards.
- Feed expanded React/chart views from a bounded, low-frequency rolling history.
- Represent missing optional data as unavailable rather than inventing a zero.

## Release roadmap

### V1.5.0 — Usable expansion architecture

Status: Verified locally; PR #245 open; CI pass

- Add a shared card shell with expand, close and keyboard handling.
- Allow each of the five main cards to expand independently.
- Add a bounded rolling history store for recent telemetry samples.
- Provide basic expanded views with current values and a short trend chart for
  each card.
- Preserve the existing multi-card layout, render switches and HUD pause state.
- Add responsive behavior, focus return, ARIA labels and dark/light theme
  compatibility.

Acceptance criteria:

- Each card opens and closes without starting another telemetry connection.
- `Escape` closes the expanded card and returns focus to its expand button.
- The existing dashboard remains usable after repeated open/close cycles.
- History is bounded and does not grow for the duration of a session.
- Frontend tests, TypeScript build and diff checks pass.

### V1.5.1 — Suspension detail

Status: Planned

- Add four-corner suspension trend and current-value presentation.
- Add current/min/max/average travel summaries.
- Add front/rear average and left/right difference summaries.
- Add normalized travel rate, bottom-out threshold and Pitch/Roll context.
- Do not claim suspension force, wheel load, damper force, ride height or
  motion-ratio data that is not present in the parsed telemetry contract.

### V1.5.2 — Tire and vehicle dynamics detail

Status: Planned

- Add four-wheel temperature, slip ratio, slip angle, combined slip and surface
  rumble trends.
- Add acceleration X/Y/Z, G values, Pitch/Roll/Yaw, speed, RPM, power, torque
  and boost/regeneration detail.
- Include the currently available lap, distance and race-position metrics.

### V1.5.3 and later V1.5.x — Enrichment and polish

Status: Planned

- Expand Driver Inputs & Engine with larger input, RPM, gear and speed trends.
- Expand Live Telemetry Traces with larger pedal and power/torque charts.
- Improve chart legends, time axes, units, empty states and state messaging.
- Complete accessibility, localization, theme, responsive and long-running
  performance review.
- Consider additional fields only after parser evidence, fixtures and contract
  tests exist for them.

## Status tracking

Each milestone uses the following status values:

- `Planned`: scope is defined but implementation has not started.
- `In progress`: implementation is active on this branch.
- `Verified`: implementation and required validation are complete.
- `Blocked`: progress requires an external decision or unavailable evidence.

When a milestone changes status, update this document with the completed
behavior, validation commands, known limitations and deferred work.

## Validation gates

- `cmd /c "pnpm -C frontend run test"`
- `cmd /c "pnpm -C frontend run build"`
- `git diff --check`
- Manual checks at 1280x720, 1920x1080 and 2560x1440.
- Manual checks for dark/light themes, HUD paused state, idle state, live race
  state and repeated expansion/close cycles.

## Deferred work

- New UDP packet offsets or protocol versions.
- Additional telemetry listeners or polling loops.
- Session recorder/replay integration for expanded live cards.
- Independent expansion of FL/FR/RL/RR sub-cards.
- Unparsed fields such as wheel load, tire wear, angular velocity or suspension
  force.
