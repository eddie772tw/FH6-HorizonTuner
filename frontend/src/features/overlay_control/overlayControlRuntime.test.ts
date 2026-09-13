import { describe, expect, it } from 'vitest';
import {
  applyHudConfigPatch,
  createOverlayControlRuntime,
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

describe('overlay control runtime', () => {
  it('deeply patches typed nested fields while preserving unknown persisted fields and S650 normalization', () => {
    const runtime = createOverlayControlRuntime(createTransport());
    const patched = applyHudConfigPatch(runtime.getSnapshot().config, {
      hudStyle: 's650_normal',
      elements: { showGauge: false },
      units: { speed: 'mph' },
      pluginField: { source: 'custom' },
    });

    expect(patched.hudStyle).toBe('s650_hmi');
    expect(patched.s650Theme).toBe('normal');
    expect(patched.elements.showGauge).toBe(false);
    expect(patched.elements.showSpeed).toBe(true);
    expect(patched.units?.speed).toBe('mph');
    expect(patched.units?.power).toBe('hp');
    expect(patched.pluginField).toEqual({ source: 'custom' });
  });

  it('serializes fast writes and retains the newest complete snapshot', async () => {
    const first = deferred<ResponseLike>();
    const second = deferred<ResponseLike>();
    const saved: unknown[] = [];
    const runtime = createOverlayControlRuntime(createTransport({
      saveConfig: async config => {
        saved.push(config);
        return saved.length === 1 ? first.promise : second.promise;
      },
    }));

    const saveScale = runtime.updateConfig({ scale: 1.4, pluginField: 'retained' });
    const saveElement = runtime.updateConfig({ elements: { showGauge: false } });
    await Promise.resolve();
    expect(saved).toHaveLength(1);
    expect((saved[0] as { scale: number }).scale).toBe(1.4);

    first.resolve(response({ success: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saved).toHaveLength(2);
    expect((saved[1] as { scale: number }).scale).toBe(1.4);
    expect((saved[1] as { elements: { showGauge: boolean } }).elements.showGauge).toBe(false);
    expect((saved[1] as { pluginField: string }).pluginField).toBe('retained');

    second.resolve(response({ success: true }));
    await expect(saveScale).resolves.toBe(true);
    await expect(saveElement).resolves.toBe(true);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'ready', pendingWrites: 0 });
  });

  it('does not accept a slow GET or later BroadcastChannel payload over a local enabled change', async () => {
    const read = deferred<ResponseLike>();
    const save = deferred<ResponseLike>();
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => read.promise,
      saveConfig: async () => save.promise,
    }));

    const refresh = runtime.refresh();
    const write = runtime.updateConfig({ enabled: true, scale: 1.25 });
    read.resolve(response({ enabled: false, hudStyle: 'vfd', scale: 0.5 }));
    await expect(refresh).resolves.toBe(false);
    expect(runtime.getSnapshot().config).toMatchObject({ enabled: true, scale: 1.25 });

    save.resolve(response({ success: true }));
    await expect(write).resolves.toBe(true);
    runtime.acceptBroadcast({ enabled: false, hudStyle: 'vfd', scale: 0.5 });
    expect(runtime.getSnapshot().config).toMatchObject({ enabled: true, scale: 1.25 });
  });

  it('treats non-success HTTP and rejected success bodies as unsaved, then retries the current snapshot', async () => {
    let attempts = 0;
    const runtime = createOverlayControlRuntime(createTransport({
      saveConfig: async () => {
        attempts += 1;
        return attempts === 1 ? response({ error: 'disk unavailable' }, false, 503) : response({ success: true });
      },
    }));

    await expect(runtime.updateConfig({ scale: 1.6 })).resolves.toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'error', pendingWrites: 0 });
    expect(runtime.getSnapshot().error).toContain('HTTP 503');

    await expect(runtime.retry()).resolves.toBe(true);
    expect(runtime.getSnapshot()).toMatchObject({ status: 'ready', pendingWrites: 0, error: null });
  });

  it('takes the authoritative enabled value on a fresh runtime read instead of forcing it false', async () => {
    const runtime = createOverlayControlRuntime(createTransport({
      readConfig: async () => response({ enabled: true, hudStyle: 's650_hmi', s650Theme: 'track' }),
    }));

    await expect(runtime.refresh()).resolves.toBe(true);
    expect(runtime.getSnapshot().config).toMatchObject({ enabled: true, hudStyle: 's650_hmi', s650Theme: 'track' });
  });
});
