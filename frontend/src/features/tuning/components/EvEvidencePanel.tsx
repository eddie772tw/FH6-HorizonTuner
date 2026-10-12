import { useEffect, useRef, useState } from 'react';
import type { EvEvidenceMetadata } from '../../../domain/tuning/ev/types';
import { evIdentity } from '../../../domain/tuning/ev/sessionIdentity';
import { useTelemetry } from '../../../hooks/useTelemetry';
import { backendFetch } from '../../../services/backend';
import { evPowertrainContext } from '../evSession';
import { useTuneSession } from '../TuneSessionProvider';

/** Capture metadata is displayed separately and never fills current configuration inputs. */
export function EvEvidencePanel({ t }: { t: (text: string) => string }) {
  const session = useTuneSession();
  const m = session.evMeasurement;
  const { data, isConnected } = useTelemetry();
  const carId = session.identity.carId;
  const context = m.key;
  const generation = useRef(0);
  const activeContext = useRef(context); activeContext.current = context;
  const [list, setList] = useState<EvEvidenceMetadata[]>([]);
  const [selected, setSelected] = useState<EvEvidenceMetadata | null>(null);
  const [pi, setPi] = useState(''); const [carClass, setCarClass] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const recording = m.phase === 'collecting';
  const live = isConnected && data ? evIdentity(data) : undefined;
  const liveIdentity = live && String(live.ordinal) === carId ? live : undefined;
  const liveKey = JSON.stringify(liveIdentity ?? null);
  const previousLiveKey = useRef(liveKey);
  useEffect(() => {
    generation.current++; setList([]); setSelected(null); setPi(''); setCarClass(''); setConfirmed(false); setBusy(false);
    void refresh();
    return () => { generation.current++; };
  }, [context]);
  useEffect(() => {
    if (previousLiveKey.current === liveKey) return;
    previousLiveKey.current = liveKey;
    setConfirmed(false);
    if (m.source) m.clearEvidence();
  }, [liveKey]);
  const refresh = async () => {
    const token = ++generation.current;
    try {
      const response = await backendFetch('/api/tuning/ev-evidence?carId=' + encodeURIComponent(carId));
      if (!response.ok) throw new Error();
      const values = await response.json() as EvEvidenceMetadata[];
      if (token === generation.current && context === activeContext.current) { setList(values); setStatus(''); }
    } catch { if (token === generation.current && context === activeContext.current) { setList([]); setStatus('EV evidence discovery is unavailable. Retry.'); } }
  };
  const choose = async (id: string) => {
    const token = ++generation.current;
    m.clearEvidence(); setSelected(null); setConfirmed(false); setStatus('');
    if (!id) return;
    setBusy(true);
    try {
      const response = await backendFetch('/api/tuning/ev-evidence/' + encodeURIComponent(id));
      if (!response.ok) throw new Error();
      const value = await response.json() as { metadata: EvEvidenceMetadata };
      if (token === generation.current && context === activeContext.current) setSelected(value.metadata);
    } catch { if (token === generation.current && context === activeContext.current) setStatus('Saved EV raw evidence is unavailable or did not qualify.'); }
    finally { if (token === generation.current && context === activeContext.current) setBusy(false); }
  };
  const importRaw = async (file: File) => {
    const token = ++generation.current;
    m.clearEvidence(); setSelected(null); setConfirmed(false); setStatus(''); setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error();
      const raw = JSON.parse(await file.text());
      if (token !== generation.current || context !== activeContext.current) return;
      const response = await backendFetch('/api/tuning/ev-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(raw) });
      if (!response.ok) throw new Error();
      const value = await response.json() as { metadata: EvEvidenceMetadata };
      if (token === generation.current && context === activeContext.current) {
        setSelected(value.metadata); setList(previous => [value.metadata, ...previous]);
      }
    } catch { if (token === generation.current && context === activeContext.current) setStatus('EV import requires qualified raw JSON up to 8 MiB. Summaries cannot qualify evidence.'); }
    finally { if (token === generation.current && context === activeContext.current) setBusy(false); }
  };
  const useSelected = async () => {
    if (!selected || !session.profile?.evGearbox || !confirmed) return;
    const identity = liveIdentity ?? { ordinal: Number(carId), performanceIndex: Number(pi), carClass: Number(carClass) };
    if (!liveIdentity && (!pi || !carClass)) { setStatus('Independently enter the current PI and Class before confirming EV evidence.'); return; }
    await m.selectEvidence(selected.evidenceId, { schemaVersion: 'ev-context/v1', carId, identity,
      setup: session.profile.evGearbox, powertrain: evPowertrainContext(session.profile) });
  };
  return <section className="glass-panel p-3 d-flex flex-column gap-2" aria-label={t('Saved EV evidence')}>
    <h4 className="fs-6">{t('Saved EV evidence')}</h4>
    <p className="small mb-0">{t('Select or import raw EV evidence. Independently confirm the current vehicle and gearbox; imported metadata does not change current settings.')}</p>
    <label className="form-label" htmlFor="ev-evidence-select">{t('EV capture')}</label>
    <select id="ev-evidence-select" className="form-select" disabled={recording || busy} value={selected?.evidenceId ?? ''}
      onChange={e => void choose(e.target.value)}>
      <option value="">{t('Select saved EV evidence')}</option>
      {list.map(item => <option key={item.evidenceId} value={item.evidenceId}>{item.carId} · PI {item.identity.performanceIndex} / Class {item.identity.carClass} · {item.evidenceId}</option>)}
    </select>
    <div className="d-flex gap-2 flex-wrap">
      <button type="button" className="btn btn-outline-secondary" disabled={busy || recording} onClick={() => void refresh()}>{t('Refresh EV evidence')}</button>
      <label className="form-label mb-0">{t('Import raw EV JSON')}
        <input type="file" className="form-control" accept=".json,application/json" disabled={busy || recording} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (file) void importRaw(file);
        }} />
      </label>
    </div>
    {selected && <>
      <p className="small mb-0">{t('Captured configuration')}: {selected.carId} · PI {selected.identity.performanceIndex} / Class {selected.identity.carClass} · FD {selected.setup.finalDrive ?? t('Unknown / not shown')} · {selected.setup.gearRatios.map(r => r ?? t('Unknown / not shown')).join(' / ')}</p>
      <p className="small mb-0">{t('Capture time, game version and installed-part provenance may be unavailable. An independent confirmation is a user assertion, not recorded provenance.')}</p>
      {!selected.powertrain && <p className="small mb-0">{t('Historical EV capture has no recorded powertrain profile. Confirm the original build independently; unknown provenance stays unknown.')}</p>}
      {liveIdentity ? <p className="small mb-0">{t('Current live configuration')}: {carId} · PI {liveIdentity.performanceIndex} / Class {liveIdentity.carClass}</p> : <div className="row g-2">
        <div className="col-sm-6"><label className="form-label" htmlFor="ev-current-pi">{t('Current PI')}</label><input id="ev-current-pi" className="form-control" type="number" value={pi} onChange={e => { setPi(e.target.value); setConfirmed(false); m.clearEvidence(); }} /></div>
        <div className="col-sm-6"><label className="form-label" htmlFor="ev-current-class">{t('Current Class')}</label><input id="ev-current-class" className="form-control" type="number" value={carClass} onChange={e => { setCarClass(e.target.value); setConfirmed(false); m.clearEvidence(); }} /></div>
      </div>}
      <label className="form-check"><input className="form-check-input" type="checkbox" checked={confirmed} disabled={recording || busy} onChange={e => { setConfirmed(e.target.checked); m.clearEvidence(); }} />
        <span className="form-check-label">{t('I independently verified that the current vehicle, installed build, powertrain and gearbox match this capture.')}</span></label>
      <button className="btn btn-outline-primary align-self-start" disabled={!confirmed || busy || recording} onClick={() => void useSelected()}>{t('Use confirmed EV evidence')}</button>
    </>}
    <div role="status" aria-live="polite">{busy ? t('Loading EV raw evidence…') : t(status)}</div>
  </section>;
}
