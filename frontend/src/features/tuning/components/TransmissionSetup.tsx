import type { TransmissionSelection } from '../../../domain/tuning/transmission';

export function TransmissionSetup({ value, onChange, t }: {
  value?: TransmissionSelection; onChange: (value: TransmissionSelection) => void; t: (key: string) => string;
}) {
  return <div className="d-flex flex-column gap-2">
    <label className="text-body-secondary fs-7">{t('Transmission type')}
      <select className="form-select form-select-sm" value={value?.type ?? 'discrete'}
        onChange={e => onChange(e.target.value === 'cvt' ? { type: 'cvt', capability: 'unknown' } : { type: 'discrete' })}>
        <option value="discrete">{t('Discrete gears')}</option><option value="cvt">CVT</option>
      </select>
    </label>
    {value?.type === 'cvt' && <label className="text-body-secondary fs-7">{t('Game-visible CVT adjustability')}
      <select className="form-select form-select-sm" value={value.capability ?? 'unknown'}
        onChange={e => onChange({ type: 'cvt', capability: e.target.value as TransmissionSelection['capability'] })}>
        <option value="unknown">{t('Unknown')}</option><option value="fixed">{t('Fixed / locked')}</option>
        <option value="final-drive-only">{t('Final drive only')}</option><option value="simulated-gears">{t('Simulated gears')}</option>
      </select>
    </label>}
  </div>;
}
