// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetryCardsManager } from '../../../hud_overlay/shared/telemetry-cards/manager.js';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('shared telemetry card frame lifecycle', () => {
  it('coexists with the main gauge, relays the latest config on load and releases the frame on disable', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const manager = createTelemetryCardsManager();
    manager.init(mount);
    const config = { hudStyle: 'gt7', gamepadLayout: 'xbox', elements: {
      showGauge: false, showTeleMaster: true, showTeleGamepad: true,
      showTeleAttitude: false, showTeleSuspension: false, showTeleTires: false,
      showTeleTiresSlip: false, showTeleTiresTemp: false, showTelePedals: false,
      showPowerTorque: false, showTeleCompass: false,
    } };
    manager.update(null, config);
    const frame = mount.querySelector('iframe')!;
    expect(frame.title).toBe('Controller Telemetry Card');
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    const changed = { ...config, hudStyle: 'vfd', gamepadLayout: 'dualsense' };
    const data = { steer: 64, throttle: 0.5, hand_brake: 255 };
    manager.update(data, changed);
    expect(mount.querySelector('iframe')).toBe(frame);
    post.mockClear();
    frame.dispatchEvent(new Event('load'));
    expect(post).toHaveBeenCalledWith({ type: 'config', data: changed }, '*');
    expect(post).toHaveBeenCalledWith({ type: 'hud:frame', data }, '*');
    manager.reloadFrames();
    expect(post).toHaveBeenCalledWith({ type: 'hud:reload' }, '*');
    manager.update(null, { ...changed, elements: { ...config.elements, showTeleGamepad: false } });
    expect(mount.querySelector('iframe')).toBeNull();
    manager.update(null, changed);
    expect(mount.querySelector('iframe')).not.toBe(frame);
    manager.update(null, { ...changed, elements: { ...config.elements, showTeleMaster: false } });
    expect(mount.querySelector('iframe')).toBeNull();
    manager.update(null, changed);
    manager.destroy();
    expect(mount.querySelector('iframe')).toBeNull();
    expect(manager.initialized).toBe(false);
  });
});
