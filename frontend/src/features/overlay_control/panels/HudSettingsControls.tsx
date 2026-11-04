import { useEffect, useId, useState, type ReactNode } from 'react';
import { isHudSettingsTab } from '../hudSettingsFocus';

export function HudSwitch({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  return <label className="form-check form-switch m-0">
    <input type="checkbox" className="form-check-input" checked={checked} disabled={disabled}
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
  const [draft, setDraft] = useState(String(display));
  useEffect(() => setDraft(String(display)), [display]);
  const change = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  const commit = () => {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next)) return;
    const clamped = Math.max(min, Math.min(max, percent ? next / 100 : next));
    setDraft(String(percent ? Math.round(clamped * 100) : clamped));
    if (clamped !== value) onChange(clamped);
  };
  return <div className="hud-range">
    <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
      <label htmlFor={id} className="fs-7 text-body-secondary">{label}</label>
      {numericInput ? <div className="d-flex align-items-center gap-1">
        <input type="number" className="form-control form-control-sm hud-range-value" aria-label={label}
          min={percent ? min * 100 : min} max={percent ? max * 100 : max} step={percent ? 1 : step}
          value={draft} onChange={event => setDraft(event.target.value)}
          onBlur={event => { if (!isHudSettingsTab(event.relatedTarget)) commit(); }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
        <span className="fs-7">{percent ? '%' : suffix}</span>
      </div> : <span className="text-primary fw-bold fs-7 text-nowrap">{display}{percent ? '%' : ` ${suffix}`}</span>}
    </div>
    <input id={id} type="range" className="form-range" min={min} max={max} step={step}
      value={value} onChange={event => change(Number(event.target.value))} />
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
