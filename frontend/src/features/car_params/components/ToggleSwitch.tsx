import React from 'react';

export const ToggleSwitch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}> = ({ label, checked, onChange, color = '#00e676' }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
    <div
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? color : 'rgba(255,255,255,0.15)',
        position: 'relative',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        cursor: 'pointer'
      }}
    >
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
    <span style={{ color: checked ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem', transition: 'color 0.2s' }}>
      {label}
    </span>
  </label>
);
