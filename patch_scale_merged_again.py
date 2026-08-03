import re

file_path = "frontend/src/features/overlay_control/OverlayView.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_scale_ui = """            {config.telemetrySideBySideCharts ? (
              {/* Merged Charts Scale */}"""

if old_scale_ui not in content:
    old_scale_ui2 = """            {/* Pedal Trace Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Pedal Trace Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPedalScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryPedalScale ?? 1.0}
                onChange={(e) => handlePedalScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {/* Power / Torque Chart Scale */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Power / Torque Scale")}:</span>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPowerTorqueScale ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.telemetryPowerTorqueScale ?? 1.0}
                onChange={(e) => handlePowerTorqueScaleChange(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>"""

    new_scale_ui2 = """            {config.telemetrySideBySideCharts ? (
              <div key="merged-charts-scale">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Merged Charts Scale")}:</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPedalScale ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={config.telemetryPedalScale ?? 1.0}
                  onChange={(e) => handleMergedScaleChange(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              </div>
            ) : (
              <React.Fragment key="individual-charts-scale">
                {/* Pedal Trace Scale */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Pedal Trace Scale")}:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPedalScale ?? 1.0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={config.telemetryPedalScale ?? 1.0}
                    onChange={(e) => handlePedalScaleChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>

                {/* Power / Torque Chart Scale */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{t("Power / Torque Scale")}:</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>{Math.round((config.telemetryPowerTorqueScale ?? 1.0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={config.telemetryPowerTorqueScale ?? 1.0}
                    onChange={(e) => handlePowerTorqueScaleChange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                </div>
              </React.Fragment>
            )}"""

    content = content.replace(old_scale_ui2, new_scale_ui2)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    print("Patched merged scale UI again")
