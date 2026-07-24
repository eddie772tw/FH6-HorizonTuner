import React from 'react';

interface GearingCardProps {
  gearing: { finalDrive: number; gears: number[]; maxRpm: number };
  onChange: (val: { finalDrive: number; gears: number[]; maxRpm: number }) => void;
  t: (key: string, fallback?: string) => string;
}

export const GearingCard: React.FC<GearingCardProps> = ({ gearing, onChange, t }) => {
  const updateGear = (idx: number, ratio: number) => {
    const nextGears = [...gearing.gears];
    nextGears[idx] = ratio;
    onChange({ ...gearing, gears: nextGears });
  };

  return (
    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>{t('gearing_aego', 'AEGO Gearing')}</h3>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('final_drive', 'Final Drive')}</label>
        <input
          type="number"
          step="0.01"
          value={gearing.finalDrive}
          onChange={(e) => onChange({ ...gearing, finalDrive: parseFloat(e.target.value) || 2.5 })}
          style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', marginTop: '0.25rem' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
        {gearing.gears.map((gRatio, idx) => (
          <div key={idx}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gear {idx + 1}</label>
            <input
              type="number"
              step="0.01"
              value={gRatio}
              onChange={(e) => updateGear(idx, parseFloat(e.target.value) || 0.5)}
              style={{ width: '100%', padding: '0.4rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
