import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { createOverlayControlRuntime, normalizeHudRuntimeConfig, type HudConfigRecord } from '../overlayControlRuntime';
import { normalizeStackSt8100Alarms, STACK_ST8100_DEFAULTS, STACK_ST8100_LEGACY_KEYS } from './config';
const response = (data: unknown) => ({ ok: true, json: async () => data });

describe('Stack revised GUI persistence and delivery', () => {
  it('normalizes legacy persisted values without leaking new keys to other HUDs', () => {
    expect(normalizeHudRuntimeConfig({ hudStyle: 'simple' })).not.toHaveProperty('stackSt8100Alarms');
    const result = normalizeHudRuntimeConfig({ hudStyle: 'simple', stackSt8100Field3: 'fuel', stackSt8100TireWarningEnabled: true, stackSt8100TireWarningC: 135, future: 3 });
    expect(result).toMatchObject({ stackSt8100Field3: 'race_time', future: 3 });
    expect(result.stackSt8100Alarms?.[0]).toEqual({ metric: 'tire_max', enabled: true, direction: 'high', threshold: 135 });
    for (const key of STACK_ST8100_LEGACY_KEYS) expect(result).not.toHaveProperty(key);
  });
  it('queues alarm and face changes, broadcasts effective units, reloads, switches styles and resets', async () => {
    let disk: unknown = { hudStyle: 'stack_st8100', enabled: true, future: { keep: 2 } };
    const saved: HudConfigRecord[] = [], broadcasts: unknown[] = [];
    const transport = { readConfig: async () => response(disk), saveConfig: async (config: HudConfigRecord) => {
      disk = structuredClone(config); saved.push(structuredClone(config)); return response({ success: true });
    } };
    const runtime = createOverlayControlRuntime(transport, { postMessage: message => broadcasts.push(message) });
    runtime.setEffectiveUnits({ speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'hp' });
    await runtime.refresh();
    const alarms = normalizeStackSt8100Alarms([{ enabled: true, metric: 'speed', direction: 'high', threshold: 180 }, { enabled: true, metric: 'boost', direction: 'low', threshold: -0.3 }]);
    await Promise.all([
      runtime.updateConfig({ stackSt8100Field1: 'power', stackSt8100Field2: 'race_time', stackSt8100Dial: '0-3-10.5', stackSt8100Face: 'white' }),
      runtime.updateConfig({ stackSt8100Alarms: alarms, stackSt8100TemperatureUnit: 'f' }),
    ]);
    expect(saved).toHaveLength(2);
    expect(saved[0].stackSt8100Alarms).toEqual(STACK_ST8100_DEFAULTS.stackSt8100Alarms);
    expect(saved[1]).toMatchObject({ future: { keep: 2 }, stackSt8100Alarms: alarms, stackSt8100Face: 'white' });
    expect(saved[1]).not.toHaveProperty('effectiveUnits');
    expect(broadcasts).toContainEqual({ type: 'config', data: expect.objectContaining({ stackSt8100Alarms: alarms, effectiveUnit: 'mph', effectiveUnits: expect.objectContaining({ boostPressure: 'psi' }) }) });
    const reloaded = createOverlayControlRuntime(transport);
    await reloaded.refresh(); await reloaded.updateConfig({ hudStyle: 'simple' }); await reloaded.updateConfig({ hudStyle: 'stack_st8100' });
    expect(reloaded.getSnapshot().config).toMatchObject({ stackSt8100Face: 'white', stackSt8100Dial: '0-3-10.5', stackSt8100Alarms: alarms });
    await reloaded.replaceConfig({ ...DEFAULT_HUD_CONFIG, enabled: true });
    expect(reloaded.getSnapshot().config).not.toHaveProperty('stackSt8100Alarms');
    await reloaded.updateConfig({ hudStyle: 'stack_st8100' });
    const reset = createOverlayControlRuntime(transport); await reset.refresh();
    expect(reset.getSnapshot().config).toMatchObject({ enabled: true, ...STACK_ST8100_DEFAULTS });
  });
});
