# Independent HUD elements

Audio Head and Auxiliary Gauges have their own controls and visibility. They share
the launcher's connections with the speedometer and remain visible when the main
gauge or central telemetry cards are hidden. Disabling an element removes its iframe.

Auxiliary Gauges defaults to the right edge center with zero offset. Pick any of the
five faceplates with checkboxes. The selection order is preserved. A row holds at
most 1–5 gauges; additional rows grow upward. Horizontal order fills each row from
left to right, bottom row first. Vertical order fills each column upward before
moving right, within the same row-width limit. All four edge centers, inward edge
offset and signed center offset are available. Offsets are screen pixels; gauge
size follows the shared HUD scale.

The shared `gaugeValueSources` mapping defines `boost`, `oilPressure`,
`oilTemperature` and `waterTemperature`. Each semantic reading has a source field,
source unit and editable description. This mapping is applied by the launcher
before distributing telemetry to any renderer. AEM and Speedhut therefore read
the same remapped boost value, converted to their printed PSI/BAR units. There are
no per-faceplate source overrides. Each face shows the editable description and
actual source field/unit below its original artwork.

The source selector lists numeric fields from the shared HUD telemetry contract,
such as `temp_fl`–`temp_rr`, `tire_temp_avg`, `boost_psi`, `rpm`, `power_kw` and
`fuel_ratio`. Temperature sources accept C/F; pressure sources accept PSI/BAR/kPa.
`native` explicitly interprets a field's numeric value as the semantic output unit
(C for temperature, PSI for pressure). Choosing an unrelated numeric field is an
explicit reinterpretation, not a measurement of that engine sensor.

Forza does not supply water temperature, oil temperature or oil pressure. The
initial water reading uses average tire temperature, labelled accordingly. Oil
temperature and oil pressure start unassigned and show a dash. Missing/non-numeric
samples also show a dash; there is no synthesized oil sensor model. Tire temperature
conversion always uses declared Fahrenheit, without a magnitude heuristic.

Legacy `hudStyle: auxiliary_gauges` configurations migrate to an independent
element alongside VFD. `auxGaugeMode` migrates to the equivalent selection (the
old triple pod becomes AEM, GReddy and Defi). Explicit independent visibility and
empty selections are preserved. Sources and layout persist across speedometer
changes, broadcasts and application restarts.
