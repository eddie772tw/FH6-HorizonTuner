// @ts-ignore The shared HUD modules are browser-native ES modules.
import { createOverlayEventDedupe } from '../../../hud_overlay/shared/overlay-dedupe.js';
// @ts-ignore The shared HUD modules are browser-native ES modules.
import { createOverlayEventForwarder } from '../../../hud_overlay/shared/overlay-forwarding.js';
import { describe, expect, it } from 'vitest';

describe('overlay event delivery', () => {
  it('drops duplicate audio sequences but preserves state transitions', () => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const dedupe = createOverlayEventDedupe((type: string, data: Record<string, unknown>) => {
      events.push({ type, data });
    });

    expect(dedupe.onAudio({ sequence: 7, state: 'live' })).toBe(true);
    expect(dedupe.onAudio({ sequence: 7, state: 'live' })).toBe(false);
    expect(dedupe.onAudio({ sequence: 7, state: 'stale' })).toBe(true);
    expect(events).toHaveLength(2);
  });

  it('emits a zeroed stale snapshot on disconnect', () => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const dedupe = createOverlayEventDedupe((type: string, data: Record<string, unknown>) => {
      events.push({ type, data });
    });

    dedupe.onAudio({ sequence: 4, state: 'live' });
    dedupe.onDisconnect();

    expect(events[1].type).toBe('hud:audio');
    expect(events[1].data).toMatchObject({ sequence: 4, state: 'stale', vu_left: 0, vu_right: 0 });
    expect(events[1].data.spectrum).toHaveLength(32);
  });

  it('coalesces audio forwarding and retains the latest snapshot', () => {
    const messages: Array<{ type: string; detail: { data: Record<string, unknown> } }> = [];
    let queuedFlush: (() => void) | undefined;
    const forwarder = createOverlayEventForwarder(
      (type: string, detail: { data: Record<string, unknown> }) => messages.push({ type, detail }),
      (callback: () => void) => { queuedFlush = callback; return 0; },
    );

    forwarder.onAudio({ sequence: 1 });
    forwarder.onAudio({ sequence: 2 });
    expect(messages).toHaveLength(0);

    queuedFlush?.();
    expect(messages).toEqual([{ type: 'hud:audio', detail: { data: { sequence: 2 } } }]);
  });
});
