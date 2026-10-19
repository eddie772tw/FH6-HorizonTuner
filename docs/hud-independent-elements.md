# Independent HUD elements

Audio Head and Auxiliary Gauges have their own controls and visibility. They share
the launcher's connections with the speedometer and remain visible when the main
gauge or central telemetry cards are hidden. Disabling an element removes its iframe.

Auxiliary Gauges defaults to the right edge center with zero offset. Pick any of the
five faceplates with checkboxes. The selection order is preserved. The count limit
is per row in horizontal mode and per column in vertical mode (1–5 gauges). The
settings label changes with the arrangement; the stored `auxGaugeMaxPerRow` key
is retained for configuration compatibility. Incomplete rows align to the left/right edge, or stay centered
when anchored at the top/bottom. Top anchoring grows downward; bottom and side
anchoring grow upward. Horizontal order fills each row left to right. Vertical
order fills columns up to the selected capacity, adding columns toward the screen
interior from a side edge. Top anchoring fills columns downward; other edges fill
them upward. All four edge centers, inward edge
offset and signed center offset are available. Offsets are screen pixels; gauge
size follows the shared HUD scale.

The shared `gaugeValueSources` mapping defines `boost`, `oilPressure`,
`oilTemperature` and `waterTemperature`. Each semantic reading has a source field,
source unit and editable description. This mapping is applied by the launcher
before distributing telemetry to any renderer. AEM and Speedhut therefore read
the same remapped boost value, converted to their printed PSI/BAR units. There are
no per-faceplate source overrides. Descriptions and source field/unit stay in the
settings and accessible canvas description; the HUD shows only the original
faceplate and its reading, without additional white caption lines underneath.

Descriptions and offsets keep an editing draft; press Enter or leave the field to
save. Spaces in a multiword description remain intact while typing.

The source selector lists numeric fields from the shared HUD telemetry contract,
such as `temp_fl`–`temp_rr`, `tire_temp_avg`, `boost_psi`, `rpm`, `power_kw` and
`fuel_ratio`. Temperature sources accept C/F; pressure sources accept PSI/BAR/kPa.
`native` explicitly interprets a field's numeric value as the semantic output unit
(C for temperature, PSI for pressure). Choosing an unrelated numeric field is an
explicit reinterpretation, not a measurement of that engine sensor.

Forza does not supply water temperature, oil temperature or oil pressure. Both
temperature readings default to average tire temperature, labelled accordingly;
conversion always uses declared Fahrenheit, without a magnitude heuristic.
Oil pressure defaults to the shared virtual source `estimated_oil_pressure_psi`.
Its visual load proxy is clamped throttle × clamped RPM/maxRPM; the target is
20 + 60 × load PSI while running, and zero when stopped. This is an explicitly
simulated gauge reading, not a measured sensor or a vehicle tuning model.
The launcher applies a first-order response with a 1.5-second time constant using
monotonic elapsed time, independent of render frequency. Missing inputs, leaving
live race telemetry, switching vehicles or restarting the clock clear its state.
The same damped value is distributed to every faceplate; temperature substitutes
are read directly and do not use the pressure filter. A custom source bypasses
the simulated reading and its damping. Missing/non-numeric or deliberately
unassigned sources show a dash. Exact former unassigned defaults migrate to the
new defaults, while deliberately changed descriptions or sources are preserved.

Legacy `hudStyle: auxiliary_gauges` configurations migrate to an independent
element alongside VFD. `auxGaugeMode` migrates to the equivalent selection (the
old triple pod becomes AEM, GReddy and Defi). Explicit independent visibility and
empty selections are preserved. Sources and layout persist across speedometer
changes, broadcasts and application restarts.
