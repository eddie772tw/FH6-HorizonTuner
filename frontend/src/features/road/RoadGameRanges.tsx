import { useSettings } from '../../context/SettingsContext';
import { fitRoadGameGrid, type RoadFormulaValue } from '../../utils/tuningMath';

export type RoadRangeInputs = Record<string, { minimum: string; maximum: string; step: string }>;
export function fittedRoadFields(estimates: Record<string, RoadFormulaValue>, ranges: RoadRangeInputs) {
  return Object.fromEntries(Object.entries(estimates).map(([key, estimate]) => {
    const range = ranges[key];
    const value = range && Object.values(range).every(v => v.trim()) ? fitRoadGameGrid(estimate.value, Number(range.minimum), Number(range.maximum), Number(range.step)) : null;
    return [key, value === null ? null : { value, unit: estimate.unit, minimum: Number(range.minimum), maximum: Number(range.maximum), step: Number(range.step), source: 'game-confirmed' }];
  }));
}
export function RoadGameRanges({ estimates, ranges, onChange }: { estimates: Record<string, RoadFormulaValue>; ranges: RoadRangeInputs; onChange: (ranges: RoadRangeInputs) => void }) {
  const { t } = useSettings();
  const fitted = fittedRoadFields(estimates, ranges);
  return <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>{t('Parameter')}</th><th>{t('Game minimum')}</th><th>{t('Game maximum')}</th><th>{t('One game step')}</th><th>{t('Initial estimate')}</th></tr></thead><tbody>
    {Object.entries(estimates).map(([key, estimate]) => <tr key={key}><th>{t(key)}<div className="small text-body-secondary">{estimate.unit}</div></th>
      {(['minimum', 'maximum', 'step'] as const).map(field => <td key={field}><input className="form-control form-control-sm" type="number" step="any" aria-label={t(key) + ' ' + t(field)} required value={ranges[key]?.[field] || ''}
        onChange={e => onChange({ ...ranges, [key]: { ...(ranges[key] || { minimum: '', maximum: '', step: '' }), [field]: e.target.value } })} /></td>)}
      <td>{fitted[key]?.value ?? t('Unknown')}</td>
    </tr>)}
  </tbody></table></div>;
}
