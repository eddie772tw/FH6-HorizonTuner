import { useEffect, useId, useState, type ReactNode } from 'react';
import { isHudSettingsTab } from '../hudSettingsFocus';

export function HudSwitch({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return <label htmlFor={id} className={`form-check form-switch m-0${disabled ? ' opacity-75' : ''}`}
    style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <input id={id} type="checkbox" role="switch" aria-checked={checked} className="form-check-input"
      checked={checked} disabled={disabled} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      onChange={event => onChange(event.target.checked)} />
    <span className="form-check-label fs-7">{label}</span>
  </label>;
}

export function HudRange({ label, value, min, max, step, onChange, percent = false, suffix = 'px', numericInput = false }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (value: number) => void; percent?: boolean; suffix?: string; numericInput?: boolean;
}) {
  const id = useId();
  const display = percent ? Math.round(value * 100) : value;
  const minDisplay = percent ? Math.round(min * 100) : min;
  const maxDisplay = percent ? Math.round(max * 100) : max;
  const unit = percent ? '%' : suffix;
  const valueText = unit === '%' ? `${display}%` : `${display} ${unit}`;
  const rangeText = unit === '%' ? `${minDisplay}% – ${maxDisplay}%` : `${minDisplay} – ${maxDisplay} ${unit}`;
  const [draft, setDraft] = useState(String(display));
  useEffect(() => setDraft(String(display)), [display]);
  const parsed = Number(draft);
  const isInvalid = numericInput && draft !== String(display)
    && (!draft.trim() || !Number.isFinite(parsed) || parsed < minDisplay || parsed > maxDisplay);
  const hintId = `${id}-range-hint`;
  const change = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  const commit = () => {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next)) { setDraft(String(display)); return; }
    const clamped = Math.max(min, Math.min(max, percent ? next / 100 : next));
    setDraft(String(percent ? Math.round(clamped * 100) : clamped));
    if (clamped !== value) onChange(clamped);
  };
  return <div className="hud-range">
    <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
      <label htmlFor={id} className="fs-7 text-body-secondary">{label}</label>
      {numericInput ? <div className="d-flex align-items-center gap-1">
        <input type="number" className={`form-control form-control-sm hud-range-value${isInvalid ? ' border-danger text-danger-emphasis' : ''}`}
          aria-label={`${label} (${unit})`} aria-invalid={isInvalid ? 'true' : 'false'} aria-describedby={isInvalid ? hintId : undefined}
          min={minDisplay} max={maxDisplay} step={percent ? 1 : step}
          value={draft} onChange={event => setDraft(event.target.value)}
          onBlur={event => { if (!isHudSettingsTab(event.relatedTarget)) commit(); }}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            else if (event.key === 'Escape' && draft !== String(display)) { event.preventDefault(); setDraft(String(display)); }
          }} />
        <span className="fs-7" aria-hidden="true">{unit}</span>
      </div> : <span className="text-primary fw-bold fs-7 text-nowrap">{valueText}</span>}
    </div>
    {isInvalid && <p id={hintId} className="fs-8 text-danger-emphasis text-end mb-1 mt-0">{rangeText}</p>}
    <input id={id} type="range" className="form-range" min={min} max={max} step={step}
      aria-valuetext={valueText} value={value} onChange={event => change(Number(event.target.value))} />
  </div>;
}

export function HudSettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="glass-panel hud-settings-section p-3 d-flex flex-column gap-3" aria-labelledby={id}>
    <div className="workspace-panel-header border-bottom pb-2">
      <h3 id={id} className="workspace-section-heading fs-6 fw-bold m-0 p-0 border-0">{title}</h3>
    </div>
    <div className="d-flex flex-column gap-3">{children}</div>
  </section>;
}
