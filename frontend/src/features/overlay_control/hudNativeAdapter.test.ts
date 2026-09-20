import { describe, expect, it, vi } from 'vitest';
import { createHudNativeAdapter } from './hudNativeAdapter';

describe('hud native adapter', () => {
  it('reports web sessions as unsupported instead of claiming native success', async () => {
    const adapter = createHudNativeAdapter();

    expect(adapter.available).toBe(false);
    await expect(adapter.toggleHudWindow(true)).resolves.toMatchObject({ status: 'unsupported' });
  });

  it('maps native commands to the existing command names and arguments', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const adapter = createHudNativeAdapter(invoke);

    await adapter.moveHudToMonitor({
      x: 10,
      y: 20,
      width: 1920,
      height: 1080,
      name: 'Primary',
      is_primary: true,
    });
    await adapter.toggleHudWindow(true);
    await adapter.setHudClickThrough(true);
    await adapter.reloadHudWindow();

    expect(invoke).toHaveBeenNthCalledWith(1, 'move_hud_to_monitor', {
      monitorX: 10,
      monitorY: 20,
      width: 1920,
      height: 1080,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'toggle_hud_window', { visible: true, destroy: false });
    expect(invoke).toHaveBeenNthCalledWith(3, 'set_hud_click_through', { ignore: true });
    expect(invoke).toHaveBeenNthCalledWith(4, 'reload_hud_window', undefined);
  });

  it('reports malformed monitor data as degraded', async () => {
    const adapter = createHudNativeAdapter(vi.fn().mockResolvedValue([{ left: 0 }]));

    await expect(adapter.getAvailableMonitors()).resolves.toMatchObject({ status: 'degraded' });
  });

  it('preserves native command failures as errors', async () => {
    const adapter = createHudNativeAdapter(vi.fn().mockRejectedValue(new Error('bridge offline')));

    await expect(adapter.reloadHudWindow()).resolves.toMatchObject({
      status: 'error',
      error: 'bridge offline',
    });
  });
});
