import { useCallback, useEffect, useRef, useState } from 'react';
import { backendFetch } from '../../services/backend';
import { readCompanionResponse, sendCompanionCommand } from './companionClient';
import type { CompanionIntent, CompanionState } from './companionProtocol';

export function useCompanionSession() {
  const [clientId] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<CompanionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const busy = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  const commandAbort = useRef<AbortController | null>(null);
  const pollAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!busy.current) {
        const controller = new AbortController();
        pollAbort.current = controller;
        try {
          const next = await readCompanionResponse(await backendFetch(`/api/companion/workflow?clientId=${encodeURIComponent(clientId)}`, { signal: controller.signal }));
          if (active && !controller.signal.aborted) setState(next);
        } catch {
          if (active && !controller.signal.aborted) setState(previous => previous ? { ...previous, hostOnline: false } : null);
        }
      }
      if (active) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); pollAbort.current?.abort(); commandAbort.current?.abort(); };
  }, [clientId]);

  const send = useCallback(async (intent: CompanionIntent): Promise<boolean> => {
    const current = latest.current;
    if (busy.current || !current?.hostOnline || !current.snapshot) return false;
    busy.current = true;
    setCommandBusy(true); setError(null); setNotice('Waiting for the PC to apply this change…');
    pollAbort.current?.abort();
    const controller = new AbortController();
    commandAbort.current = controller;
    try {
      await sendCompanionCommand({ ...intent, id: crypto.randomUUID(), carId: current.snapshot.carId, profileKey: current.snapshot.profileKey }, clientId, controller.signal, setState);
      setNotice('Applied on PC');
      return true;
    } catch (reason) {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Command failed'); setNotice(null); }
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setCommandBusy(false);
    }
  }, [clientId]);
  return { state, error, notice, commandBusy, send };
}
