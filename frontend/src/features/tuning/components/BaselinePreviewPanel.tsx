import { useSettings } from '../../../context/SettingsContext';
import type { BaselinePreview, ChassisDiagnostics } from '../../../domain/tuning/types';
import { ChassisCalculationStatus, chassisReasonText } from './ChassisCalculationStatus';

export function BaselinePreviewPanel({ preview, diagnostics }: { preview: BaselinePreview; diagnostics?: ChassisDiagnostics | null }) {
  const { t, convertSpringRate, convertHeight, convertTirePressureFromPsi } = useSettings();
  const display = (value: number | null, unit: string) => {
    if (value == null) return t('Unknown');
    const converted = unit === 'kgf/mm' ? convertSpringRate(value) : unit === 'cm' ? convertHeight(value)
      : unit === 'psi' ? convertTirePressureFromPsi(value) : { value, label: unit };
    return `${Number(converted.value.toFixed(3))} ${converted.label}`;
  };
  return <section className="glass-panel p-3" aria-label={t('Neutral baseline preview')} style={{ minWidth: 0 }}>
    <h3 className="workspace-section-heading workspace-panel-header">{t('Neutral baseline preview')}</h3>
    <ChassisCalculationStatus diagnostics={diagnostics} />
      <p className="small" style={{ overflowWrap: 'anywhere' }}>{t('Model version')}: {preview.modelVersion} · {t('Tuning target')}: {t(preview.goal)}</p>
      {preview.missingInputs.length > 0 && <p>{t('Missing inputs')}: {preview.missingInputs.map(reason => t(reason)).join(' · ')}</p>}
      <p className="small">{t('Affected fields')}: {preview.affectedFields.length ? preview.affectedFields.map(key => t(key)).join(' · ') : t('None')}</p>
      <details><summary>{t('Current / suggested / difference')}</summary>
        <div className="d-grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          {preview.fields.map(field => <div key={field.key} className="border rounded p-2 small" style={{ overflowWrap: 'anywhere' }}>
            <strong>{t(field.key)}</strong> <span className="badge text-bg-secondary">{t(field.status)}</span>
            <div>{t('Current')}: {display(field.current, field.unit)}</div>
            <div>{t('Suggested')}: {field.recommended == null ? t('Unavailable') : display(field.recommended, field.unit)}</div>
            <div>{t('Difference')}: {display(field.delta, field.unit)}</div>
            {field.reason && <div className="text-body-secondary">{chassisReasonText(field.reason, t)}</div>}
          </div>)}
        </div>
      </details>
  </section>;
}
