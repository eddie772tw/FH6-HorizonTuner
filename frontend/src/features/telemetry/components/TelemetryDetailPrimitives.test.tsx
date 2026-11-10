// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { drawChart, createChartLayout, type ChartTheme, type ChartLine } from './TelemetryDetailPrimitives';

const theme: ChartTheme = {
  divider: 'rgba(255,255,255,0.1)', text: '#888', font: 'monospace',
  dash: [2, 2], flat: false, glowStrength: 1.5,
};
const data = [{ time: 0, FL: 0.2, FR: 0.3 }, { time: 1, FL: 0.8, FR: 0.5 }];
const lines: ChartLine[] = [
  { dataKey: 'FL', label: 'FL', color: 'var(--primary)' },
  { dataKey: 'FR', label: 'FR', color: 'var(--secondary)' },
];

// Model drawing state so assertions concern the caller's observable state,
// rather than Canvas method counts or implementation-specific coordinates.
function createContext() {
  const state: Record<string, unknown> = {
    font: '12px serif', fillStyle: '#123', strokeStyle: '#456', lineWidth: 7,
    textAlign: 'left', textBaseline: 'top', lineCap: 'square', lineJoin: 'bevel',
    shadowBlur: 9, shadowColor: '#789', dash: [5, 3],
  };
  const initial = { ...state };
  const stack: Record<string, unknown>[] = [];
  const methods = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
    setLineDash: (dash: number[]) => { state.dash = dash; },
  };
  const context = new Proxy(state, {
    get: (target, key: string) => key in methods ? methods[key as keyof typeof methods]
      : key in target ? target[key] : () => undefined,
  }) as unknown as CanvasRenderingContext2D;
  return { context, state, initial };
}

it.each([
  { ...theme }, { ...theme, flat: true }, { ...theme, flat: true, linear: true },
])('renders available, missing and single samples without leaking drawing state: %j', chartTheme => {
  for (const samples of [data, [data[0]], [{ time: 0, FL: NaN, FR: Infinity }], []]) {
    const { context, state, initial } = createContext();
    const style = { getPropertyValue: () => '#00f0ff' } as unknown as CSSStyleDeclaration;
    expect(() => drawChart(context, samples, lines,
      createChartLayout(samples, lines, 200, 100), chartTheme, style, new Map())).not.toThrow();
    expect(state).toEqual(initial);
  }
});

it('restores caller state even if color resolution fails during drawing', () => {
  const { context, state, initial } = createContext();
  const style = { getPropertyValue: () => { throw new Error('color unavailable'); } } as unknown as CSSStyleDeclaration;
  expect(() => drawChart(context, data, lines, createChartLayout(data, lines, 200, 100),
    theme, style, new Map())).toThrow('color unavailable');
  expect(state).toEqual(initial);
});
