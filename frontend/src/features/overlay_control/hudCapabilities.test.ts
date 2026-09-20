import { describe, expect, it } from 'vitest';
import { deriveHudCapabilities } from './hudCapabilities';

describe('HUD capability boundary', () => {
  it('keeps web persistence and style controls available while native commands are unsupported', () => {
    const capabilities = deriveHudCapabilities({ nativeAvailable: false, hudStyle: 'classic_jdm' });

    expect(capabilities.nativeWindow.status).toBe('unsupported');
    expect(capabilities.monitorSelection.status).toBe('unsupported');
    expect(capabilities.persistedConfig.status).toBe('available');
    expect(capabilities.classicJdmControls.status).toBe('available');
    expect(capabilities.s650Controls.status).toBe('available');
  });

  it('marks native capabilities degraded without changing persisted config ownership', () => {
    const capabilities = deriveHudCapabilities({
      nativeAvailable: true,
      nativeDegraded: true,
      hudStyle: 's650_hmi',
    });

    expect(capabilities.nativeWindow.status).toBe('degraded');
    expect(capabilities.reload.status).toBe('degraded');
    expect(capabilities.persistedConfig.status).toBe('available');
    expect(capabilities.s650Controls.status).toBe('available');
  });
});

