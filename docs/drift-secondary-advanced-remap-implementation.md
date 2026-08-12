# Drift secondary: Advanced-style remap increment

Date: 2026-08-12

This increment temporarily uses the Advanced HUD Canvas grammar as the visual
baseline for the Drift secondary instrument. It is intentionally implemented
inside the existing Drift Canvas and HUDCore frame path; it does not create a
second telemetry source, polling loop, or DOM overlay lifecycle.

## Active mapping

| Advanced visual element | Drift meaning | Display behavior |
| --- | --- | --- |
| Outer RPM/superellipse arc | Throttle input | Segmented 0--100% arc with active fill, needle, and `THROTTLE` label |
| Inner HP arc | Brake input | Five-segment inset arc with red active fill and percentage |
| Inner TQ arc | Clutch input | Five-segment inset arc with white active fill and percentage |
| Inner Boost arc | Handbrake input | Five-segment inset arc with amber active fill and percentage |
| Advanced wheel indicators | Four-wheel grip/slip status | Four compact FL/FR/RL/RR light groups; high slip and lockup use red |
| Advanced speed/gear text | Drift supporting readout | Speed, unit, gear and LC state only |

The active renderer no longer displays the previous angle, counter, `FLOW`,
`RISK`, `HOLD`, torque, power, or boost text. Style Meter remains the owner of
style/risk event language, while TelemetryView and telemetry cards remain the
owners of detailed tire, suspension, replay and diagnostic information.

## Attitude indicator

The former center text block is replaced by a compact Canvas glyph:

- Cyan arrow: vehicle heading reference, fixed toward the front of the car.
- Amber arrow: relative travel direction, calculated from velocity heading minus
  the telemetry `Yaw` heading.
- Four tire arrows: each arrow direction comes from `TireSlipAngle` and each
  arrow length comes from absolute `TireSlipRatio`.
- Red tire arrows/lights: high slip or an existing shared `lockup` flag.

`TireSlipAngle` is converted from the existing radian frame to degrees and
clamped to a visual +/-45 degrees. Slip-ratio length currently treats 0.5 as
the strong-slip reference point. This is a display normalization only; it does
not alter the telemetry contract.

## Review boundary

The implementation can be reviewed locally for geometry and syntax, but the
following require a real FH6 screenshot or frame capture before being treated
as final:

1. The sign of `Yaw` versus velocity heading on both left and right turns.
2. Whether 0.5 is the right visual saturation point for tire slip ratio across
   different cars and surfaces.
3. Whether the compact attitude glyph and four grip-light groups remain legible
   at Advanced/VFD conventional secondary scale.
4. Whether `lcState` receives armed/launched transitions in the target launch
   control flow.

