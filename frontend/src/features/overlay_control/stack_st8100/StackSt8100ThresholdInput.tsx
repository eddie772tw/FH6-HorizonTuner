import { useEffect, useState } from 'react';
import { parseStackSt8100ThresholdDraft, stackSt8100ThresholdSpec, stackSt8100ThresholdToDisplay, stackSt8100ThresholdUnit,
  type StackSt8100DisplayUnits, type StackSt8100ThresholdMetric } from './units';

export function StackSt8100ThresholdInput({ id, metric, value, units, disabled, onChange, t }: {
  id: string;
  metric: StackSt8100ThresholdMetric;
  value: number;
  units: StackSt8100DisplayUnits;
  disabled?: boolean;
  onChange: (value: number) => void;
  t: (key: string) => string;
}) {
  const spec = stackSt8100ThresholdSpec(metric);
  const display = (value: number) => Number(stackSt8100ThresholdToDisplay(metric, value, units).toFixed(2));
  const unit = t(stackSt8100ThresholdUnit(metric, units));
  const displayed = String(display(value));
  const [draft, setDraft] = useState(displayed);
  useEffect(() => { setDraft(displayed); }, [displayed, metric, unit]);
  const commit = () => {
    // Unedited rounded display values must retain exact canonical thresholds.
    if (draft === displayed) return;
    const canonical = parseStackSt8100ThresholdDraft(metric, draft, units);
    if (canonical === null) { setDraft(displayed); return; }
    setDraft(String(display(canonical)));
    if (canonical !== value) onChange(canonical);
  };
  return (
    <div>
      <label htmlFor={id} className="form-label fs-7 mb-1">{t('Threshold')} ({unit})</label>
      <div className="input-group input-group-sm">
        <input id={id} type="text" inputMode="decimal" className="form-control" disabled={disabled}
          aria-describedby={`${id}-range`} value={draft}
          onChange={event => setDraft(event.currentTarget.value)} onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') { event.preventDefault(); setDraft(displayed); }
          }} />
        <span className="input-group-text fs-8">{unit}</span>
      </div>
      <span id={`${id}-range`} className="visually-hidden">{t('Range')}: {display(spec.min)}–{display(spec.max)} {unit}</span>
    </div>
  );
}
