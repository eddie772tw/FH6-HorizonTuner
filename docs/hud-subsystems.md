# Controller telemetry card and deferred subsystems

Both controller layouts start centered with X/Y offsets of 0%. Controller X/Y Offset settings accept -50..50% of viewport width/height from that center, independently of the main gauge and its scale. Positive values move right/down and negative values move left/up; the anchor tracks the center of the card. Choose offsets to keep the card clear of the game minimap. The card uses a calibrated scale baseline and rebuilds its backing canvas at the effective zoom and display DPR.

The HUD control panel exposes the Controller Telemetry Card in Telemetry HUD
Elements. It can be toggled alongside any speedometer, with Xbox and PlayStation
DualSense artwork. The telemetry master switch also controls this card; the main
gauge's visibility does not. A card defaults to the lower left and uses the shared
HUD scale and telemetry opacity.

The central telemetry manager owns the card iframe and relays the existing config
and telemetry stream. Changing speedometer or controller layout preserves the
card instance. Disabling the card/master or destroying the manager releases its
iframe. No controller socket, timer, simulated input animation, or gamepad polling
is added. The displayed inputs are Forza steering/pedals/handbrake/gear telemetry,
not a physical controller connection diagnostic. Steering is displayed as a signed
input percentage, not an inferred wheel angle.

Legacy `hudStyle: gamepad_overlay` settings migrate to VFD plus
`elements.showTeleGamepad`, retaining Xbox/DualSense selection. Explicit card
visibility and telemetry master choices are preserved. The card is no longer a
speedometer selection.

Minimap, Touge Pacenotes, Telemetry Data Cards and Speed Sense FX assets and
renderers remain packaged. They have TODO(subsystems) markers for later input
quality and UX evaluation. They are omitted from the public selector, including
WIP and fallback lists. A saved selection of a deferred built-in module migrates
to VFD while retaining module-specific settings. This PR does not expose their
controls or claim that their map, route or dynamics models are validated.
