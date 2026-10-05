import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_CONFIG } from '../hudConfig';
import { createOverlayControlRuntime, normalizeHudRuntimeConfig, type HudConfigRecord } from '../overlayControlRuntime';

function response(data: unknown) { return { ok: true, json: async () => data }; }

describe('LFA expansion persistence and delivery', () => {
  it('normalizes malformed active-LFA settings without dropping future fields', () => {
    expect(normalizeHudRuntimeConfig({
      hudStyle: 'lfa_center_ring', lfaManualExpand: 'false', lfaAutoExpand: 1, futureField: 'kept',
    })).toMatchObject({ lfaManualExpand: false, lfaAutoExpand: false, futureField: 'kept' });
  });

  it('queues both switch writes, broadcasts them, reloads, changes styles and resets', async () => {
    let disk: unknown = { hudStyle: 'lfa_center_ring', enabled: true, futureField: { keep: 3 } };
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
    await runtime.refresh();
    await Promise.all([runtime.updateConfig({ lfaManualExpand: true }), runtime.updateConfig({ lfaAutoExpand: true })]);
    expect(saved.map(config => [config.lfaManualExpand, config.lfaAutoExpand])).toEqual([[true, false], [true, true]]);
    expect(broadcasts).toContainEqual({ type: 'config', data: expect.objectContaining({ lfaManualExpand: true, lfaAutoExpand: true }) });
    expect(runtime.getSnapshot().pendingWrites).toBe(0);

    const reloaded = createOverlayControlRuntime(transport);
    await reloaded.refresh();
    expect(reloaded.getSnapshot().config).toMatchObject({ lfaManualExpand: true, lfaAutoExpand: true, futureField: { keep: 3 } });
    await reloaded.updateConfig({ hudStyle: 'simple' });
    await reloaded.updateConfig({ hudStyle: 'lfa_center_ring' });
    expect(reloaded.getSnapshot().config).toMatchObject({ lfaManualExpand: true, lfaAutoExpand: true });
    await reloaded.updateConfig({ lfaManualExpand: false });
    expect(reloaded.getSnapshot().config).toMatchObject({ lfaManualExpand: false, lfaAutoExpand: true });

    await reloaded.replaceConfig({ ...DEFAULT_HUD_CONFIG, enabled: true });
    await reloaded.updateConfig({ hudStyle: 'lfa_center_ring' });
    const reset = createOverlayControlRuntime(transport);
    await reset.refresh();
    expect(reset.getSnapshot().config).toMatchObject({ enabled: true, lfaManualExpand: false, lfaAutoExpand: false });
  });

  it('accepts remote config updates without changing unrelated style settings', async () => {
    const runtime = createOverlayControlRuntime({
      readConfig: async () => response({ hudStyle: 'simple', scale: 0.8, futureField: 'keep' }),
      saveConfig: async () => response({ success: true }),
    });
    await runtime.refresh();
    runtime.acceptBroadcast({ ...runtime.getSnapshot().config, lfaManualExpand: true, lfaAutoExpand: true });
    expect(runtime.getSnapshot().config).toMatchObject({
      hudStyle: 'simple', scale: 0.8, futureField: 'keep', lfaManualExpand: true, lfaAutoExpand: true,
    });
  });
});
