import { describe, expect, it } from 'vitest';
import { LITE_TABS } from './LiteNavigation';

describe('LiteNavigation contract', () => {
  it('exposes exactly the Dashboard, HUD Overlay, and Settings tabs', () => {
    expect(LITE_TABS).toEqual([
      { id: 'telemetry', label: 'Dashboard' },
      { id: 'overlay', label: 'HUD Overlay' },
      { id: 'settings', label: 'Settings' },
    ]);
  });
});
