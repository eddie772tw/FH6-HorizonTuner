import React, { useEffect, useRef, useState } from 'react';

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
  'aria-describedby'?: string;
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
  'aria-describedby': ariaDescribedBy,
}) => {
  const edited = useRef(false);
  const isCancellingRef = useRef(false);
  const initialValueRef = useRef<number | undefined | null>(value);
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
    edited.current = true;
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
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }
    // Display rounding is not an edit: keep imported and converted precision.
    if (!edited.current) return;
    edited.current = false;
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
    edited.current = false;
    isCancellingRef.current = false;
    initialValueRef.current = value;
    setIsFocused(true);
    if (value != null && Number.isFinite(value)) setLocalText(String(value));
    // Select all text on focus for quick overwrite
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      isCancellingRef.current = true;
      edited.current = false;
      const original = initialValueRef.current;
      onChange(original == null || Number.isNaN(original) ? undefined : original);
      if (original == null || Number.isNaN(original)) {
        setLocalText('');
      } else {
        setLocalText(precision !== undefined ? original.toFixed(precision) : String(original));
      }
      setIsFocused(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const currentNumeric = parseFloat(localText);
  const isOutOfRange = !Number.isNaN(currentNumeric) && (
    (min !== undefined && currentNumeric < min) ||
    (max !== undefined && currentNumeric > max)
  );

  return (
    <input
      type="number"
      inputMode="decimal"
      id={id}
      name={name}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isOutOfRange ? 'true' : undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={typeof value === 'number' && !Number.isNaN(value) ? value : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      min={min}
      max={max}
      disabled={disabled}
      step={step}
      placeholder={placeholder}
      className={className}
      style={{
        textAlign: 'right',
        background: 'var(--surface-2)',
        color: 'var(--text-primary)',
        borderColor: isOutOfRange
          ? 'var(--bs-warning, #f59e0b)'
          : isFocused
            ? 'var(--bs-primary, #00b4ff)'
            : 'var(--glass-border)',
        outline: isFocused ? '2px solid rgba(0, 180, 255, 0.25)' : 'none',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : undefined,
        transition: 'border-color 0.15s ease, outline 0.15s ease, opacity 0.15s ease',
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
