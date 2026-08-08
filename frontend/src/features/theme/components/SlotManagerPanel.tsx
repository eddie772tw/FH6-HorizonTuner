import React, { useRef } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings } from '../../../context/SettingsContext';

const actionBtnStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
  padding: '0.4rem 0.8rem',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
};

const slotBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.6rem',
  borderRadius: '5px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
  transition: 'all 0.2s ease',
};

const SlotManagerPanel: React.FC = () => {
  const { themeSettings, saveToSlot, loadFromSlot, exportThemeJSON, importThemeJSON } = useTheme();
  const { t } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const jsonStr = exportThemeJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fh6_theme_config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importThemeJSON(content);
        if (!success) {
          alert('Invalid Theme JSON file format.');
        }
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.15rem' }}>
          {t('Style Storage Slots')} (Max 3)
        </h3>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button id="export-theme-json" onClick={handleExport} className="cyber-btn-glow" style={actionBtnStyle}>
            {t('Export Theme JSON')}
          </button>
          <button id="import-theme-json" onClick={() => fileInputRef.current?.click()} className="cyber-btn-glow" style={actionBtnStyle}>
            {t('Import Theme JSON')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {themeSettings.slots.map(slot => (
          <div
            key={slot.id}
            className="glass-panel-interactive"
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'var(--surface-1)',
              border: '1px solid var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slot.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {slot.savedAt ? `Saved ${slot.savedAt}` : 'Empty'}
              </span>
            </div>

            {/* Preview dots */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.primaryColor, border: '1px solid rgba(255,255,255,0.2)' }} title="Primary" />
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.secondaryColor, border: '1px solid rgba(255,255,255,0.2)' }} title="Secondary" />
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: slot.accentColor, border: '1px solid rgba(255,255,255,0.2)' }} title="Accent" />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                {slot.mode === 'light' ? 'Light' : 'Dark'} / {(slot.halfmoonCore || 'default').charAt(0).toUpperCase() + (slot.halfmoonCore || 'default').slice(1)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
              <button
                id={`slot-save-${slot.id}`}
                onClick={() => saveToSlot(slot.id)}
                style={{ ...slotBtnStyle, background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary)' }}
              >
                {t('Save Current')}
              </button>
              <button
                id={`slot-load-${slot.id}`}
                onClick={() => loadFromSlot(slot.id)}
                style={{ ...slotBtnStyle, background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              >
                {t('Load Slot')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlotManagerPanel;
