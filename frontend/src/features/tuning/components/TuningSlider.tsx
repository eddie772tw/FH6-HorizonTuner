import React, { memo, useState, useEffect, KeyboardEvent } from 'react';
import { useSettings } from '../../../context/SettingsContext';

export interface TuningSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unitType: string;
  section: any;
  field: string;
  step?: number;
  baseline?: number;
  disabled?: boolean;
  isUnknown?: boolean;
  updateSection: (section: any, field: string, value: any) => void;
  convertToUI: (val: number, unit: string) => any;
  convertFromUI: (val: number, unit: string) => number;
  getUnitLabel: (unit: string) => string;
}

const TuningSliderComponent: React.FC<TuningSliderProps> = ({
  label, value, min, max, unitType, section, field, step = 0.1, baseline, disabled = false, isUnknown = false, updateSection, convertToUI, convertFromUI, getUnitLabel
}) => {
  const { t } = useSettings();
  const displayVal = isUnknown ? 'Unknown' : convertToUI(value, unitType);
  const uiMin = convertToUI(min, unitType);
  const uiMax = convertToUI(max, unitType);
  const uiBaseline = baseline !== undefined ? convertToUI(baseline, unitType) : undefined;
  
  const [localVal, setLocalVal] = useState(typeof displayVal === 'number' ? displayVal.toFixed(2) : '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused && typeof displayVal === 'number') {
      setLocalVal(displayVal.toFixed(2));
    }
  }, [displayVal, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localVal);
    if (!isNaN(parsed)) {
      updateSection(section, field, convertFromUI(parsed, unitType));
    } else {
      if (typeof displayVal === 'number') setLocalVal(displayVal.toFixed(2));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleBlur();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {label} 
          {uiBaseline !== undefined && !isUnknown && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Base:")} {uiBaseline.toFixed(1)}{getUnitLabel(unitType)})</span>}
          {disabled && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Locked")})</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isUnknown ? (
            <span style={{ width: '80px', textAlign: 'right', color: 'gray', fontStyle: 'italic' }}>{t("Unknown")}</span>
          ) : (
            <>
              <input 
                type="number" 
                value={localVal} 
                onChange={(e) => setLocalVal(e.target.value)} 
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                step={step}
                disabled={disabled}
                style={{ width: '80px', background: disabled ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)', color: disabled ? 'gray' : 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', textAlign: 'right', cursor: disabled ? 'not-allowed' : 'text' }}
              />
              <span style={{color: 'gray', fontSize: '0.8rem', width: '45px'}}>{getUnitLabel(unitType)}</span>
            </>
          )}
        </div>
      </div>
      <input 
        type="range" min={uiMin} max={uiMax} step={step} 
        value={isUnknown ? uiMin : (displayVal as number)} 
        onChange={(e) => updateSection(section, field, convertFromUI(parseFloat(e.target.value), unitType))}
        disabled={disabled}
        style={{ width: '100%', accentColor: disabled ? 'gray' : 'var(--primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </div>
  );
};

export const TuningSlider = memo(TuningSliderComponent);
