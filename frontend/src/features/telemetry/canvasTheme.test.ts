// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { observeCanvasTheme, readCanvasTheme } from './canvasTheme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-bs-theme');
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
