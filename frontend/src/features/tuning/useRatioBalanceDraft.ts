import { useEffect, useState } from 'react';
import type { RatioBalanceRequest } from './ratioBalanceTypes';

const STORAGE_KEY = 'tuning-ratio-balance-draft/v1';
interface Stored { context: string; request: RatioBalanceRequest | null }
const rangeShape = (value: unknown): boolean => {
  const range = value as { min?: unknown; max?: unknown; step?: unknown } | null;
  return !!range && typeof range.min === 'number' && Number.isFinite(range.min)
    && typeof range.max === 'number' && Number.isFinite(range.max) && range.step === 0.01;
};
export function isRatioBalanceRequest(value: unknown): value is RatioBalanceRequest {
  const request = value as RatioBalanceRequest | null;
  return !!request && request.schemaVersion === 'ratio-balance/v1'
    && (request.candidateFinalDrive === undefined || (typeof request.candidateFinalDrive === 'number' && Number.isFinite(request.candidateFinalDrive)))
    && request.bounds?.source === 'user-observed' && rangeShape(request.bounds.finalDrive)
    && Array.isArray(request.bounds.gears) && request.bounds.gears.length > 0 && request.bounds.gears.every(rangeShape);
}
function read(): Stored | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return typeof value?.context === 'string' && isRatioBalanceRequest(value.request)
      ? value : null;
  } catch { return null; }
}

/** Retain only a UI request. Every restored request must be revalidated by Rust. */
export function useRatioBalanceDraft(context: string | null) {
  const [stored, setStored] = useState<Stored | null>(read);
  const [bound, setBound] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  // Initial evidence hydration may be pending. Once bound, any context loss/change
  // invalidates the draft so A→B→A cannot resurrect an old choice.
  if (context !== bound && (bound !== null || context !== null)) {
    setBound(context);
    if (bound !== null || stored?.context !== context) setStored(null);
  }
  const request = context !== null && stored?.context === context ? stored.request : null;
  useEffect(() => {
    if (context === null && bound === null && stored !== null) return;
    try {
      if (stored && stored.context === context) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      else localStorage.removeItem(STORAGE_KEY);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [context, bound, stored]);
  return {
    request, storageError, active: context !== null,
    setRequest: (next: RatioBalanceRequest | null) => {
      if (context !== null) setStored(next ? { context, request: next } : null);
    },
  };
}
