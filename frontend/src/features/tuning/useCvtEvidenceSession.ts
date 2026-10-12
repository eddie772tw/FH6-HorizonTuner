import { useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { usesCvt } from '../../domain/tuning/transmission';
import { backendFetch } from '../../services/backend';
import type { TuneSessionIdentity } from './tuneSessionController';

type Metadata = Record<string, unknown>;
type Evidence = { kind: 'cvt-capture'; capture: unknown } | { kind: 'saved-cvt'; evidenceId: string };
interface Selection { evidence: Evidence; metadata: Metadata }
interface Confirmation { identity: unknown; cvtConfiguration: unknown }
interface SavedItem { evidenceId: string; capture: Metadata }
const object = (value: unknown): value is Metadata => !!value && typeof value === 'object' && !Array.isArray(value);
const metadata = (capture: Metadata): Metadata => {
  const { frames: _frames, ...rest } = capture;
  return rest;
};
async function readResponse(response: Response) {
  if (!response.ok) throw new Error('CVT evidence operation is unavailable.');
  return response.json();
}

/** Transport and explicit user confirmation only. Rust owns all qualification decisions. */
export function useCvtEvidenceSession(context: string, identity: TuneSessionIdentity, profile: CarParams | null, liveIdentityCurrent = false) {
  const enabled = usesCvt(profile);
  const [renderContext, setRenderContext] = useState(context);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const currentContext = useRef(context);
  currentContext.current = context;
  if (renderContext !== context) {
    ++sequence.current;
    setRenderContext(context); setSelection(null); setConfirmation(null); setBusy(false); setError(null);
  }
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    const token = ++sequence.current;
    const origin = context;
    setBusy(true); setError(null);
    const current = () => sequence.current === token && currentContext.current === origin;
    try { await operation(current); }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'CVT evidence operation is unavailable.'); }
    finally { if (current()) setBusy(false); }
    return current();
  };
  // Each operation captures its own token before awaiting, including local file reads.
  const refresh = async () => {
    await run(async current => {
      const result = await readResponse(await backendFetch('/api/tuning/cvt-evidence'));
      if (result.schemaVersion !== 'cvt-evidence-list/v1' || !Array.isArray(result.items)
        || !result.items.every((item: SavedItem) => typeof item.evidenceId === 'string' && object(item.capture))) {
        throw new Error('Unsupported CVT evidence response.');
      }
      if (current()) setItems(result.items);
    });
  };
  useEffect(() => {
    if (enabled) void refresh();
    return () => { ++sequence.current; };
  }, [enabled, context]);
  const selectSaved = async (id: string) => {
    setSelection(null);
    await run(async current => {
      const result = await readResponse(await backendFetch(`/api/tuning/cvt-evidence/${encodeURIComponent(id)}`));
      if (result.schemaVersion !== 'cvt-evidence-read/v1' || result.evidenceId !== id || !object(result.capture)) {
        throw new Error('Unsupported CVT evidence response.');
      }
      if (current()) {
        setSelection({ evidence: { kind: 'saved-cvt', evidenceId: id }, metadata: metadata(result.capture) });
      }
    });
  };
  const importFile = async (file: File) => {
    setSelection(null);
    await run(async current => {
      if (file.size > 8 * 1024 * 1024) throw new Error('CVT evidence file exceeds 8 MiB.');
      let capture: unknown;
      try { capture = JSON.parse(await file.text()); }
      catch { throw new Error('CVT capture must be a JSON object.'); }
      if (!object(capture)) throw new Error('CVT capture must be a JSON object.');
      if (current()) {
        // Preserve every imported field and null; no unit conversions or provenance backfill.
        setSelection({ evidence: { kind: 'cvt-capture', capture }, metadata: metadata(capture) });
      }
    });
  };
  const confirm = (text: string) => {
    ++sequence.current; setBusy(false); setConfirmation(null); setError(null);
    try {
      const value: unknown = JSON.parse(text);
      if (!object(value) || !object(value.identity) || !object(value.cvtConfiguration)) {
        throw new Error('Enter current identity and cvtConfiguration as a JSON object.');
      }
      setConfirmation({ identity: value.identity, cvtConfiguration: value.cvtConfiguration });
    } catch { setError('Enter current identity and cvtConfiguration as a JSON object.'); }
  };
  const liveIdentity = liveIdentityCurrent && identity.performanceIndex !== null && identity.carClass !== null
    ? { ordinal: Number(identity.carId), performanceIndex: identity.performanceIndex, carClass: identity.carClass } : null;
  const snapshot = {
    identity: liveIdentity ?? confirmation?.identity ?? null,
    cvtConfiguration: confirmation?.cvtConfiguration ?? null,
    cvtEvidence: selection?.evidence ?? null,
  };
  const save = async () => {
    if (!enabled || !confirmation || selection?.evidence.kind !== 'cvt-capture') return;
    await run(async current => {
      const result = await readResponse(await backendFetch('/api/tuning/cvt-evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, inputSnapshot: { carId: identity.carId, ...snapshot }, evidence: selection.evidence }),
      }));
      if (typeof result.evidenceId !== 'string' || result.qualification?.schemaVersion !== 'cvt-qualification/v1'
        || result.qualification.captureStatus !== 'qualified' || result.qualification.status !== 'unsupported'
        || result.qualification.ratioPreview !== null) throw new Error('Unsupported CVT evidence response.');
      if (current()) {
        const saved = { evidenceId: result.evidenceId, capture: selection.metadata };
        setItems(previous => [...previous.filter(item => item.evidenceId !== result.evidenceId), saved]);
        setSelection({ ...selection, evidence: { kind: 'saved-cvt', evidenceId: result.evidenceId } });
      }
    });
  };
  return { context, items, selection, confirmed: confirmation !== null, snapshot, busy, error,
    refresh, selectSaved, importFile, confirm, revokeConfirmation: () => { ++sequence.current; setBusy(false); setConfirmation(null); }, save,
    clear: () => { ++sequence.current; setSelection(null); setBusy(false); setError(null); } };
}
