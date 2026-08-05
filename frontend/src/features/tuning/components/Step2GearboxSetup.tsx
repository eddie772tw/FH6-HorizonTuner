import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { GearingTuner } from './GearingTuner';

interface Step2GearboxSetupProps {
  tuning: any;
  updateSection: (section: any, field: string, value: any) => void;
  numGears: number;
  savedTunings: string[];
  loadTuning: (name: string) => void;
  carParams?: any;
}

export const Step2GearboxSetup: React.FC<Step2GearboxSetupProps> = ({
  tuning,
  updateSection,
  numGears,
  savedTunings,
  loadTuning,
  carParams
}) => {
  const { t } = useSettings();

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>
          Step 2: {t("Gearbox setup & AEGO ratio optimization")}
        </h3>

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

      {/* Main Gearing Tuner Component - Pure Automated AEGO with LineChart */}
      <GearingTuner
        numGears={numGears}
        tuning={tuning}
        updateSection={updateSection}
        carParams={carParams}
      />
    </div>
  );
};
