import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../hud_overlay/lfa_center_ring/lfa-media.js'), 'utf8');
function load() {
  const scope: any = { module: { exports: {} } };
  runInNewContext(source, scope);
  expect(scope.module.exports).toBe(scope.LfaMedia);
  return scope.LfaMedia;
}
const M = load();
const media = (patch: object = {}) => ({
  has_media: true, success: true, state: 'live', source: 'winrt', status: 'playing',
  title: 'Song A', artist: 'Artist', album_title: 'Album', position_seconds: 30,
  start_seconds: 0, duration_seconds: 120, thumbnail_available: true,
  thumbnail_url: '/api/overlay/media/thumbnail?v=abc123', ...patch,
});
const response = (snapshot = media()) => ({ ok: true, status: 200, json: async () => snapshot });
function deferred() {
  let resolve!: (value: any) => void, reject!: (reason: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Validate display-domain behavior, not the DOM or the renderer's implementation.
describe('LFA media normalization', () => {
  it.each(['playing', 'paused', 'stopped', 'opened', 'changing'])('accepts real %s session metadata', status => {
    expect(M.normalize(media({ status }))).toMatchObject({ available: true, has_valid_metadata: true, status, freshness: 'live' });
  });
  it.each([null, undefined, {}, { has_media: false, title: 'Turbo Fire', artist: 'TANTRON' },
    media({ has_media: false }), media({ has_media: 'true' }), media({ success: false }), media({ source: 'fixture' }),
    media({ status: '' }), media({ status: 'none' }), media({ status: 'closed' }), media({ status: 'invalid' }),
    media({ state: 'unavailable' }), media({ state: 'invalid' })])('does not invent availability from malformed/fallback input %j', input => {
    expect(M.normalize(input)).toMatchObject({ available: false, title: '', artUrl: null });
  });
  it('requires useful metadata but accepts incomplete metadata and verified artwork', () => {
    const blank = { title: '  ', artist: null, album_title: '', thumbnail_available: false };
    expect(M.normalize(media(blank))).toMatchObject({ available: false, has_valid_metadata: false });
    for (const patch of [{ title: 'Title only' }, { artist: 'Artist only' }, { album_title: 'Album only' }, { thumbnail_available: true }]) {
      expect(M.normalize(media({ ...blank, ...patch })).available).toBe(true);
    }
    expect(M.normalize(media({ title: 123, artist: {}, album_title: [], thumbnail_available: false })).available).toBe(false);
  });
  it('keeps user-provided metadata as plain strings for textContent rendering', () => {
    expect(M.normalize(media({ title: ' <img src=x onerror=alert(1)> ', artist: '中文 & <script>' })))
      .toMatchObject({ title: '<img src=x onerror=alert(1)>', artist: '中文 & <script>' });
  });
  it('permits only the relative provider thumbnail route with explicit eligibility', () => {
    expect(M.normalize(media()).artUrl).toBe('/api/overlay/media/thumbnail?v=abc123');
    for (const thumbnail_url of ['https://evil.test/art.jpg', '//evil.test/art', 'data:image/svg+xml,<svg/>',
      'blob:whatever', 'file:///cover.png', '/api/overlay/media/thumbnail', '/other?v=abc',
      '/api/overlay/media/thumbnail?v=abc&redirect=https://evil.test', '/api/overlay/media/thumbnail?v=abc#x',
      '/api/overlay/media/thumbnail?v=../private', '/api/overlay/media/thumbnail?v=%2fsecret']) {
      expect(M.normalize(media({ thumbnail_url })).artUrl).toBeNull();
    }
    expect(M.normalize(media({ thumbnail_available: false })).artUrl).toBeNull();
    expect(M.normalize(media({ thumbnail_available: 'true' })).artUrl).toBeNull();
  });
  it('preserves genuine zero and uses duration as length with a nonzero timeline start', () => {
    expect(M.normalize(media({ position_seconds: 0 }))).toMatchObject({ position: 0, duration: 120, progress: 0 });
    expect(M.normalize(media({ position_seconds: 130, start_seconds: 100 }))).toMatchObject({ position: 30, duration: 120, progress: .25 });
    expect(M.normalize(media({ position_seconds: 999 }))).toMatchObject({ position: 999, progress: 1 });
    expect(M.normalize(media({ position_seconds: 10, start_seconds: 100 }))).toMatchObject({ position: -90, progress: 0 });
  });
  it('never converts absent, malformed or non-finite timeline values into a made-up progress bar', () => {
    for (const value of [null, undefined, '', '20', NaN, Infinity, -1, 1e30]) {
      expect(M.normalize(media({ position_seconds: value }))).toMatchObject({ available: true, position: null, progress: null });
      expect(M.normalize(media({ start_seconds: value }))).toMatchObject({ position: null, progress: null });
      expect(M.normalize(media({ duration_seconds: value }))).toMatchObject({ duration: null, progress: null });
    }
    expect(M.normalize(media({ duration_seconds: 0 }))).toMatchObject({ duration: 0, progress: null });
  });
  it('labels provider stale snapshots without claiming they establish live availability', () => {
    expect(M.normalize(media({ state: 'stale', source: 'stale' }))).toMatchObject({ available: false, freshness: 'stale', title: 'Song A' });
  });
});

describe('LFA-owned media health lifecycle', () => {
  const services: any[] = [];
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { services.splice(0).forEach(service => service.destroy()); vi.useRealTimers(); });
  function service(fetch = vi.fn(async () => response()), runtime = vi.fn(async () => response({ capabilities: { systemMedia: true } } as any))) {
    const changes = vi.fn();
    const transport = vi.fn((url: string, options: any) => url === '/api/runtime' ? runtime() : (fetch as any)(url, options));
    const client = M.create({ fetch: transport, now: () => Date.now(), setTimeout, clearTimeout, AbortController, onChange: changes });
    services.push(client);
    return { client, fetch, changes, runtime, transport };
  }
  it('reads the explicit runtime capability once per enable and stays quiet on Linux/Lite', async () => {
    const runtime = vi.fn(async () => response({ platform: 'linux', capabilities: { systemMedia: false } } as any));
    const { client, fetch } = service(vi.fn(async () => response()), runtime);
    client.start(); client.setEnabled(true); await vi.advanceTimersByTimeAsync(120000);
    expect(runtime).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
    expect(client.view().available).toBe(false); expect(vi.getTimerCount()).toBe(0);
    client.stop(); client.start(); await vi.advanceTimersByTimeAsync(0);
    expect(runtime).toHaveBeenCalledTimes(2); expect(fetch).not.toHaveBeenCalled();
  });
  it('lets explicit later live media override an unsupported capability without hiding real data', async () => {
    const runtime = vi.fn(async () => response({ capabilities: { systemMedia: false } } as any));
    const { client, fetch } = service(vi.fn(async () => response()), runtime);
    client.start(); await vi.advanceTimersByTimeAsync(0); client.accept(media());
    expect(client.view().available).toBe(true);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { capabilities: {} }, { capabilities: { systemMedia: 'false' } }])(
    'does not mistake a missing/malformed capability for explicit unsupported %j', async capability => {
      const { client, fetch } = service(vi.fn(async () => response()), vi.fn(async () => response(capability as any)));
      client.start(); await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1); expect(client.view().available).toBe(true);
    });
  it('falls back to the existing media endpoint after a capability network/JSON failure', async () => {
    const runtime = vi.fn(async () => { throw new Error('capability unavailable'); });
    const { client, fetch } = service(vi.fn(async () => response()), runtime);
    client.start(); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1); expect(client.view().available).toBe(true);
  });
  it('does not let a delayed unsupported capability response overwrite a newer live event', async () => {
    const pending = deferred();
    const { client } = service(vi.fn(async () => response()), vi.fn(() => pending.promise));
    client.start(); client.accept(media());
    pending.resolve(response({ capabilities: { systemMedia: false } } as any));
    await vi.advanceTimersByTimeAsync(4000);
    expect(client.view().available).toBe(true);
  });
  it('only polls when enabled, and repeated configuration never creates concurrent loops', async () => {
    const { client, fetch } = service();
    await vi.advanceTimersByTimeAsync(3000); expect(fetch).not.toHaveBeenCalled();
    client.setEnabled(true); client.start(); client.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual(['/api/overlay/system_media', expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' })]);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(2);
    client.setEnabled(false); client.stop();
    expect(client.view()).toMatchObject({ available: false, title: '', artUrl: null });
    await vi.advanceTimersByTimeAsync(5000); expect(fetch).toHaveBeenCalledTimes(2);
    client.start(); await vi.advanceTimersByTimeAsync(0); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('keeps unchanged paused sessions valid via health GET without advancing playback time', async () => {
    const { client, fetch } = service(vi.fn(async () => response(media({ status: 'paused' }))));
    client.start(); await vi.advanceTimersByTimeAsync(12000);
    expect(client.view()).toMatchObject({ available: true, status: 'paused', position: 30, progress: .25 });
    expect(fetch.mock.calls.length).toBeGreaterThan(2);
  });
  it('suppresses redundant health GET while new live onMedia changes arrive', async () => {
    const { client, fetch } = service(); client.start(); await vi.advanceTimersByTimeAsync(0);
    for (let i = 1; i <= 10; i++) {
      await vi.advanceTimersByTimeAsync(500);
      client.accept(media({ position_seconds: 30 + i }));
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not treat duplicate events as fresh or manufacture elapsed playing time', async () => {
    const fetch = vi.fn(async () => response());
    const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0);
    fetch.mockRejectedValue(new Error('offline'));
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(500); client.accept(media());
      expect(client.view().position).toBe(30);
    }
    await vi.advanceTimersByTimeAsync(500); client.accept(media());
    expect(client.view()).toMatchObject({ available: false, title: '', artUrl: null, progress: null });
  });
  it.each([media({ state: 'stale', source: 'stale' }), media({ success: false }), {}, media({ status: 'invalid' })])(
    'does not extend the three-second grace with stale/malformed successful responses %j', async snapshot => {
      const fetch = vi.fn(async () => response());
      const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0);
      fetch.mockResolvedValue(response(snapshot));
      await vi.advanceTimersByTimeAsync(1000);
      expect(client.view()).toMatchObject({ available: true, freshness: 'stale' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(client.view()).toMatchObject({ available: false, artUrl: null });
    });
  it('never shows fake fallback metadata and gives no-active track changes only the bounded grace', async () => {
    const fallback = media({ has_media: false, title: 'Turbo Fire', artist: 'TANTRON', state: 'unavailable' });
    const { client, fetch } = service(); client.start(); await vi.advanceTimersByTimeAsync(0);
    fetch.mockResolvedValue(response(fallback));
    client.accept(fallback);
    expect(client.view()).toMatchObject({ available: true, freshness: 'stale', title: 'Song A', artist: 'Artist' });
    await vi.advanceTimersByTimeAsync(2999); client.accept(fallback);
    expect(client.view().available).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.view()).toMatchObject({ available: false, has_valid_metadata: false, title: '', artist: '', artUrl: null });
  });
  it('recovers within a track-switch grace without collapsing and confirms an identical session via GET', async () => {
    const { client } = service(); client.start(); await vi.advanceTimersByTimeAsync(0);
    client.accept(media({ has_media: false, state: 'unavailable' }));
    expect(client.view().freshness).toBe('stale');
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.view()).toMatchObject({ available: true, freshness: 'live', title: 'Song A' });
    client.accept(media({ title: 'Song B' }));
    expect(client.view()).toMatchObject({ available: true, freshness: 'live', title: 'Song B' });
  });
  it('backs off unsupported HTTP endpoints and still expires existing media', async () => {
    const fetch = vi.fn(async () => response());
    const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0);
    fetch.mockResolvedValue({ ok: false, status: 404 } as any);
    await vi.advanceTimersByTimeAsync(3000); expect(client.view().available).toBe(false);
    const attempts = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(M.UNSUPPORTED_MS - 3000); expect(fetch).toHaveBeenCalledTimes(attempts);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(attempts + 1);
  });
  it('does not confuse a supported but empty session with an unsupported platform', async () => {
    const { client, fetch } = service(vi.fn(async () => response(media({ has_media: false, state: 'unavailable', source: 'winrt' }))));
    client.start(); await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(4); expect(client.view().available).toBe(false);
  });
  it('times out and aborts a hung request without starting a second in-flight request', async () => {
    const pending = deferred(), fetch = vi.fn(() => pending.promise);
    const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0);
    const signal = (fetch.mock.calls[0] as any)[1].signal;
    await vi.advanceTimersByTimeAsync(10000);
    expect(signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(response()); await vi.advanceTimersByTimeAsync(0);
    expect(client.view().available).toBe(false);
    fetch.mockResolvedValue(response()); await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2); expect(client.view().available).toBe(true);
  });
  it('recovers from compliant AbortController cancellation and JSON/network failures', async () => {
    let attempt = 0;
    const fetch = vi.fn((_url, options) => {
      attempt++;
      if (attempt === 1) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
      if (attempt === 2) return Promise.resolve({ ok: true, json: async () => { throw new Error('bad json'); } });
      return Promise.resolve(response());
    });
    const { client } = service(fetch as any); client.start();
    await vi.advanceTimersByTimeAsync(M.TIMEOUT_MS + 2 * M.POLL_MS);
    expect(client.view()).toMatchObject({ available: true, title: 'Song A' });
  });
  it('rejects old response and old cover art when a newer live event wins', async () => {
    const pending = deferred();
    const { client } = service(vi.fn(() => pending.promise)); client.start(); await vi.advanceTimersByTimeAsync(0);
    client.accept(media({ title: 'Song B', thumbnail_url: '/api/overlay/media/thumbnail?v=bbb' }));
    pending.resolve(response(media())); await vi.advanceTimersByTimeAsync(0);
    expect(client.view()).toMatchObject({ title: 'Song B', artUrl: '/api/overlay/media/thumbnail?v=bbb' });
  });
  it('rejects late JSON parsing but accepts a legitimate ordered return to an earlier track', async () => {
    const body = deferred();
    const { client } = service(vi.fn(async () => ({ ok: true, status: 200, json: () => body.promise })));
    client.start(); await vi.advanceTimersByTimeAsync(0);
    client.accept(media());
    client.accept(media({ title: 'Song B', thumbnail_url: null }));
    body.resolve(media()); await vi.advanceTimersByTimeAsync(0);
    expect(client.view()).toMatchObject({ title: 'Song B', artUrl: null });
    client.accept(media());
    expect(client.view()).toMatchObject({ title: 'Song A', artUrl: '/api/overlay/media/thumbnail?v=abc123' });
  });
  it('fences stop/restart responses and never revives the old session from a replay', async () => {
    const pending = deferred(), fetch = vi.fn(() => pending.promise);
    const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0); client.accept(media());
    client.stop(); client.accept(media({ title: 'Ignored' })); client.start(); client.accept(media());
    expect(client.view().available).toBe(false);
    pending.resolve(response()); await vi.advanceTimersByTimeAsync(0);
    fetch.mockResolvedValue(response(media({ title: 'Reconnected' })));
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.view().title).toBe('Reconnected');
  });
  it('destroy aborts, clears timers, ignores callbacks, and is terminal even after repeated start/config', async () => {
    const pending = deferred(), fetch = vi.fn(() => pending.promise);
    const { client } = service(fetch); client.start(); await vi.advanceTimersByTimeAsync(0); client.accept(media());
    const signal = (fetch.mock.calls[0] as any)[1].signal;
    client.destroy(); client.destroy(); client.start(); client.setEnabled(true); client.accept(media({ title: 'Late event' }));
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    pending.resolve(response()); await vi.advanceTimersByTimeAsync(10000);
    expect(client.view()).toMatchObject({ available: false, title: '', artUrl: null });
    expect(fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('never restores expired state when a view timestamp moves backward', async () => {
    const { client } = service(); client.start(); await vi.advanceTimersByTimeAsync(0);
    expect(client.view(3000).available).toBe(false);
    expect(client.view(10).available).toBe(false);
  });
});
