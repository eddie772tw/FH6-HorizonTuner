import { describe, expect, it } from 'vitest';
import { normalizeR34MfdConfig } from './config';
import { normalizeHudRuntimeConfig, applyHudConfigPatch, createOverlayControlRuntime } from '../overlayControlRuntime';
describe('R34 settings contract', () => {
  it('normalizes only its own style and never coerces string booleans', () => {
    const other = { hudStyle: 'vfd', r34MfdMode: 'future' }; expect(normalizeR34MfdConfig(other)).toBe(other);
    expect(normalizeR34MfdConfig({ hudStyle: 'r34_mfd', r34ShowCluster: 'false', r34MfdMode: 'bad', r34Lighting: null })).toEqual({
      hudStyle: 'r34_mfd', r34ShowCluster: true, r34MfdMode: 'single', r34Lighting: 'night',
    });
  });
  it.each(['single', 'twin', 'multi', 'g', 'lap'])('retains mode %s and unrelated config', mode => {
    const config = normalizeHudRuntimeConfig({ hudStyle: 'r34_mfd', r34MfdMode: mode, r34ShowCluster: false, r34Lighting: 'day', futureField: 7 });
    expect(config.r34MfdMode).toBe(mode); expect(config.r34ShowCluster).toBe(false); expect(config.futureField).toBe(7);
    expect(applyHudConfigPatch(config, { r34Lighting: 'night' }).r34MfdMode).toBe(mode);
  });
  it('persists and broadcasts the same settings through the real runtime and survives refresh', async () => {
    let saved: any = { hudStyle: 'r34_mfd' }; const messages: any[] = [];
    const runtime = createOverlayControlRuntime({ readConfig: async () => ({ ok: true, json: async () => saved }),
      saveConfig: async value => { saved = structuredClone(value); return { ok: true, json: async () => ({ success: true }) }; } }, { postMessage: value => messages.push(value) });
    await runtime.refresh(); await runtime.updateConfig({ r34MfdMode: 'lap', r34ShowCluster: false, r34Lighting: 'day' });
    await runtime.refresh(); expect(saved.r34MfdMode).toBe('lap'); expect(runtime.getSnapshot().config.r34Lighting).toBe('day');
    expect(JSON.stringify(messages)).toContain('"r34MfdMode":"lap"');
  });
});
