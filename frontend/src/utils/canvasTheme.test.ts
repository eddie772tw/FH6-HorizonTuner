// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { observeCanvasTheme, readCanvasTheme, drawTraceGrid, TRACE_PAD_TOP, TRACE_PAD_BOTTOM } from './canvasTheme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-bs-theme');
  document.documentElement.removeAttribute('data-bs-core');
});

it('refreshes the drawing palette without telemetry and disconnects on disposal', async () => {
  let drawingTheme = readCanvasTheme();
  const stop = observeCanvasTheme(() => { drawingTheme = readCanvasTheme(); });
  document.documentElement.setAttribute('style', '--instrument-linear: 1; --instrument-grid: #aaa59a; --primary: #080a08; --instrument-throttle: #23704c');
  await Promise.resolve();
  expect(drawingTheme).toMatchObject({ linear: true, grid: '#aaa59a', primary: '#080a08', throttle: '#23704c' });
  document.documentElement.removeAttribute('style');
  await Promise.resolve();
  expect(drawingTheme).toMatchObject({ linear: false, primary: '#00f0ff', throttle: '#00ff66' });
  stop();
  document.documentElement.style.setProperty('--primary', '#ff0000');
  await Promise.resolve();
  expect(drawingTheme.primary).toBe('#00f0ff');
});

it('keeps safety channels independent of a custom brand palette', () => {
  document.documentElement.setAttribute('style', '--primary: #abcdef; --secondary: #654321');
  expect(readCanvasTheme()).toMatchObject({ primary: '#abcdef', secondary: '#654321', brake: '#ff0055', hot: '#ff0000' });
});

it('refreshes cached chart typography for a core-only change without new telemetry', async () => {
  let drawingTheme = readCanvasTheme();
  document.documentElement.style.cssText = '--instrument-font-family: MiSans, sans-serif; --chart-grid-dash: 0';
  const stop = observeCanvasTheme(() => {
    drawingTheme = readCanvasTheme();
  });
  document.documentElement.setAttribute('data-bs-core', 'rhine-lab');
  await Promise.resolve();
  expect(drawingTheme).toMatchObject({ font: 'MiSans, sans-serif', chartDash: [0] });
  stop();
});

it('keeps flat instruments and steady alerts independent of ruled geometry', async () => {
  let drawingTheme = readCanvasTheme();
  const stop = observeCanvasTheme(() => { drawingTheme = readCanvasTheme(); });
  document.documentElement.setAttribute('style', '--instrument-flat: 1; --instrument-alert-flash: 0');
  await Promise.resolve();
  expect(drawingTheme).toMatchObject({ flat: true, alertFlash: false, linear: false });
  document.documentElement.removeAttribute('style');
  await Promise.resolve();
  expect(drawingTheme).toMatchObject({ flat: false, alertFlash: true, linear: false });
  stop();
});

it('provides trace padding headroom that clears the legend and renders trace grid', () => {
  expect(TRACE_PAD_TOP).toBeGreaterThanOrEqual(30);
  expect(TRACE_PAD_BOTTOM).toBeGreaterThanOrEqual(10);

  const mockCtx = {
    strokeStyle: '',
    lineWidth: 1,
    setLineDash: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;

  const theme = readCanvasTheme();
  expect(() => drawTraceGrid(mockCtx, 300, 140, 1, theme)).not.toThrow();
});
