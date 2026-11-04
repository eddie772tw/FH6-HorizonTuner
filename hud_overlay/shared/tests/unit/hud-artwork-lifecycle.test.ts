import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const artworkSource = readFileSync(new URL('../../hud-artwork.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../../hud-core.js', import.meta.url), 'utf8');

function fixture() {
  const container = { style: { display: 'block', zoom: 1 } };
  const layout = { width: 640, height: 320 };
  const listeners: Record<string, () => void> = {};
  let lastPaint: { width: number; height: number; visible: boolean } | null = null;
  let elementsReady = false;
  let scaleAtReveal: number | undefined;
  const canvas = {
    width: layout.width,
    height: layout.height,
    getBoundingClientRect: () => ({
      width: container.style.display === 'none' ? 0 : layout.width * container.style.zoom,
      height: container.style.display === 'none' ? 0 : layout.height * container.style.zoom,
    }),
    getContext: () => ({ setTransform: () => undefined }),
  };
  const window = {
    devicePixelRatio: 1,
    addEventListener: (type: string, handler: () => void) => { listeners[type] = handler; },
  };
  const document = {
    getElementById: () => container,
    documentElement: { style: { setProperty: () => undefined } },
  };
  const scope = vm.createContext({ window, document, console });
  vm.runInContext(artworkSource + '\n' + coreSource, scope);
  const resize = scope.HUDArtwork.watchCanvas(canvas, () => {
    lastPaint = { width: canvas.width, height: canvas.height, visible: container.style.display !== 'none' };
  });
  const core = scope.window.HUDCore;
  core.registerStyle('fixture', {
    containerId: 'gauge',
    scaleBaseline: 1.4,
    scaleMultiplier: 0.9,
    onScale: (scale: number) => { if (elementsReady) scaleAtReveal = scale; resize(); },
    onElementsChange: (elements: { showGauge?: boolean }) => { elementsReady = elements.showGauge !== false; },
  });
  core.init('fixture');
  const sendConfig = (showGauge: boolean, scale = 1) => {
    elementsReady = false;
    core.handleMessage('config', { data: { scale, elements: { showGauge } } });
  };
  const sendElements = (showGauge: boolean) => core.handleMessage('hud:elements', { showGauge });
  const hostConfig = (showGauge: boolean, scale = 1) => { sendConfig(showGauge, scale); sendElements(showGauge); };
  const expectedSurface = () => {
    const bounds = canvas.getBoundingClientRect();
    return { width: Math.max(1, Math.round(bounds.width * window.devicePixelRatio)), height: Math.max(1, Math.round(bounds.height * window.devicePixelRatio)) };
  };
  return { canvas, container, layout, window, resize, sendConfig, sendElements, hostConfig, expectedSurface, listeners,
    paint: () => lastPaint, revealScale: () => scaleAtReveal };
}

describe('HUD artwork visibility and sizing lifecycle', () => {
  it('preserves the backing surface through repeated hidden config updates and restores it', () => {
    const f = fixture();
    f.hostConfig(true);
    const visible = { width: f.canvas.width, height: f.canvas.height };
    f.hostConfig(false);
    f.sendConfig(false);
    f.listeners.resize();
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(visible);
    f.hostConfig(true);
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(f.expectedSurface());
    expect(f.paint()).toMatchObject({ ...f.expectedSurface(), visible: true });
  });

  it('remeasures the effective scale, layout and DPR after showing, after the elements hook', () => {
    const f = fixture();
    f.hostConfig(true);
    f.hostConfig(false);
    f.layout.width *= 1.3;
    f.layout.height *= 1.2;
    f.window.devicePixelRatio = 2;
    f.sendConfig(true, 1.6);
    f.sendElements(true);
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(f.expectedSurface());
    expect(f.paint()).toMatchObject({ ...f.expectedSurface(), visible: true });
    expect(f.revealScale()).toBe(f.container.style.zoom);
  });

  it('remeasures on elements-only restoration without needing another config', () => {
    const f = fixture();
    f.hostConfig(true);
    f.sendElements(false);
    f.window.devicePixelRatio = 1.5;
    f.sendElements(true);
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(f.expectedSurface());
  });

  it.each(['width', 'height'] as const)('does not overwrite the valid bitmap for zero %s', dimension => {
    const f = fixture();
    f.hostConfig(true);
    const before = { width: f.canvas.width, height: f.canvas.height };
    const size = f.layout[dimension];
    f.layout[dimension] = 0;
    f.resize();
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(before);
    f.layout[dimension] = size * 1.25;
    f.listeners.resize();
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(f.expectedSurface());
  });

  it('tracks visible layout and DPR changes through the existing resize event', () => {
    const f = fixture();
    f.hostConfig(true);
    f.layout.width *= 0.8;
    f.window.devicePixelRatio = 2;
    f.listeners.resize();
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(f.expectedSurface());
  });
});
