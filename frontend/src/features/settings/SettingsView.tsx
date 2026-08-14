import React from 'react';
import { useSettings, UnitSettings } from '../../context/SettingsContext';
import { McpSettingsCard } from './components/McpSettingsCard';

const SettingsView: React.FC = () => {
  const { settings, updateSettings, isLoading, t, availableLanguages } = useSettings();

  const handleUnitChange = (key: keyof UnitSettings, value: string) => {
    updateSettings({
      units: {
        [key]: value
      }
    });
  };

  const applyPreset = (preset: 'metric' | 'imperial') => {
    if (preset === 'metric') {
      updateSettings({
        units: {
          speed: 'kmh',
          weight: 'kg',
          temperature: 'C',
          tirePressure: 'bar',
          boostPressure: 'bar',
          springRate: 'kgfmm',
          rideHeight: 'cm',
          suspensionForce: 'kgf',
          power: 'kw',
          torque: 'nm'
        }
      });
    } else {
      updateSettings({
        units: {
          speed: 'mph',
          weight: 'lbs',
          temperature: 'F',
          tirePressure: 'psi',
          boostPressure: 'psi',
          springRate: 'lbsin',
          rideHeight: 'in',
          suspensionForce: 'lbf',
          power: 'hp',
          torque: 'lbft'
        }
      });
    }
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
          
          {/* Preset Buttons */}
          <div className="d-flex gap-2">
            <button 
              onClick={() => applyPreset('metric')}
              className="btn btn-outline-primary fw-bold px-3 py-2"
            >
              {t("All Metric")}
            </button>
            <button 
              onClick={() => applyPreset('imperial')}
              className="btn btn-outline-danger fw-bold px-3 py-2"
            >
              {t("All Imperial")}
            </button>
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
              
              <div className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3">
                <div>
                  <label className="form-check-label fw-bold fs-6" htmlFor="chk-dyno-rec">{t("Dyno Recording")}</label>
                  <div className="form-text fs-7">{t("Automatically collect and update engine output curves during full throttle acceleration.")}</div>
                </div>
                <input 
                  type="checkbox" 
                  className="form-check-input ms-auto fs-5"
                  id="chk-dyno-rec"
                  checked={settings.dyno_recording}
                  onChange={(e) => updateSettings({ dyno_recording: e.target.checked })}
                />
              </div>

              <div className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3">
                <div>
                  <label className="form-check-label fw-bold fs-6" htmlFor="chk-race-rec">{t("Race Recording")}</label>
                  <div className="form-text fs-7">{t("Record suspension and grip data during races or driving for post-race analysis.")}</div>
                </div>
                <input 
                  type="checkbox" 
                  className="form-check-input ms-auto fs-5"
                  id="chk-race-rec"
                  checked={settings.race_recording}
                  onChange={(e) => updateSettings({ race_recording: e.target.checked })}
                />
              </div>
            </div>

            {/* Experimental Developer Settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Developer Options")}</h5>

              <div className="form-check form-switch d-flex justify-content-between align-items-center ps-0 border-bottom pb-3">
                <div>
                  <label className="form-check-label fw-bold fs-6" htmlFor="chk-developer-tuning">
                    {t("Use Developer Tuning View")}
                  </label>
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
              </div>

              {settings.developer_tuning_enabled && (
                <div className="alert alert-warning mb-0 py-2" role="status">
                  {t("Experimental mode active: verify all outputs in-game before saving a tune.")}
                </div>
              )}
            </div>

            {/* MCP Server & AI Integration */}
            <McpSettingsCard />

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
            </div>

            {/* Basic Units */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("General Vehicle Units")}</h5>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-speed" className="form-label fw-bold mb-0 fs-6">{t("Speed")}</label>
                  <div className="form-text fs-7">{t("Used for current speed, top speed, and gearing graphs.")}</div>
                </div>
                <select 
                  id="settings-unit-speed"
                  value={settings.units.speed} 
                  onChange={(e) => handleUnitChange('speed', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kmh">{t("Metric (km/h)")}</option>
                  <option value="mph">{t("Imperial (mph)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-weight" className="form-label fw-bold mb-0 fs-6">{t("Weight")}</label>
                  <div className="form-text fs-7">{t("Used for vehicle parameters and tuning calculator.")}</div>
                </div>
                <select 
                  id="settings-unit-weight"
                  value={settings.units.weight} 
                  onChange={(e) => handleUnitChange('weight', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kg">{t("Metric (kg)")}</option>
                  <option value="lbs">{t("Imperial (lbs)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-temperature" className="form-label fw-bold mb-0 fs-6">{t("Temperature")}</label>
                  <div className="form-text fs-7">{t("Used for tire temperature and all engine temperature settings.")}</div>
                </div>
                <select 
                  id="settings-unit-temperature"
                  value={settings.units.temperature} 
                  onChange={(e) => handleUnitChange('temperature', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="C">{t("Metric (Celsius °C)")}</option>
                  <option value="F">{t("Imperial (Fahrenheit °F)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-rideHeight" className="form-label fw-bold mb-0 fs-6">{t("Ride Height")}</label>
                  <div className="form-text fs-7">{t("Used for suspension ride height sliders.")}</div>
                </div>
                <select 
                  id="settings-unit-rideHeight"
                  value={settings.units.rideHeight} 
                  onChange={(e) => handleUnitChange('rideHeight', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="cm">{t("Metric (cm)")}</option>
                  <option value="in">{t("Imperial (in)")}</option>
                </select>
              </div>
            </div>

          </div>

          {/* Right Column: Pressures, Gearing & Engine Units */}
          <div className="col-12 col-md-6 d-flex flex-column gap-4">
            
            {/* Pressure Settings */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Pressure Settings")}</h5>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-tirePressure" className="form-label fw-bold mb-0 fs-6">{t("Tire Pressure")}</label>
                  <div className="form-text fs-7">{t("Used for four-wheel tire pressure tuning and live telemetry.")}</div>
                </div>
                <select 
                  id="settings-unit-tirePressure"
                  value={settings.units.tirePressure} 
                  onChange={(e) => handleUnitChange('tirePressure', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="bar">{t("Metric (bar)")}</option>
                  <option value="psi">{t("Imperial (psi)")}</option>
                  <option value="kpa">{t("Metric (kPa)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-boostPressure" className="form-label fw-bold mb-0 fs-6">{t("Boost Pressure")}</label>
                  <div className="form-text fs-7">{t("Used for the boost gauge on the dashboard.")}</div>
                </div>
                <select 
                  id="settings-unit-boostPressure"
                  value={settings.units.boostPressure} 
                  onChange={(e) => handleUnitChange('boostPressure', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="psi">{t("Imperial (psi)")}</option>
                  <option value="bar">{t("Metric (bar)")}</option>
                  <option value="kpa">{t("Metric (kPa)")}</option>
                </select>
              </div>
            </div>

            {/* Chassis & Mechanical Units */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Chassis & Mechanical Units")}</h5>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-springRate" className="form-label fw-bold mb-0 fs-6">{t("Spring Rate")}</label>
                  <div className="form-text fs-7">{t("Used for spring stiffness sliders and calculators.")}</div>
                </div>
                <select 
                  id="settings-unit-springRate"
                  value={settings.units.springRate} 
                  onChange={(e) => handleUnitChange('springRate', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kgfmm">{t("Metric (kgf/mm)")}</option>
                  <option value="lbsin">{t("Imperial (lbs/in)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-suspensionForce" className="form-label fw-bold mb-0 fs-6">{t("Suspension Force")}</label>
                  <div className="form-text fs-7">{t("Used for anti-roll bars or suspension load analysis.")}</div>
                </div>
                <select 
                  id="settings-unit-suspensionForce"
                  value={settings.units.suspensionForce} 
                  onChange={(e) => handleUnitChange('suspensionForce', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kgf">{t("Metric (kgf)")}</option>
                  <option value="lbf">{t("Imperial (lbf)")}</option>
                </select>
              </div>
            </div>

            {/* Power & Torque */}
            <div className="d-flex flex-column gap-3">
              <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">{t("Engine Power Output")}</h5>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-power" className="form-label fw-bold mb-0 fs-6">{t("Power")}</label>
                  <div className="form-text fs-7">{t("Used for vehicle parameters and dashboard max horsepower.")}</div>
                </div>
                <select 
                  id="settings-unit-power"
                  value={settings.units.power} 
                  onChange={(e) => handleUnitChange('power', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="kw">{t("Kilowatt (kW)")}</option>
                  <option value="hp">{t("Imperial Horsepower (hp)")}</option>
                  <option value="ps">{t("Metric Horsepower (PS)")}</option>
                </select>
              </div>

              <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                <div>
                  <label htmlFor="settings-unit-torque" className="form-label fw-bold mb-0 fs-6">{t("Torque")}</label>
                  <div className="form-text fs-7">{t("Used for dyno torque curves and live torque readout.")}</div>
                </div>
                <select 
                  id="settings-unit-torque"
                  value={settings.units.torque} 
                  onChange={(e) => handleUnitChange('torque', e.target.value)}
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                >
                  <option value="nm">{t("Newton-Meter (N·m)")}</option>
                  <option value="lbft">{t("Pound-Foot (lb-ft)")}</option>
                </select>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default SettingsView;


