import { useId } from 'react';

export function EvModeSwitch({ checked, onChange, t }: {
  checked: boolean; onChange: (value: boolean) => void; t: (key: string) => string;
}) {
  const id = useId();
  return <div className="form-check form-switch">
    <input id={id} className="form-check-input" type="checkbox" role="switch" checked={checked}
      onChange={e => onChange(e.target.checked)} />
    <label className="form-check-label" htmlFor={id}>{t('EV powertrain')}</label>
    {checked && <p className="small text-body-secondary mb-0">{t('EV uses separate per-gear measurement and gearing calculations. Enter the current game ratios in Step 3.')}</p>}
  </div>;
}
