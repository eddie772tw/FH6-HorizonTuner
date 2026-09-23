import { describe, expect, it } from 'vitest';
import { getAggregateConnectionStatus } from './connectionStatus';

describe('getAggregateConnectionStatus', () => {
  it.each([
    [true, true, 'success', '已連線'],
    [false, true, 'warning', '桌面前端未連線'],
    [true, false, 'warning', 'Companion 後端未連線'],
    [false, false, 'danger', '未連線'],
  ] as const)('maps desktop=%s and backend=%s to %s status', (desktopOnline, backendOnline, color, label) => {
    expect(getAggregateConnectionStatus(desktopOnline, backendOnline)).toMatchObject({ color, label });
  });
});
