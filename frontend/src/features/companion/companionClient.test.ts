import { describe, expect, it, vi } from 'vitest';
import { sendCompanionCommand } from './companionClient';
import type { CompanionCommand, CompanionState } from './companionProtocol';

const command: CompanionCommand = {
  id: 'command-1',
  kind: 'workflow',
  carId: 'car-1',
  profileKey: 'profile-1',
  step: 2,
};

const state = (status: 'pending' | 'applied' | 'rejected'): CompanionState => ({
  hostOnline: true,
  snapshot: null,
  revision: 1,
  commands: [{ id: command.id, status }],
});

const response = (value: CompanionState): Response =>
  new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('sendCompanionCommand', () => {
  it('waits for an applied acknowledgement instead of treating queued as success', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(state('pending')))
      .mockResolvedValueOnce(response(state('applied')));
    const onState = vi.fn();

    await sendCompanionCommand(command, 'client-1', new AbortController().signal, onState, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/companion/workflow?clientId=client-1');
    expect(onState.mock.calls.map(([value]) => value.commands[0].status)).toEqual(['pending', 'applied']);
  });

  it('surfaces a host rejection rather than resolving the command', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(state('rejected')));

    await expect(sendCompanionCommand(command, 'client-1', new AbortController().signal, vi.fn(), fetcher))
      .rejects.toThrow('The PC rejected this change.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the caller aborts an unacknowledged command', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(response(state('pending')));
    const pending = sendCompanionCommand(command, 'client-1', controller.signal, vi.fn(), fetcher);

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException('test abort', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
