import { describe, expect, it, vi } from 'vitest';
import { relayHudConfig } from './useOverlayWebSocket';

describe('overlay WebSocket HUD-config relay', () => {
  it('forwards effective units to the local channel used by the telemetry formatter', () => {
    const postMessage = vi.fn();
    const effectiveUnits = {
      speed: 'mph',
      boostPressure: 'psi',
      torque: 'lbft',
      power: 'hp',
    };

    relayHudConfig({ postMessage }, { effectiveUnits });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'config',
      data: { effectiveUnits },
    });
  });
});
