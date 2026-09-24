import { describe, expect, it } from 'vitest';
import { deriveHudDisplayState } from './hudStatus';

const ready = { status: 'ready' as const, pendingWrites: 0, nativeBusy: false, metadataLoading: false, errors: [] };

describe('HUD status feedback', () => {
  it('only reports synchronization after loading and queued writes finish', () => {
    expect(deriveHudDisplayState({ ...ready, status: 'loading' })).toBe('loading');
    expect(deriveHudDisplayState({ ...ready, metadataLoading: true })).toBe('loading');
    expect(deriveHudDisplayState({ ...ready, pendingWrites: 2 })).toBe('saving');
    expect(deriveHudDisplayState({ ...ready, status: 'saving' })).toBe('saving');
    expect(deriveHudDisplayState(ready)).toBe('synced');
  });

  it('distinguishes a native action from background persistence', () => {
    expect(deriveHudDisplayState({ ...ready, nativeBusy: true, pendingWrites: 1 })).toBe('applying');
    expect(deriveHudDisplayState({ ...ready, pendingWrites: 1 })).toBe('saving');
  });

  it.each(['config', 'native', 'metadata'])('keeps %s failure visible after a successful config save', source => {
    expect(deriveHudDisplayState({ ...ready, errors: [null, `${source} failed`] })).toBe('attention');
  });

  it('does not mask unresolved errors while another operation runs or retries', () => {
    expect(deriveHudDisplayState({ ...ready, pendingWrites: 2, nativeBusy: true, errors: ['Failed'] })).toBe('attention');
    expect(deriveHudDisplayState({ ...ready, status: 'error' })).toBe('attention');
    expect(deriveHudDisplayState({ ...ready, errors: [null, undefined, ''] })).toBe('synced');
  });
});
