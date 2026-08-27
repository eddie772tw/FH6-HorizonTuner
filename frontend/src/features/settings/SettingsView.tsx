import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import { applyGeneralUnitSystem, inferGeneralUnitSystem, type GeneralUnitSystem } from '../../utils/gameUnitSettings';
import { McpSettingsCard } from './components/McpSettingsCard';
import { UpdateSettingsCard } from './components/UpdateSettingsCard';

const SettingsView: React.FC = () => {
  const { settings, updateSettings, isLoading, t, availableLanguages } = useSettings();

  const handleGeneralUnitChange = (system: GeneralUnitSystem) => {
    updateSettings({ units: applyGeneralUnitSystem(settings.units, system) });
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100 text-primary">
        <h3>{t("Loading Settings...")}</h3>
      </div>
    );
  }

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto">
      
      {/* Standardized Header Banner (Aligned with OverlayView) */}
      <div className="border-bottom pb-3 mb-2 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h2 className="text-primary fs-4 fw-bold mb-1" style={{ letterSpacing: '0.5px' }}>
              {t("System Settings")}
            </h2>
            <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
              {t("Adjust display language, UDP telemetry options, and unit conversions for the tuning tool. All changes are saved automatically.")}
            </p>
          </div>
          
        </div>
      </div>

      {/* Main Settings Panel */}
      <div className="flex-grow-1 overflow-auto p-2">

        <hr className="my-3" />

        <div className="row g-4">
          
          {/* Left Column: General & Basic Units */}
          <div className="col-12 col-md-6 d-flex flex-column gap-4">
            
            {/* Language Settings */}
            <div className="d-flex flex-column gap-2">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Language Settings")}</h5>
              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-language" className="form-label fw-bold mb-0 fs-6">{t("Language")}</label>
                  <div className="form-text fs-7">{t("Select application display language.")}</div>
                </div>
                <select 
                  id="settings-language"
                  value={settings.language} 
                  onChange={(e) => updateSettings({ language: e.target.value })}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  {availableLanguages.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* General Recording Settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("General Recording Settings")}</h5>
              
              <label htmlFor="chk-dyno-rec" className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3" style={{ cursor: 'pointer' }}>
                <div>
                  <div className="form-check-label fw-bold fs-6">{t("Dyno Recording")}</div>
                  <div className="form-text fs-7">{t("Automatically collect and update engine output curves during full throttle acceleration.")}</div>
                </div>
                <input 
                  type="checkbox" 
                  className="form-check-input ms-auto fs-5"
                  id="chk-dyno-rec"
                  checked={settings.dyno_recording}
                  onChange={(e) => updateSettings({ dyno_recording: e.target.checked })}
                />
              </label>

              <label htmlFor="chk-race-rec" className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3" style={{ cursor: 'pointer' }}>
                <div>
                  <div className="form-check-label fw-bold fs-6">{t("Race Recording")}</div>
                  <div className="form-text fs-7">{t("Record suspension and grip data during races or driving for post-race analysis.")}</div>
                </div>
                <input 
                  type="checkbox" 
                  className="form-check-input ms-auto fs-5"
                  id="chk-race-rec"
                  checked={settings.race_recording}
                  onChange={(e) => updateSettings({ race_recording: e.target.checked })}
                />
              </label>
            </div>

            {/* Experimental Developer Settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Developer Options")}</h5>

              <label htmlFor="chk-developer-tuning" className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3" style={{ cursor: 'pointer' }}>
                <div>
                  <div className="form-check-label fw-bold fs-6">
                    {t("Use Developer Tuning View")}
                  </div>
                  <div className="form-text fs-7">
                    {t("Switches the tuning wizard to the experimental TuningMath input/output view. The legacy view remains the default.")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="form-check-input ms-auto fs-5"
                  id="chk-developer-tuning"
                  checked={settings.developer_tuning_enabled}
                  onChange={(e) => updateSettings({ developer_tuning_enabled: e.target.checked })}
                />
              </label>

              {settings.developer_tuning_enabled && (
                <div className="alert alert-warning mb-0 py-2" role="status">
                  {t("Experimental mode active: verify all outputs in-game before saving a tune.")}
                </div>
              )}
            </div>

            {/* Telemetry UDP Receiver Settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Telemetry Receiver Settings")}</h5>
              
              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-telemetry-ip" className="form-label fw-bold mb-0 fs-6">{t("Telemetry IP")}</label>
                  <div className="form-text fs-7">{t("IP address to listen for Forza UDP telemetry packets.")}</div>
                </div>
                <input 
                  id="settings-telemetry-ip"
                  type="text" 
                  value={settings.telemetry_ip || '0.0.0.0'}
                  onChange={(e) => updateSettings({ telemetry_ip: e.target.value })}
                  className="form-control form-control-sm"
                  style={{ width: '170px' }}
                />
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-telemetry-port" className="form-label fw-bold mb-0 fs-6">{t("Telemetry Port")}</label>
                  <div className="form-text fs-7">{t("Port to listen for Forza UDP telemetry packets (Default: 8000).")}</div>
                </div>
                <input 
                  id="settings-telemetry-port"
                  type="number" 
                  value={settings.telemetry_port || 8000}
                  onChange={(e) => updateSettings({ telemetry_port: parseInt(e.target.value) || 8000 })}
                  className="form-control form-control-sm"
                  style={{ width: '170px' }}
                />
              </div>

              <label
                htmlFor="chk-forward-telemetry"
                className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3 mb-0"
                style={{ cursor: 'pointer' }}
              >
                <div>
                  <div className="form-check-label fw-bold fs-6">{t("Telemetry UDP Forwarding")}</div>
                  <div className="form-text fs-7">{t("Forward raw binary telemetry datagrams to third-party tools (e.g. SimHub or external dashboard).")}</div>
                </div>
                <input
                  type="checkbox"
                  className="form-check-input ms-auto fs-5"
                  id="chk-forward-telemetry"
                  checked={!!settings.forward_telemetry_enabled}
                  onChange={(e) => updateSettings({ forward_telemetry_enabled: e.target.checked })}
                />
              </label>

              {settings.forward_telemetry_enabled && (
                <>
                  <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                    <div>
                      <label htmlFor="settings-forward-host" className="form-label fw-bold mb-0 fs-6">{t("Forward Target Host")}</label>
                      <div className="form-text fs-7">{t("Target IPv4 address to forward raw UDP packets to.")}</div>
                    </div>
                    <input 
                      id="settings-forward-host"
                      type="text" 
                      value={settings.forward_telemetry_host || '127.0.0.1'}
                      onChange={(e) => updateSettings({ forward_telemetry_host: e.target.value })}
                      className="form-control form-control-sm"
                      style={{ width: '170px' }}
                    />
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                    <div>
                      <label htmlFor="settings-forward-port" className="form-label fw-bold mb-0 fs-6">{t("Forward Target Port")}</label>
                      <div className="form-text fs-7">{t("Target UDP port to forward raw UDP packets to (Default: 5300).")}</div>
                    </div>
                    <input 
                      id="settings-forward-port"
                      type="number" 
                      value={settings.forward_telemetry_port ?? 5300}
                      onChange={(e) => updateSettings({ forward_telemetry_port: parseInt(e.target.value) || 5300 })}
                      className="form-control form-control-sm"
                      style={{ width: '170px' }}
                    />
                  </div>
                </>
              )}
            </div>

          </div>

          {/* Right Column: Pressures, Gearing & Engine Units */}
          <div className="col-12 col-md-6 d-flex flex-column gap-4">
            
            {/* Game-aligned unit settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Game Unit Settings")}</h5>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-general" className="form-label fw-bold mb-0 fs-6">{t("General Units")}</label>
                  <div className="form-text fs-7">{t("Controls speed, weight, temperature, pressure, height, force, and torque across the app.")}</div>
                </div>
                <select 
                  id="settings-unit-general"
                  value={inferGeneralUnitSystem(settings.units)}
                  onChange={(e) => handleGeneralUnitChange(e.target.value as GeneralUnitSystem)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="metric">{t("Metric")}</option>
                  <option value="imperial">{t("Imperial")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-power" className="form-label fw-bold mb-0 fs-6">{t("Power Units")}</label>
                  <div className="form-text fs-7">{t("Matches the game's independent horsepower unit option.")}</div>
                </div>
                <select 
                  id="settings-unit-power"
                  value={settings.units.power}
                  onChange={(e) => updateSettings({ units: { power: e.target.value as 'kw' | 'hp' | 'ps' } })}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="hp">{t("Horsepower (hp)")}</option>
                  <option value="kw">{t("Kilowatt (kW)")}</option>
                  <option value="ps">{t("Metric Horsepower (PS)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-spring" className="form-label fw-bold mb-0 fs-6">{t("Spring Units")}</label>
                  <div className="form-text fs-7">{t("Matches the game's independent spring-rate unit option.")}</div>
                </div>
                <select 
                  id="settings-unit-spring"
                  value={settings.units.springRate}
                  onChange={(e) => updateSettings({ units: { springRate: e.target.value as 'kgfmm' | 'lbsin' } })}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kgfmm">{t("Metric (kgf/mm)")}</option>
                  <option value="lbsin">{t("Imperial (lbs/in)")}</option>
                </select>
              </div>
            </div>

          </div>

        </div>

        {/* Keep secondary settings aligned to the same responsive two-column grid. */}
        <div className="row g-4 mt-0">
          <div className="col-12 col-md-6">
            <McpSettingsCard />
          </div>
          <div className="col-12 col-md-6">
            <UpdateSettingsCard />
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsView;


