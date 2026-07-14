import React from 'react';
import { useSettings, UnitSettings } from '../context/SettingsContext';

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
        <h3>{t("Loading Settings...")}</h3>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.4)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    padding: '0.5rem 0.8rem',
    fontSize: '0.9rem',
    width: '170px',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  };

  const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '0.8rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  };

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    margin: 0,
    color: 'var(--primary)',
    fontSize: '1.05rem',
    fontWeight: 600,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '0.4rem',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden', paddingRight: '0.5rem' }}>
      
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>{t("System Settings")}</h2>
        </div>
        
        {/* Preset Buttons */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => applyPreset('metric')}
            style={{
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid var(--primary)',
              color: 'var(--primary)',
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'all 0.3s',
            }}
          >
            {t("All Metric")}
          </button>
          <button 
            onClick={() => applyPreset('imperial')}
            style={{
              background: 'rgba(255, 0, 60, 0.1)',
              border: '1px solid var(--secondary)',
              color: 'var(--secondary)',
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'all 0.3s',
            }}
          >
            {t("All Imperial")}
          </button>
        </div>
      </div>

      {/* Main Settings Panel */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, overflowY: 'auto' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{t("System Settings & Unit Conversion")}</h3>
          <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {t("Adjust unit conversions for the tuning tool. All changes are saved automatically.")}
          </p>
        </div>

        <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: 0 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
          
          {/* Left Column: General & Basic Units */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* General Settings */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>{t("General Recording Settings")}</h4>
              
              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Dyno Recording")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Automatically collect and update engine output curves during full throttle acceleration.")}</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={settings.dyno_recording}
                  onChange={(e) => updateSettings({ dyno_recording: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Race Recording")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Record suspension and grip data during races or driving for post-race analysis.")}</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={settings.race_recording}
                  onChange={(e) => updateSettings({ race_recording: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              </div>

              {/* Language Selection */}
              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Language")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Select application display language.")}</span>
                </div>
                <select 
                  value={settings.language} 
                  onChange={(e) => updateSettings({ language: e.target.value })}
                  style={selectStyle}
                >
                  {availableLanguages.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              <hr style={{ borderColor: 'rgba(255,255,255,0.05)', margin: '0.5rem 0' }} />

              {/* Telemetry UDP Settings */}
              <div style={sectionStyle}>
                <h4 style={sectionTitleStyle}>{t("Telemetry Receiver Settings")}</h4>
                
                <div style={settingRowStyle}>
                  <div>
                    <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Telemetry IP")}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("IP address to listen for Forza UDP telemetry packets.")}</span>
                  </div>
                  <input 
                    type="text" 
                    value={settings.telemetry_ip || '0.0.0.0'}
                    onChange={(e) => updateSettings({ telemetry_ip: e.target.value })}
                    className="cyber-input"
                    style={{ 
                      width: '170px', 
                      background: 'rgba(0,0,0,0.4)', 
                      color: 'white', 
                      border: '1px solid rgba(255,255,255,0.2)', 
                      borderRadius: '6px', 
                      padding: '0.5rem 0.8rem', 
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={settingRowStyle}>
                  <div>
                    <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Telemetry Port")}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Port to listen for Forza UDP telemetry packets (Default: 8000).")}</span>
                  </div>
                  <input 
                    type="number" 
                    value={settings.telemetry_port || 8000}
                    onChange={(e) => updateSettings({ telemetry_port: parseInt(e.target.value) || 8000 })}
                    className="cyber-input"
                    style={{ 
                      width: '170px', 
                      background: 'rgba(0,0,0,0.4)', 
                      color: 'white', 
                      border: '1px solid rgba(255,255,255,0.2)', 
                      borderRadius: '6px', 
                      padding: '0.5rem 0.8rem', 
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Basic Units */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>{t("General Vehicle Units")}</h4>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Speed")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for current speed, top speed, and gearing graphs.")}</span>
                </div>
                <select 
                  value={settings.units.speed} 
                  onChange={(e) => handleUnitChange('speed', e.target.value)}
                  style={selectStyle}
                >
                  <option value="kmh">{t("Metric (km/h)")}</option>
                  <option value="mph">{t("Imperial (mph)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Weight")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for vehicle parameters and tuning calculator.")}</span>
                </div>
                <select 
                  value={settings.units.weight} 
                  onChange={(e) => handleUnitChange('weight', e.target.value)}
                  style={selectStyle}
                >
                  <option value="kg">{t("Metric (kg)")}</option>
                  <option value="lbs">{t("Imperial (lbs)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Temperature")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for tire temperature and all engine temperature settings.")}</span>
                </div>
                <select 
                  value={settings.units.temperature} 
                  onChange={(e) => handleUnitChange('temperature', e.target.value)}
                  style={selectStyle}
                >
                  <option value="C">{t("Metric (Celsius °C)")}</option>
                  <option value="F">{t("Imperial (Fahrenheit °F)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Ride Height")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for suspension ride height sliders.")}</span>
                </div>
                <select 
                  value={settings.units.rideHeight} 
                  onChange={(e) => handleUnitChange('rideHeight', e.target.value)}
                  style={selectStyle}
                >
                  <option value="cm">{t("Metric (cm)")}</option>
                  <option value="in">{t("Imperial (in)")}</option>
                </select>
              </div>
            </div>

          </div>

          {/* Right Column: Pressures, Gearing & Engine Units */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Pressure Settings */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>{t("Pressure Settings")}</h4>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Tire Pressure")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for four-wheel tire pressure tuning and live telemetry.")}</span>
                </div>
                <select 
                  value={settings.units.tirePressure} 
                  onChange={(e) => handleUnitChange('tirePressure', e.target.value)}
                  style={selectStyle}
                >
                  <option value="bar">{t("Metric (bar)")}</option>
                  <option value="psi">{t("Imperial (psi)")}</option>
                  <option value="kpa">{t("Metric (kPa)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Boost Pressure")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for the boost gauge on the dashboard.")}</span>
                </div>
                <select 
                  value={settings.units.boostPressure} 
                  onChange={(e) => handleUnitChange('boostPressure', e.target.value)}
                  style={selectStyle}
                >
                  <option value="psi">{t("Imperial (psi)")}</option>
                  <option value="bar">{t("Metric (bar)")}</option>
                  <option value="kpa">{t("Metric (kPa)")}</option>
                </select>
              </div>
            </div>

            {/* Gearing & Suspension */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>{t("Chassis & Mechanical Units")}</h4>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Spring Rate")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for spring stiffness sliders and calculators.")}</span>
                </div>
                <select 
                  value={settings.units.springRate} 
                  onChange={(e) => handleUnitChange('springRate', e.target.value)}
                  style={selectStyle}
                >
                  <option value="kgfmm">{t("Metric (kgf/mm)")}</option>
                  <option value="lbsin">{t("Imperial (lbs/in)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Suspension Force")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for anti-roll bars or suspension load analysis.")}</span>
                </div>
                <select 
                  value={settings.units.suspensionForce} 
                  onChange={(e) => handleUnitChange('suspensionForce', e.target.value)}
                  style={selectStyle}
                >
                  <option value="kgf">{t("Metric (kgf)")}</option>
                  <option value="lbf">{t("Imperial (lbf)")}</option>
                </select>
              </div>
            </div>

            {/* Power & Torque */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>{t("Engine Power Output")}</h4>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Power")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for vehicle parameters and dashboard max horsepower.")}</span>
                </div>
                <select 
                  value={settings.units.power} 
                  onChange={(e) => handleUnitChange('power', e.target.value)}
                  style={selectStyle}
                >
                  <option value="kw">{t("Kilowatt (kW)")}</option>
                  <option value="hp">{t("Imperial Horsepower (hp)")}</option>
                  <option value="ps">{t("Metric Horsepower (PS)")}</option>
                </select>
              </div>

              <div style={settingRowStyle}>
                <div>
                  <strong style={{ display: 'block', color: 'white', fontSize: '0.9rem' }}>{t("Torque")}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t("Used for dyno torque curves and live torque readout.")}</span>
                </div>
                <select 
                  value={settings.units.torque} 
                  onChange={(e) => handleUnitChange('torque', e.target.value)}
                  style={selectStyle}
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

