import React, { useEffect, useState } from 'react';

export interface DecimalInputProps {
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  precision?: number;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export const DecimalInput: React.FC<DecimalInputProps> = ({
  value,
  onChange,
  precision,
  min,
  max,
  step = 'any',
  placeholder,
  className = 'form-control form-control-sm',
  style,
  disabled = false,
  id,
  name,
  'aria-label': ariaLabel,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState<string>(() => {
    if (value === undefined || value === null || Number.isNaN(value)) return '';
    return precision !== undefined ? value.toFixed(precision) : String(value);
  });

  // Synchronize when external value changes and input is not focused
  useEffect(() => {
    if (!isFocused) {
      if (value === undefined || value === null || Number.isNaN(value)) {
        setLocalText('');
      } else {
        setLocalText(precision !== undefined ? value.toFixed(precision) : String(value));
      }
    }
  }, [value, precision, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    setLocalText(nextText);

    // Empty input: report undefined to allow clearing without forcing 0
    if (nextText.trim() === '') {
      onChange(undefined);
      return;
    }

    // If typing partial numbers like '-' or '.', do not emit NaN
    if (nextText === '-' || nextText === '.' || nextText === '-.') {
      return;
    }

    const parsed = parseFloat(nextText);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localText.trim() === '') {
      onChange(undefined);
      setLocalText('');
      return;
    }

    let parsed = parseFloat(localText);
    if (Number.isNaN(parsed)) {
      if (value !== undefined && value !== null && !Number.isNaN(value)) {
        setLocalText(precision !== undefined ? value.toFixed(precision) : String(value));
      } else {
        setLocalText('');
        onChange(undefined);
      }
      return;
    }

    // Clamp within min / max if provided
    if (min !== undefined && parsed < min) parsed = min;
    if (max !== undefined && parsed > max) parsed = max;

    onChange(parsed);
    setLocalText(precision !== undefined ? parsed.toFixed(precision) : String(parsed));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Select all text on focus for quick overwrite
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      id={id}
      name={name}
      aria-label={ariaLabel}
      disabled={disabled}
      step={step}
      placeholder={placeholder}
      className={className}
      style={{
        textAlign: 'right',
        background: 'var(--surface-2)',
        color: 'var(--text-primary)',
        borderColor: 'var(--glass-border)',
        ...style,
      }}
      value={localText}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};
