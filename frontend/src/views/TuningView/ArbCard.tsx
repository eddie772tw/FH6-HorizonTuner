import React from 'react';

interface ArbCardProps {
  arb: { front: number; rear: number };
  onChange: (val: { front: number; rear: number }) => void;
  t: (key: string, fallback?: string) => string;
}

export const ArbCard: React.FC<ArbCardProps> = ({ arb, onChange, t }) => {
  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>{t('anti_roll_bars', 'Anti-Roll Bars (ARB)')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('front_arb', 'Front ARB')} (1-65)</label>
          <input
            type="number"
            step="0.1"
            value={arb.front}
            onChange={(e) => onChange({ ...arb, front: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('rear_arb', 'Rear ARB')} (1-65)</label>
          <input
            type="number"
            step="0.1"
            value={arb.rear}
            onChange={(e) => onChange({ ...arb, rear: parseFloat(e.target.value) || 1 })}
            style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
          />
        </div>
      </div>
    </div>
  );
};
