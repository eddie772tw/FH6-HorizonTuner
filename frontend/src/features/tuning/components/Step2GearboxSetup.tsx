import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { GearingTuner } from './GearingTuner';

interface Step2GearboxSetupProps {
  gearingMethod: 'scientific' | 'custom';
  setGearingMethod: (method: 'scientific' | 'custom') => void;
  customGearingModel: string;
  setCustomGearingModel: (model: string) => void;
  gearingDiscipline: string;
  setGearingDiscipline: (discipline: any) => void;
  basicCustomP: number;
  setBasicCustomP: (p: number) => void;
  pMin: number;
  pMax: number;
  tuning: any;
  updateSection: (section: any, field: string, value: any) => void;
  applyScientificGearing: () => void;
  applyBasicGearing: () => void;
  numGears: number;
  savedTunings: string[];
  loadTuning: (name: string) => void;
}

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

export const Step2GearboxSetup: React.FC<Step2GearboxSetupProps> = ({
  gearingMethod,
  setGearingMethod,
  customGearingModel,
  setCustomGearingModel,
  gearingDiscipline,
  setGearingDiscipline,
  basicCustomP,
  setBasicCustomP,
  pMin,
  pMax,
  tuning,
  updateSection,
  applyScientificGearing,
  applyBasicGearing,
  numGears,
  savedTunings,
  loadTuning
}) => {
  const { t } = useSettings();

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
        Step 2: {t("Gearbox setup & ratio optimization")}
      </h3>

      {/* Control Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>{t("Optimization Method:")}</span>
          <button
            type="button"
            onClick={() => {
              setGearingMethod('scientific');
              applyScientificGearing();
            }}
            style={{
              ...btnStyle,
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              background: gearingMethod === 'scientific' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
              color: gearingMethod === 'scientific' ? 'black' : 'white'
            }}
          >
            {t("AEGO Scientific Model")}
          </button>
          <button
            type="button"
            onClick={() => setGearingMethod('custom')}
            style={{
              ...btnStyle,
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              background: gearingMethod === 'custom' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
              color: gearingMethod === 'custom' ? 'black' : 'white'
            }}
          >
            {t("Custom Tuning")}
          </button>
        </div>

        {savedTunings.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.8rem' }}>{t("Load Preset:")}</span>
            <select
              onChange={e => loadTuning(e.target.value)}
              defaultValue=""
              style={{ background: 'black', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.3rem', borderRadius: '4px', fontSize: '0.8rem' }}
            >
              <option value="" disabled>{t("Select Saved Preset")}</option>
              {savedTunings.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Gearing Tuner Component */}
      <GearingTuner
        numGears={numGears}
        tuning={tuning}
        updateSection={updateSection}
        gearingMethod={gearingMethod}
        customGearingModel={customGearingModel}
        setCustomGearingModel={setCustomGearingModel}
        gearingDiscipline={gearingDiscipline}
        setGearingDiscipline={setGearingDiscipline}
        basicCustomP={basicCustomP}
        setBasicCustomP={setBasicCustomP}
        pMin={pMin}
        pMax={pMax}
        applyScientificGearing={applyScientificGearing}
        applyBasicGearing={applyBasicGearing}
      />
    </div>
  );
};
