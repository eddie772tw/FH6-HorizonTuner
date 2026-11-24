import { autoTuneRequest as invoke } from './autoTuneApi';
import { useEffect, useState } from 'react';
import type { AppVariant } from '../../app/workspaceManifest';

export interface DeveloperOptions {
  available: boolean;
  enabled: boolean;
  busy: boolean;
  error: string;
  setEnabled(value: boolean): Promise<void>;
}

export function useDeveloperOptions(variant: AppVariant): DeveloperOptions {
  const available = variant === 'full' && '__TAURI_INTERNALS__' in window && /Windows/i.test(navigator.userAgent);
  const [enabled, setCurrent] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!available) return;
    let live = true;
    void invoke<boolean>('auto_tune_enabled').then(value => {
      if (live) setCurrent(value);
    }).catch(reason => { if (live) setError(String(reason)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [available]);
  return { available, enabled: available && enabled, busy, error, async setEnabled(value) {
    if (!available || busy) return;
    setError(''); setBusy(true);
    try {
      await invoke('set_auto_tune_enabled', { value });
      setCurrent(value);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  } };
}
