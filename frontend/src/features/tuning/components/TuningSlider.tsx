import React, { memo, useState, useEffect, useRef, useId, KeyboardEvent } from 'react';
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
  const inputId = useId();
  const numberInputId = `${inputId}-number`;
  const sliderInputId = `${inputId}-slider`;
  const displayVal = isUnknown ? 'Unknown' : convertToUI(value, unitType);
  const uiMin = convertToUI(min, unitType);
  const uiMax = convertToUI(max, unitType);
  const uiBaseline = baseline !== undefined ? convertToUI(baseline, unitType) : undefined;
  const unitLabel = getUnitLabel(unitType);
  const accessibleName = unitLabel ? `${label} (${unitLabel})` : label;
  
  const [localVal, setLocalVal] = useState(typeof displayVal === 'number' ? displayVal.toFixed(2) : '');
  const [isFocused, setIsFocused] = useState(false);
  const isCancellingRef = useRef(false);

  useEffect(() => {
    if (!isFocused && typeof displayVal === 'number') {
      setLocalVal(displayVal.toFixed(2));
    }
  }, [displayVal, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }
    const parsed = parseFloat(localVal);
    if (!isNaN(parsed)) {
      updateSection(section, field, convertFromUI(parsed, unitType));
    } else {
      if (typeof displayVal === 'number') setLocalVal(displayVal.toFixed(2));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      isCancellingRef.current = true;
      if (typeof displayVal === 'number') {
        setLocalVal(displayVal.toFixed(2));
      }
      setIsFocused(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const formattedValueText = isUnknown
    ? t("Unknown")
    : unitLabel
      ? `${typeof displayVal === 'number' ? displayVal.toFixed(2) : displayVal} ${unitLabel}`
      : `${typeof displayVal === 'number' ? displayVal.toFixed(2) : displayVal}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label htmlFor={isUnknown ? undefined : numberInputId} style={{ color: 'var(--text-secondary)', cursor: isUnknown || disabled ? 'default' : 'pointer' }}>
          {label} 
          {uiBaseline !== undefined && !isUnknown && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Base:")} {uiBaseline.toFixed(1)}{unitLabel})</span>}
          {disabled && <span style={{ color: 'gray', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({t("Locked")})</span>}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isUnknown ? (
            <span style={{ width: '80px', textAlign: 'right', color: 'gray', fontStyle: 'italic' }}>{t("Unknown")}</span>
          ) : (
            <>
              <input 
                id={numberInputId}
                aria-label={accessibleName}
                aria-disabled={disabled}
                type="number" 
                value={localVal} 
                onChange={(e) => setLocalVal(e.target.value)} 
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                step={step}
                disabled={disabled}
                style={{
                  width: '80px',
                  background: disabled ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)',
                  color: disabled ? 'gray' : 'white',
                  border: isFocused ? '1px solid var(--primary, #00b4ff)' : '1px solid rgba(255,255,255,0.2)',
                  outline: isFocused ? '2px solid rgba(0, 180, 255, 0.25)' : 'none',
                  borderRadius: '4px',
                  textAlign: 'right',
                  cursor: disabled ? 'not-allowed' : 'text',
                  transition: 'border-color 0.15s ease, outline 0.15s ease'
                }}
              />
              <span style={{color: 'gray', fontSize: '0.8rem', width: '45px'}}>{unitLabel}</span>
            </>
          )}
        </div>
      </div>
      <input 
        id={sliderInputId}
        aria-label={label}
        aria-valuemin={uiMin}
        aria-valuemax={uiMax}
        aria-valuenow={typeof displayVal === 'number' ? displayVal : uiMin}
        aria-valuetext={formattedValueText}
        aria-disabled={disabled}
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
