import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { createOverlayControlRuntime, normalizeHudRuntimeConfig, type HudConfigRecord } from '../overlayControlRuntime';
import { STACK_ST8100_DEFAULTS } from './config';

const response = (data: unknown) => ({ ok: true, json: async () => data });

describe('Stack GUI config persistence and delivery', () => {
  it('leaves inactive absent settings absent and normalizes present ones', () => {
    expect(normalizeHudRuntimeConfig({ hudStyle: 'simple' })).not.toHaveProperty('stackSt8100Dial');
    expect(normalizeHudRuntimeConfig({ hudStyle: 'simple', stackSt8100Dial: 'bad', future: 3 }))
      .toMatchObject({ stackSt8100Dial: 'auto', future: 3 });
  });

  it('queues selector and warning writes, projects units, reloads, switches style, and resets', async () => {
    let disk: unknown = { hudStyle: 'stack_st8100', enabled: true, future: { keep: 2 } };
    const saved: HudConfigRecord[] = [];
    const broadcasts: unknown[] = [];
    const transport = {
      readConfig: async () => response(disk),
      saveConfig: async (config: HudConfigRecord) => {
        disk = structuredClone(config); saved.push(structuredClone(config));
        return response({ success: true });
      },
    };
    const runtime = createOverlayControlRuntime(transport, { postMessage: message => broadcasts.push(message) });
    runtime.setEffectiveUnits({ speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'hp' });
    await runtime.refresh();
    runtime.acceptBroadcast({ ...runtime.getSnapshot().config, stackSt8100Field3: 'rpm' });
    expect(runtime.getSnapshot().config.stackSt8100Field3).toBe('rpm');
    await Promise.all([
      runtime.updateConfig({ stackSt8100Field1: 'current_lap', stackSt8100Field2: 'tire_max', stackSt8100Dial: '0-4-10' }),
      runtime.updateConfig({ stackSt8100Page: 'peaks', stackSt8100TemperatureUnit: 'f', stackSt8100TireWarningEnabled: true, stackSt8100TireWarningC: 110 }),
      runtime.updateConfig({ stackSt8100BoostWarningEnabled: true, stackSt8100BoostWarningBar: 1.8 }),
    ]);
    expect(saved).toHaveLength(3);
    expect(saved[0].stackSt8100Page).toBe('live');
    expect(saved[1].stackSt8100BoostWarningEnabled).toBe(false);
    expect(saved[2]).toMatchObject({ future: { keep: 2 }, stackSt8100TireWarningC: 110, stackSt8100BoostWarningBar: 1.8 });
    expect(saved[2]).not.toHaveProperty('effectiveUnits');
    expect(broadcasts).toContainEqual({ type: 'config', data: expect.objectContaining({ stackSt8100BoostWarningBar: 1.8, effectiveUnit: 'mph', effectiveUnits: expect.objectContaining({ boostPressure: 'psi' }) }) });
    expect(runtime.getSnapshot().pendingWrites).toBe(0);

    const reloaded = createOverlayControlRuntime(transport);
    await reloaded.refresh();
    await reloaded.updateConfig({ hudStyle: 'simple' });
    await reloaded.updateConfig({ hudStyle: 'stack_st8100' });
    expect(reloaded.getSnapshot().config).toMatchObject({ stackSt8100Page: 'peaks', stackSt8100Dial: '0-4-10', stackSt8100TireWarningC: 110, stackSt8100BoostWarningBar: 1.8 });
    reloaded.acceptBroadcast({ ...reloaded.getSnapshot().config, stackSt8100Page: 'live', future: { keep: 2 } });
    // Delayed renderer broadcasts cannot overwrite a newer local persistence revision.
    expect(reloaded.getSnapshot().config.stackSt8100Page).toBe('peaks');
    await reloaded.replaceConfig({ ...DEFAULT_HUD_CONFIG, enabled: true });
    expect(reloaded.getSnapshot().config).not.toHaveProperty('stackSt8100Page');
    await reloaded.updateConfig({ hudStyle: 'stack_st8100' });
    const reset = createOverlayControlRuntime(transport);
    await reset.refresh();
    expect(reset.getSnapshot().config).toMatchObject({ enabled: true, ...STACK_ST8100_DEFAULTS });
  });
});
