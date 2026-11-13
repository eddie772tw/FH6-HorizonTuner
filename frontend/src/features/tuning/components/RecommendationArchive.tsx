import { useEffect, useState } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch } from '../../../services/backend';
import { useFileSave } from '../../../hooks/useFileSave';
import { captureSaveRequest, savedCaptureSaveRequest } from '../captureDownload';

interface ArchiveItem {
  status: 'retired';
  validated: false;
  documents?: unknown[];
  record: {
    id: string;
    createdAt?: number;
    discipline?: string;
    recommendation: {
      formulaVersion: string;
      inputSnapshot?: { carId?: string; goal?: string; gearingModelVersion?: string };
    };
  };
}

/** Backend-classified stored records. Viewing and exporting never qualify a setup. */
export function RecommendationArchive() {
  const { t } = useSettings();
  const { save, isSaving } = useFileSave();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus('loading');
    void backendFetch('/api/road/archives').then(async response => {
      if (!response.ok) throw new Error('archive unavailable');
      const value: unknown = await response.json();
      if (!Array.isArray(value) || value.some(item => item?.status !== 'retired'
        || item?.validated !== false || typeof item?.record?.id !== 'string'
        || typeof item?.record?.recommendation?.formulaVersion !== 'string'
        || (item.documents !== undefined && !Array.isArray(item.documents)))) throw new Error('invalid archive');
      if (active) { setItems(value); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [open]);
  return <details id="retired-recommendation-archive" className="glass-panel p-3"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="fw-semibold">{t('Historical recommendation archive')}</summary>
    <p className="small mt-3">{t('Retired models are no longer calculated. These original records are read-only and have not been validated for current use.')}</p>
    <p className="small">{t('To create a current recommendation, complete vehicle setup and engine evidence in the tuning workflow. The new recommendation does not overwrite an archive.')}</p>
    <div role="status" aria-live="polite" style={{ minHeight: '1.5em' }}>
      {status === 'loading' ? t('Loading archived recommendations…') : status === 'error'
        ? t('Archived recommendations could not be loaded. Close and reopen this panel to retry.')
        : !items.length ? t('No retired recommendations are stored.') : null}
    </div>
    {status === 'ready' && items.map(({ record, documents }) => <details key={record.id} className="mt-3">
      <summary className="text-break">{record.recommendation.inputSnapshot?.carId ?? t('Unknown')} · {record.discipline ?? record.recommendation.inputSnapshot?.goal ?? t('Unknown')} · {record.recommendation.formulaVersion}</summary>
      <span className="badge text-bg-secondary mt-2">{t('Retired · read-only · not validated')}</span>
      <p className="small mt-2 text-break">{record.recommendation.inputSnapshot?.gearingModelVersion}</p>
      <button className="btn btn-sm btn-outline-secondary" disabled={isSaving}
        onClick={() => void save(captureSaveRequest(documents ?? record, documents ? 'archived-workflow-history.json' : 'archived-recommendation.json'))}>{t(documents ? 'Export original history' : 'Export original record')}</button>
      {documents?.filter((document): document is { kind: 'run'; id: string } =>
        !!document && typeof document === 'object' && 'kind' in document && document.kind === 'run'
        && 'id' in document && typeof document.id === 'string').map(run => <div key={run.id} className="mt-2">
          <button className="btn btn-sm btn-outline-secondary mw-100 text-break" disabled={isSaving}
            onClick={() => void save(savedCaptureSaveRequest(`/workflows/${encodeURIComponent(record.id)}/runs/${encodeURIComponent(run.id)}/capture`, 'archived-run-capture.json'))}>{t('Export recorded frames')}: {run.id}</button>
        </div>)}
      <pre className="small overflow-auto mt-2" style={{ maxHeight: 260 }}>{JSON.stringify(documents ?? record, null, 2)}</pre>
    </details>)}
  </details>;
}
