import { backendFetch } from '../../services/backend';
import type { CompanionCommand, CompanionState } from './companionProtocol';

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
export async function readCompanionResponse(response: Response): Promise<CompanionState> {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : `Host returned ${response.status}`);
  return value as CompanionState;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** A queued HTTP response is never an acknowledgement that the desktop applied a change. */
export async function sendCompanionCommand(
  command: CompanionCommand, clientId: string, signal: AbortSignal,
  onState: (state: CompanionState) => void, fetcher: Fetcher = backendFetch,
): Promise<void> {
  signal.throwIfAborted();
  let state = await readCompanionResponse(await fetcher('/api/companion/commands', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal,
  }));
  const deadline = Date.now() + 18_000;
  while (true) {
    signal.throwIfAborted();
    onState(state);
    const ack = state.commands.find(item => item.id === command.id);
    if (ack?.status === 'applied') return;
    if (ack?.status === 'rejected') throw new Error(ack.error || 'The PC rejected this change.');
    if (Date.now() >= deadline) throw new Error('No confirmation from the PC. Refresh before retrying.');
    await wait(300, signal);
    state = await readCompanionResponse(await fetcher(`/api/companion/workflow?clientId=${encodeURIComponent(clientId)}`, { signal }));
  }
}
