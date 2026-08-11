# FH6 In-Game UI Safe Zones for Drift HUD

## Evidence and confidence

This guide is based on four public gameplay captures downloaded locally to
`ref/fh6-ui-layout-reference/` (the `ref/` directory is Git-ignored), plus
the project's in-game Drift HUD captures. These are observed screen regions,
not a formal UI API contract; the exact content changes with activity and HUD
settings.

| Native element | Observed normalized region (x, y, width, height) | Confidence | Layout consequence |
| --- | --- | --- | --- |
| Skill-chain / immediate drift score | `0.38, 0.05, 0.24, 0.17` | High | Do not place a persistent primary panel in the upper center. |
| Drift Zone total | `0.38, 0.80, 0.24, 0.20` | High | Do not use direct bottom-center placement while a Drift Zone is active. |
| Map, route, ANNA/LINK | `0.00, 0.65, 0.28, 0.35` | High | Preserve the lower-left corner. |
| Native speedometer / tachometer | `0.80, 0.66, 0.20, 0.34` | High | A conventional bottom-right secondary requires the native gauge to be hidden or accepted as an intentional overlay. |
| Race progress / timer | `0.00, 0.02, 0.36, 0.22` | Medium | Keep the upper-left clear in races. |
| Race leaderboard | `0.70, 0.02, 0.30, 0.53` | Medium | The Drift/Free-roam Style Meter's right-mid placement conflicts with race leaderboards. |

Primary sources: [Forza Support FH6 FAQ](https://support.forza.net/hc/en-us/articles/48409181275539-Forza-Horizon-6-FAQ), [NoobFeed drift guide](https://www.noobfeed.com/articles/forza-horizon-6-earn-drift-points), [PC Gamer speed-skill capture](https://www.pcgamer.com/games/racing/forza-horizon-6-speed-skills/), and [Hakone Drift Zone guide](https://note.com/61bi_234469/n/nf9bc6949bde5?hl=en). The screenshots themselves are the evidence for placement; the articles are not treated as an authoritative HUD specification.

## Drift HUD decisions

### Primary instrument

GT7's compact bottom-center layer remains a good visual reference, but it is
not a safe direct anchor for FH6 Drift Zone gameplay: FH6 places its total in
the same region. `DriftLayout.getFh6PrimaryAnchor()` uses the lower-left wing
between the observed map boundary (28% viewport width) and Drift Zone total
(40% viewport width). In-game review found the exact-fit version too small,
so the visible frame is doubled while the former left edge becomes the new
horizontal center; its lower edge still clears the Drift Zone score. The key
gear, speed, torque, unit text, and only the essential arc labels are enlarged
or retained so the compact version remains readable. The anchor and scale are
recalculated on resize only, so they add no per-frame allocation to the 60 Hz
Canvas path.

S650 HMI provides the composition rule: its two main dials explicitly leave a
reserved center region (`x=400..880` within a 1280px canvas), and the
`disable` center-information page leaves that region intentionally blank while
the surrounding dials remain active. Drift applies the same idea at screen
level: the lower-center Drift Zone total is a first-class empty region, not
space that a scaled primary may consume.

### Style Meter

The current `right: 4vw; top: 28vh` placement is appropriate for the
free-roam/Drift Zone profile: it remains outside the primary instrument and
does not overlap the lower-left map or lower-right gauge. It is *not* a
universal right-side safe zone, because the race leaderboard occupies the
same column. A future HUD context setting should switch the Style Meter to a
right-mid band around `y = 52-68vh`, or hide it, when a leaderboard is active.
FH6 telemetry does not currently expose a reliable leaderboard-visibility
signal, so this is intentionally not guessed at runtime.

### Secondary instrument

The secondary stays at the established Advanced/VFD-style bottom-right anchor
at 30px padding, per the project decision that it represents the conventional
gauge slot. Its oval has been replaced with a compact cut-corner rectangle and
two Advanced-inspired compound segment arcs: FLOW uses cyan tracking strokes;
RISK uses the same pink/amber danger language as the primary. The central
angle and counter-steer readout remain text-first for quick recognition.

This placement assumes the player has hidden or accepts overlap with FH6's
native speedometer. If the native gauge must always remain visible, moving the
secondary to an alternate profile is a user-facing layout decision rather
than an automatic inference.

## Reference files

- `drift-score-1.jpg`: top-center skill score, lower-left map, lower-right
  gauge.
- `drift-score-2.jpg`: top-center skill score and bottom-center Drift Zone
  total simultaneously.
- `speed-skill.jpg`: top-left race progress, top-center skill score,
  right-side leaderboard, lower-left map, and lower-right gauge.
- `drift-zone-note.png`: Japanese Drift Zone total placement, map, and gauge.
