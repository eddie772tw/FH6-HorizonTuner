// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { drawChart, createChartLayout, type ChartTheme, type ChartLine } from './TelemetryDetailPrimitives';

const mockTheme: ChartTheme = {
  divider: 'rgba(255,255,255,0.1)',
  text: '#888',
  font: 'monospace',
  dash: [2, 2],
  flat: false,
  glowStrength: 1.5,
};

it('draws trend chart with paired context save/restore state isolation', () => {
  const saveCalls: number[] = [];
  const restoreCalls: number[] = [];
  let shadowBlurVal = 0;
  let arcCalls = 0;

  const mockCtx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (prop === 'save') return () => saveCalls.push(1);
      if (prop === 'restore') return () => restoreCalls.push(1);
      if (prop === 'arc') return () => { arcCalls++; };
      if (prop === 'setLineDash') return () => {};
      return () => {};
    },
    set: (_t, prop, val) => {
      if (prop === 'shadowBlur') shadowBlurVal = Number(val);
      return true;
    },
  });

  const data = [
    { time: 0, FL: 0.2, FR: 0.3 },
    { time: 1, FL: 0.8, FR: 0.5 },
  ];
  const lines: ChartLine[] = [
    { dataKey: 'FL', label: 'FL', color: '#00f0ff' },
    { dataKey: 'FR', label: 'FR', color: '#ffaa00' },
  ];
  const layout = createChartLayout(data, lines, 200, 100);
  const style = { getPropertyValue: () => '' } as unknown as CSSStyleDeclaration;
  const cache = new Map<string, string>();

  drawChart(mockCtx, data, lines, layout, mockTheme, style, cache);

  expect(saveCalls.length).toBe(1);
  expect(restoreCalls.length).toBe(1);
  expect(arcCalls).toBeGreaterThanOrEqual(4); // 2 lines * (1 halo ring + 1 core dot)
  expect(shadowBlurVal).toBe(0); // restored to 0 after halo marker
});

it('suppresses shadow blur in flat theme and uses rectangular markers in linear theme', () => {
  let shadowBlurTouched = false;
  let strokeRectCalls = 0;
  let fillRectCalls = 0;

  const mockCtx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (prop === 'strokeRect') return () => { strokeRectCalls++; };
      if (prop === 'fillRect') return () => { fillRectCalls++; };
      if (prop === 'setLineDash') return () => {};
      return () => {};
    },
    set: (_t, prop, val) => {
      if (prop === 'shadowBlur' && Number(val) > 0) shadowBlurTouched = true;
      return true;
    },
  });

  const flatTheme: ChartTheme = { ...mockTheme, flat: true, linear: true };
  const data = [{ time: 0, v: 10 }, { time: 1, v: 20 }];
  const lines: ChartLine[] = [{ dataKey: 'v', label: 'V', color: '#fff' }];
  const layout = createChartLayout(data, lines, 200, 100);
  const style = { getPropertyValue: () => '' } as unknown as CSSStyleDeclaration;

  drawChart(mockCtx, data, lines, layout, flatTheme, style, new Map());

  expect(shadowBlurTouched).toBe(false);
  expect(strokeRectCalls).toBeGreaterThanOrEqual(1);
  expect(fillRectCalls).toBeGreaterThanOrEqual(1);
});
