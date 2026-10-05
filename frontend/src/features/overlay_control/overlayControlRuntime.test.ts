import { describe, expect, it } from 'vitest';
import {
  applyHudConfigPatch,
  createOverlayControlRuntime,
  normalizeHudRuntimeConfig,
  type OverlayControlTransport,
  type ResponseLike,
} from './overlayControlRuntime';

function response(data: unknown, ok = true, status = 200): ResponseLike {
  return { ok, status, json: async () => data };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function createTransport(overrides: Partial<OverlayControlTransport> = {}): OverlayControlTransport {
  return {
    readConfig: async () => response({ enabled: true, hudStyle: 'vfd', pluginField: { source: 'server' } }),
    saveConfig: async () => response({ success: true }),
    ...overrides,
  };
}

async function flushTasks() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('overlay control runtime', () => {
  it.each([
    [undefined, 'C'], [null, 'C'], ['', 'C'], ['c', 'C'], ['f', 'C'],
    ['°F', 'C'], ['K', 'C'], [true, 'C'], [32, 'C'], [{}, 'C'], [[], 'C'],
    ['C', 'C'], ['F', 'F'],
  ])('normalizes HUD temperature %j to %s without changing other unit values', (temperature, expected) => {
    const normalized = normalizeHudRuntimeConfig({
      units: { speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'kw', temperature },
    });
    expect(normalized.units).toEqual({
      speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'kw', temperature: expected,
    });
  });

  it('defaults legacy HUD configs without temperature to Celsius', () => {
    expect(normalizeHudRuntimeConfig({}).units?.temperature).toBe('C');
    expect(normalizeHudRuntimeConfig({ units: { speed: 'mph' } }).units).toEqual({
      speed: 'mph', boostPressure: 'bar', torque: 'nm', power: 'hp', temperature: 'C',
    });
  });

  it('deeply patches typed nested fields while preserving unknown persisted fields and S650 normalization', () => {
    const runtime = createOverlayControlRuntime(createTransport());
    const persistedConfig = {
      ...runtime.getSnapshot().config,
      elements: { ...runtime.getSnapshot().config.elements, pluginElement: { retained: true } },
      units: { ...runtime.getSnapshot().config.units!, temperature: 'F' as const, pluginUnit: { retained: true } },
      pluginField: { nested: { retained: true } },
    };
    const patched = applyHudConfigPatch(persistedConfig, {
      hudStyle: 's650_normal',
      elements: { showGauge: false },
      units: { speed: 'mph' },
    });

    expect(patched.hudStyle).toBe('s650_hmi');
    expect(patched.s650Theme).toBe('normal');
    expect(patched.elements.showGauge).toBe(false);
    expect(patched.elements.showSpeed).toBe(true);
    expect(patched.units?.speed).toBe('mph');
    expect(patched.units?.power).toBe('hp');
    expect(patched.units?.temperature).toBe('F');
    expect((patched.elements as Record<string, unknown>).pluginElement).toEqual({ retained: true });
    expect((patched.units as Record<string, unknown>).pluginUnit).toEqual({ retained: true });
    expect(patched.pluginField).toEqual({ nested: { retained: true } });
  });

  it('retries a failed initial read without POSTing defaults or replacing the authoritative enabled config', async () => {
    const requests = [
      response({ error: 'offline' }, false, 503),
      response({ enabled: true, hudStyle: 'vfd', pluginField: { source: 'persisted' } }),
    ];
    const saved: unknown[] = [];
    const channelMessages: unknown[] = [];
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => requests.shift()!,
      saveConfig: async config => {
        saved.push(config);
        return response({ success: true });
      },
    }), { postMessage: message => channelMessages.push(message) });

    runtime.setEffectiveUnits({ speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'kw', temperature: 'F' });
    expect(channelMessages).toHaveLength(0);
    await expect(runtime.refresh()).resolves.toBe(false);
    await expect(runtime.retry()).resolves.toBe(true);

    expect(saved).toHaveLength(0);
    expect(runtime.getSnapshot().config).toMatchObject({ enabled: true, pluginField: { source: 'persisted' } });
    expect(channelMessages).toEqual([{
      type: 'config',
      data: expect.objectContaining({ enabled: true, effectiveUnit: 'mph', effectiveUnits: { speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'kw', temperature: 'F' } }),
    }]);
  });

  it('inherits app temperature live while preserving independent units through saves and reloads', async () => {
    let persisted: unknown = { followAppUnits: true, units: { temperature: 'C' } };
    const transport = createTransport({
      readConfig: async () => response(persisted),
      saveConfig: async config => {
        persisted = JSON.parse(JSON.stringify(config));
        return response({ success: true });
      },
    });
    const channelMessages: unknown[] = [];
    const channel = { postMessage: (message: unknown) => channelMessages.push(message) };
    const runtime = createOverlayControlRuntime(transport, channel);
    const appUnits = { speed: 'mph', boostPressure: 'psi', torque: 'lbft', power: 'kw', temperature: 'F' } as const;
    const expectTemperature = (temperature: 'C' | 'F') => {
      expect(channelMessages.at(-1)).toMatchObject({
        type: 'config', data: { effectiveUnits: { temperature } },
      });
    };
    runtime.setEffectiveUnits(appUnits);
    await expect(runtime.refresh()).resolves.toBe(true);
    expectTemperature('F');
    expect(runtime.getSnapshot().config.units?.temperature).toBe('C');

    runtime.setEffectiveUnits({ ...appUnits, temperature: 'C' });
    expectTemperature('C');
    await expect(runtime.updateConfig({ followAppUnits: false, units: { temperature: 'F' } })).resolves.toBe(true);
    expectTemperature('F');
    await flushTasks();
    expect(persisted).toMatchObject({ followAppUnits: false, units: { temperature: 'F' } });
    expect(persisted).not.toHaveProperty('effectiveUnit');
    expect(persisted).not.toHaveProperty('effectiveUnits');

    const reloaded = createOverlayControlRuntime(transport, channel);
    reloaded.setEffectiveUnits({ ...appUnits, temperature: 'C' });
    await expect(reloaded.refresh()).resolves.toBe(true);
    expectTemperature('F');
    expect(reloaded.getSnapshot().config.units?.temperature).toBe('F');

    await expect(reloaded.updateConfig({ followAppUnits: true })).resolves.toBe(true);
    expectTemperature('C');
    reloaded.setEffectiveUnits(appUnits);
    expectTemperature('F');
    reloaded.setEffectiveUnits({ ...appUnits, temperature: 'invalid' as 'C' });
    expectTemperature('C');
    reloaded.setEffectiveUnits(appUnits);
    reloaded.setEffectiveUnits({ ...appUnits, temperature: undefined as unknown as 'C' });
    expectTemperature('C');
    await flushTasks();
    await expect(reloaded.updateConfig({ followAppUnits: false })).resolves.toBe(true);
    expectTemperature('F');
    await flushTasks();
    expect(persisted).not.toHaveProperty('effectiveUnits');
  });

  it('waits for an authoritative base before applying a local patch, retaining unknown nested config', async () => {
    const initialRead = deferred<ResponseLike>();
    const saved: unknown[] = [];
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => initialRead.promise,
      saveConfig: async config => {
        saved.push(config);
        return response({ success: true });
      },
    }));

    const update = runtime.updateConfig({ scale: 1.25, elements: { showGauge: false } });
    await Promise.resolve();
    expect(saved).toHaveLength(0);

    initialRead.resolve(response({
      enabled: true,
      hudStyle: 'vfd',
      elements: { showSpeed: false },
      pluginField: { nested: 'keep' },
    }));
    await expect(update).resolves.toBe(true);

    expect(saved).toEqual([expect.objectContaining({
      enabled: true,
      scale: 1.25,
      pluginField: { nested: 'keep' },
      elements: expect.objectContaining({ showGauge: false, showSpeed: false }),
    })]);
  });

  it('serializes fast patches from the latest snapshot and does not persist renderer-only units', async () => {
    const first = deferred<ResponseLike>();
    const second = deferred<ResponseLike>();
    const saved: Array<Record<string, unknown>> = [];
    let authoritative: Record<string, unknown> = { enabled: true, hudStyle: 'vfd', pluginField: 'retained' };
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => response(authoritative),
      saveConfig: async config => {
        saved.push(config);
        authoritative = config;
        return saved.length === 1 ? first.promise : second.promise;
      },
    }));
    await expect(runtime.refresh()).resolves.toBe(true);

    const saveScale = runtime.updateConfig({ scale: 1.4 });
    const saveElement = runtime.updateConfig({ elements: { showGauge: false } });
    await Promise.resolve();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ scale: 1.4, pluginField: 'retained' });
    expect(saved[0]).not.toHaveProperty('effectiveUnit');
    expect(saved[0]).not.toHaveProperty('effectiveUnits');

    first.resolve(response({ success: true }));
    await flushTasks();
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({
      scale: 1.4,
      elements: expect.objectContaining({ showGauge: false }),
      pluginField: 'retained',
    });

    second.resolve(response({ success: true }));
    await expect(saveScale).resolves.toBe(true);
    await expect(saveElement).resolves.toBe(true);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'ready', pendingWrites: 0 });
  });

  it('rejects a GET that began while a write was pending, then reconciles from the completed authority', async () => {
    const staleRead = deferred<ResponseLike>();
    const pendingSave = deferred<ResponseLike>();
    let reads = 0;
    let authoritative: Record<string, unknown> = { enabled: true, hudStyle: 'vfd', scale: 1, pluginField: 'keep' };
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => {
        reads += 1;
        return reads === 2 ? staleRead.promise : response(authoritative);
      },
      saveConfig: async config => {
        authoritative = config;
        return pendingSave.promise;
      },
    }));
    await expect(runtime.refresh()).resolves.toBe(true);

    const write = runtime.updateConfig({ enabled: false, scale: 1.25 });
    await Promise.resolve();
    const refreshDuringWrite = runtime.refresh();
    pendingSave.resolve(response({ success: true }));
    await expect(write).resolves.toBe(true);

    staleRead.resolve(response({ enabled: true, hudStyle: 'vfd', scale: 0.5, pluginField: 'stale' }));
    await expect(refreshDuringWrite).resolves.toBe(false);
    await flushTasks();

    expect(runtime.getSnapshot().config).toMatchObject({ enabled: false, scale: 1.25, pluginField: 'keep' });
    expect(reads).toBe(3);
  });

  it('invalidates an in-flight GET when an external authoritative config is accepted', async () => {
    const staleRead = deferred<ResponseLike>();
    const configA = {
      enabled: false,
      hudStyle: 'vfd',
      scale: 1,
      pluginField: { source: 'A' },
      elements: { showSpeed: true, pluginElement: { source: 'A' } },
    };
    const configB = {
      enabled: true,
      hudStyle: 'vfd',
      scale: 1,
      pluginField: { source: 'B' },
      elements: { showSpeed: false, pluginElement: { source: 'B' } },
    };
    let reads = 0;
    let authoritative: Record<string, unknown> = configA;
    const saved: Array<Record<string, unknown>> = [];
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => {
        reads += 1;
        return reads === 2 ? staleRead.promise : response(authoritative);
      },
      saveConfig: async config => {
        saved.push(config);
        authoritative = config;
        return response({ success: true });
      },
    }));
    await expect(runtime.refresh()).resolves.toBe(true);

    const pendingRefresh = runtime.refresh();
    runtime.acceptBroadcast(configB);
    expect(runtime.getSnapshot().config).toMatchObject({
      enabled: true,
      pluginField: { source: 'B' },
      elements: expect.objectContaining({ showSpeed: false, pluginElement: { source: 'B' } }),
    });

    staleRead.resolve(response(configA));
    await expect(pendingRefresh).resolves.toBe(false);
    expect(runtime.getSnapshot().config).toMatchObject({ pluginField: { source: 'B' } });

    await expect(runtime.updateConfig({ scale: 1.25 })).resolves.toBe(true);
    expect(saved).toEqual([expect.objectContaining({
      enabled: true,
      scale: 1.25,
      pluginField: { source: 'B' },
      elements: expect.objectContaining({ showSpeed: false, pluginElement: { source: 'B' } }),
    })]);
  });

  it('treats rejected save responses as unsaved, then retries the current authoritative snapshot', async () => {
    let attempts = 0;
    const runtime = createOverlayControlRuntime(createTransport({
      saveConfig: async () => {
        attempts += 1;
        return attempts === 1 ? response({ error: 'disk unavailable', success: false }) : response({ success: true });
      },
    }));
    await expect(runtime.refresh()).resolves.toBe(true);

    await expect(runtime.updateConfig({ scale: 1.6 })).resolves.toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'error', pendingWrites: 0 });
    expect(runtime.getSnapshot().error).toContain('disk unavailable');

    await expect(runtime.retry()).resolves.toBe(true);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'ready', pendingWrites: 0, error: null });
  });
});
