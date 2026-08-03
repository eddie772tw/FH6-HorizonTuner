import React, { memo } from 'react';
import { useSettings } from '../../../context/SettingsContext';

interface SuspensionTunerProps {
  tuning: any;
  updateSection: (section: any, field: string, value: any) => void;
}

const smallInputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  padding: '0.2rem',
  borderRadius: '4px',
  width: '50px',
  textAlign: 'right'
};

const SuspensionTunerComponent: React.FC<SuspensionTunerProps> = ({ tuning, updateSection }) => {
  const { convertSpringRate, convertSpringRateToKgfmm, convertHeight, convertHeightToCm, t } = useSettings();

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <h4 style={{ margin: '0 0 0.8rem 0', color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem', fontSize: '0.95rem' }}>
        🔧 {t("Suspension Settings")}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
        {/* Anti-Roll Bars */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Anti-Roll Bars")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.arb.front} 
              onChange={e => updateSection('arb', 'front', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.arb.rear} 
              onChange={e => updateSection('arb', 'rear', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
          </div>
        </div>

        {/* Spring Stiffness */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Spring Stiffness")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
            <input 
              type="number" step="0.1" 
              value={Number(convertSpringRate(tuning.springs.front).value.toFixed(1))} 
              onChange={e => updateSection('springs', 'front', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0.0))}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
            <input 
              type="number" step="0.1" 
              value={Number(convertSpringRate(tuning.springs.rear).value.toFixed(1))} 
              onChange={e => updateSection('springs', 'rear', convertSpringRateToKgfmm(parseFloat(e.target.value) || 0.0))}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>{convertSpringRate(1).label}</span>
          </div>
        </div>

        {/* Ride Height */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Ride Height")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
            <input 
              type="number" step="0.1" 
              value={Number(convertHeight(tuning.springs.heightF).value.toFixed(1))} 
              onChange={e => updateSection('springs', 'heightF', convertHeightToCm(parseFloat(e.target.value) || 0.0))}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
            <input 
              type="number" step="0.1" 
              value={Number(convertHeight(tuning.springs.heightR).value.toFixed(1))} 
              onChange={e => updateSection('springs', 'heightR', convertHeightToCm(parseFloat(e.target.value) || 0.0))}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }}>{convertHeight(1).label}</span>
          </div>
        </div>

        {/* Rebound Damping */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Rebound Damping")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.damping.reboundF} 
              onChange={e => updateSection('damping', 'reboundF', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.damping.reboundR} 
              onChange={e => updateSection('damping', 'reboundR', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
          </div>
        </div>

        {/* Bump Damping */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Bump Damping")}</span>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ color: 'gray', fontSize: '0.75rem' }}>{t("Front:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.damping.bumpF} 
              onChange={e => updateSection('damping', 'bumpF', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.2rem' }}>{t("Rear:")}</span>
            <input 
              type="number" step="0.1" 
              value={tuning.damping.bumpR} 
              onChange={e => updateSection('damping', 'bumpR', parseFloat(e.target.value) || 0.0)}
              style={smallInputStyle}
            />
            <span style={{ color: 'gray', fontSize: '0.75rem', marginLeft: '0.25rem', width: '25px', textAlign: 'left' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const SuspensionTuner = memo(SuspensionTunerComponent);
