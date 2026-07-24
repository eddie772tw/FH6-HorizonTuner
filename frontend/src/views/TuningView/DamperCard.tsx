import React from 'react';

interface DamperCardProps {
  damping: { reboundF: number; reboundR: number; bumpF: number; bumpR: number };
  onChange: (val: { reboundF: number; reboundR: number; bumpF: number; bumpR: number }) => void;
  t: (key: string, fallback?: string) => string;
}

export const DamperCard: React.FC<DamperCardProps> = ({ damping, onChange, t }) => {
  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>{t('dampers', 'Damping (Critical Damping)')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('rebound_front', 'Front Rebound')}</label>
          <input
            type="number"
            step="0.1"
            value={damping.reboundF}
            onChange={(e) => onChange({ ...damping, reboundF: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('rebound_rear', 'Rear Rebound')}</label>
          <input
            type="number"
            step="0.1"
            value={damping.reboundR}
            onChange={(e) => onChange({ ...damping, reboundR: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('bump_front', 'Front Bump')}</label>
          <input
            type="number"
            step="0.1"
            value={damping.bumpF}
            onChange={(e) => onChange({ ...damping, bumpF: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('bump_rear', 'Rear Bump')}</label>
          <input
            type="number"
            step="0.1"
            value={damping.bumpR}
            onChange={(e) => onChange({ ...damping, bumpR: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
      </div>
    </div>
  );
};
