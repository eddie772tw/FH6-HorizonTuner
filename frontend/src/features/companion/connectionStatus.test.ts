import { describe, expect, it } from 'vitest';
import { getAggregateConnectionStatus } from './connectionStatus';

describe('getAggregateConnectionStatus', () => {
  it.each([
    [true, true, 'success', 'Connected', 'Desktop frontend and Companion backend connected'],
    [false, true, 'warning', 'Desktop frontend offline', 'Companion backend connected, desktop frontend offline'],
    [true, false, 'warning', 'Companion backend offline', 'Desktop frontend connected, Companion backend offline'],
    [false, false, 'danger', 'Disconnected', 'Desktop frontend and Companion backend disconnected'],
  ] as const)('maps desktop=%s and backend=%s to %s status', (desktopOnline, backendOnline, color, label, accessibleLabel) => {
    expect(getAggregateConnectionStatus(desktopOnline, backendOnline)).toMatchObject({ color, label, accessibleLabel });
  });
});
