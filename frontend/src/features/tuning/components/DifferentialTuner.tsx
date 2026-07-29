import React from 'react';
import { useSettings } from '../../../context/SettingsContext';

interface DiffTuning {
  accelF: number;
  decelF: number;
  accelR: number;
  decelR: number;
  center: number;
}

interface DifferentialTunerProps {
  tuning: { diff: DiffTuning };
  tuningMode: 'recommended' | 'custom';
  updateSection: (section: any, field: string, value: any) => void;
  drivetrain?: string;
}

const smallInputStyle: React.CSSProperties = {
  background: 'black',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '4px',
  padding: '0.2rem',
  width: '55px',
  textAlign: 'right',
  fontSize: '0.8rem',
  outline: 'none'
};

export const DifferentialTuner: React.FC<DifferentialTunerProps> = React.memo(({ tuning, tuningMode, updateSection, drivetrain }) => {
  const { t } = useSettings();

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', fontSize: '0.95rem' }}>
        {t("Differential Settings")}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
        {/* Front Differential */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Front Differential")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Accel:")}</span>
            <input 
              type="number" step="1" 
              value={tuning.diff.accelF} 
              onChange={e => updateSection('diff', 'accelF', parseInt(e.target.value) || 0)}
              disabled={tuningMode === 'recommended'}
              style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Decel:")}</span>
            <input 
              type="number" step="1" 
              value={tuning.diff.decelF} 
              onChange={e => updateSection('diff', 'decelF', parseInt(e.target.value) || 0)}
              disabled={tuningMode === 'recommended'}
              style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>%</span>
          </div>
        </div>

        {/* Rear Differential */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Rear Differential")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Accel:")}</span>
            <input 
              type="number" step="1" 
              value={tuning.diff.accelR} 
              onChange={e => updateSection('diff', 'accelR', parseInt(e.target.value) || 0)}
              disabled={tuningMode === 'recommended'}
              style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Decel:")}</span>
            <input 
              type="number" step="1" 
              value={tuning.diff.decelR} 
              onChange={e => updateSection('diff', 'decelR', parseInt(e.target.value) || 0)}
              disabled={tuningMode === 'recommended'}
              style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>%</span>
          </div>
        </div>

        {/* Center Balance */}
        {drivetrain === 'AWD' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
            <span>{t("Center Balance")}</span>
            <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
              <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Rear:")}</span>
              <input 
                type="number" step="1" 
                value={tuning.diff.center} 
                onChange={e => updateSection('diff', 'center', parseInt(e.target.value) || 0)}
                disabled={tuningMode === 'recommended'}
                style={{ ...smallInputStyle, width: '40px', opacity: tuningMode === 'recommended' ? 0.5 : 1, cursor: tuningMode === 'recommended' ? 'not-allowed' : 'text' }} 
              />
              <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '45px', textAlign: 'left' }}>% Rear</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem', opacity: 0.25 }}>
            <span>{t("Center Balance")}</span>
            <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
              <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Rear:")}</span>
              <input 
                type="text" 
                value="N/A" 
                disabled={true}
                style={{ ...smallInputStyle, width: '40px', textAlign: 'center', cursor: 'not-allowed' }} 
              />
              <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '45px', textAlign: 'left' }}>% Rear</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

DifferentialTuner.displayName = 'DifferentialTuner';
