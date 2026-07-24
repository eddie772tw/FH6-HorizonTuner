import React from 'react';

interface SpringSuspensionCardProps {
  springs: { front: number; rear: number; heightF: number; heightR: number };
  onChange: (val: { front: number; rear: number; heightF: number; heightR: number }) => void;
  convertSpringRate: (val: number) => number;
  convertSpringRateToKgfmm: (val: number) => number;
  unitLabel: string;
  t: (key: string, fallback?: string) => string;
}

export const SpringSuspensionCard: React.FC<SpringSuspensionCardProps> = ({
  springs,
  onChange,
  convertSpringRate,
  convertSpringRateToKgfmm,
  unitLabel,
  t,
}) => {
  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>{t('springs_and_height', 'Springs & Ride Height')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('front_spring', 'Front Spring')} ({unitLabel})</label>
          <input
            type="number"
            step="0.1"
            value={convertSpringRate(springs.front)}
            onChange={(e) => onChange({ ...springs, front: convertSpringRateToKgfmm(parseFloat(e.target.value) || 0) })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('rear_spring', 'Rear Spring')} ({unitLabel})</label>
          <input
            type="number"
            step="0.1"
            value={convertSpringRate(springs.rear)}
            onChange={(e) => onChange({ ...springs, rear: convertSpringRateToKgfmm(parseFloat(e.target.value) || 0) })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
      </div>
    </div>
  );
};
