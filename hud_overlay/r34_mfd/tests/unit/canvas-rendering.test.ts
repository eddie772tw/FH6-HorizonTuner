import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const scope: Record<string, any> = {};
for (const file of ['model.js', 'canvas-geometry.js', 'instruments.js', 'lcd-format.js', 'renderer.js']) {
  runInNewContext(readFileSync(resolve(import.meta.dirname, '../../', file), 'utf8'), scope);
}
const M = scope.R34Model, G = scope.R34CanvasGeometry;

function createSurface() {
  const stack: Record<string, unknown>[] = [], texts: Array<{ text: string; y: number; align: string }> = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, nonFinite: false };
  let maxBlur = 0, markerTop = Infinity, markerPainted = false;
  const track = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) bounds.nonFinite = true;
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
  };
  const ctx: Record<string, any> = {
    shadowBlur: 7, shadowColor: '#112233', strokeStyle: '#abcdef', fillStyle: '#654321', lineWidth: 4,
    lineCap: 'square', lineJoin: 'bevel', globalAlpha: 0.6, font: '12px serif', textAlign: 'center', textBaseline: 'middle',
    save() { stack.push(snap()); }, restore() { Object.assign(ctx, stack.pop() || {}); }, clearRect: () => {}, beginPath: () => {},
    moveTo: (x: number, y: number) => track(x, y), lineTo: (x: number, y: number) => track(x, y),
    arc: (x: number, y: number, r: number) => { track(x - r, y - r); track(x + r, y + r); markerPainted = true; markerTop = Math.min(markerTop, y - r); },
    stroke: () => { maxBlur = Math.max(maxBlur, Number(ctx.shadowBlur) || 0); },
    fill: () => { maxBlur = Math.max(maxBlur, Number(ctx.shadowBlur) || 0); },
    fillText: (text: string, x: number, y: number) => { track(x, y); texts.push({ text, y, align: ctx.textAlign }); },
  };
  const snap = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin, globalAlpha: ctx.globalAlpha, font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline });
  const reset = () => { maxBlur = 0; markerTop = Infinity; markerPainted = false; texts.length = 0; };
  return { ctx, bounds, texts, snap, reset, stackDepth: () => stack.length, maxBlur: () => maxBlur, markerTop: () => markerTop, markerPainted: () => markerPainted };
}

function makeRenderer(dpr = 1, scale = 1) {
  const history = createSurface(), g = createSurface(), r = Object.create(scope.R34Renderer.prototype);
  r.history = history.ctx; r.g = g.ctx; r.historyGeometry = G.geometry(101, 109, scale, dpr); r.gGeometry = G.geometry(256, 126, scale, dpr);
  r.palette = { grid: '#4c5b66', ink: '#e0e5df', screen: '#121b24', green: '#77b95a', hot: '#ed463f', teal: '#284e59', dim: '#98a39d' };
  r.nodes = { r34Lateral: { textContent: '' }, r34Longitudinal: { textContent: '' } };
  return { r, history, g };
}

describe('R34 MFD Canvas rendering contracts', () => {
  it.each([1, 2, 3])('keeps history and G-indication geometry finite, bounded, and label-cleared at DPR %s', dpr => {
    const { r, history, g } = makeRenderer(dpr, 1), state = M.createState();
    for (const [i, psi] of [-15, -7.2519, 0, 14.5038, 45].entries()) M.ingest(state, { TimestampMS: 1000 + i * 200, CarOrdinal: 34, IsRaceOn: 1, Boost: psi }, {}, i * 200);
    const view = M.snapshot(state, {}, 800);
    r.drawHistory(view, state, true);
    expect(history.bounds.nonFinite).toBe(false);
    expect(history.bounds.minX).toBeGreaterThanOrEqual(0); expect(history.bounds.maxX).toBeLessThanOrEqual(101);
    expect(history.bounds.minY).toBeGreaterThanOrEqual(0); expect(history.bounds.maxY).toBeLessThanOrEqual(109);
    for (const [lat, lon] of [[0, 0], [1.5, -1.5], [-4, 4]]) r.drawG({ ...view, lateralG: lat, longitudinalG: lon });
    g.reset(); r.drawG({ ...view, lateralG: -1.5, longitudinalG: 0 });
    expect(g.bounds.nonFinite).toBe(false);
    expect(g.bounds.minX).toBeGreaterThanOrEqual(0); expect(g.bounds.maxX).toBeLessThanOrEqual(256);
    expect(g.bounds.minY).toBeGreaterThanOrEqual(0); expect(g.bounds.maxY).toBeLessThanOrEqual(126);
    const minus = g.texts.find(t => t.text === '−1.5'), plus = g.texts.find(t => t.text === '+1.5');
    expect([minus?.align, plus?.align]).toEqual(['left', 'right']); expect(minus && minus.y).toBeLessThan(g.markerTop());
  });
  it('shows single-sample history, scales glow with DPR, guards non-finite G, and restores state on faults', () => {
    const d1 = makeRenderer(1), d2 = makeRenderer(2), state = M.createState();
    M.ingest(state, { TimestampMS: 1000, CarOrdinal: 34, IsRaceOn: 1, Boost: 14.5038 }, {}, 0);
    const liveView = M.snapshot(state, {}, 0);
    d1.r.drawHistory(liveView, state, true); d2.r.drawHistory(liveView, state, true);
    expect(d1.history.markerPainted()).toBe(true); expect(d2.history.maxBlur()).toBeCloseTo(d1.history.maxBlur() * 2, 5);
    d1.history.reset(); d1.r.drawHistory({ ...liveView, live: false }, state, true); expect(d1.history.maxBlur()).toBe(0);
    d1.r.drawG({ ...liveView, lateralG: 1.2, longitudinalG: -0.8 }); d2.r.drawG({ ...liveView, lateralG: 1.2, longitudinalG: -0.8 });
    expect(d2.g.maxBlur()).toBeCloseTo(d1.g.maxBlur() * 2, 5);
    d1.g.reset(); d1.r.drawG({ ...liveView, lateralG: Number.NaN, longitudinalG: Number.POSITIVE_INFINITY });
    expect(d1.g.markerPainted()).toBe(false); expect(d1.r.nodes.r34Lateral.textContent).toBe('LAT N/A g');
    const hInit = d1.history.snap(), gInit = d1.g.snap();
    d1.r.drawHistory(liveView, state, false); expect(d1.history.snap()).toEqual(hInit); expect(d1.history.stackDepth()).toBe(0);
    d1.history.ctx.arc = () => { throw new Error('history fault'); }; expect(() => d1.r.drawHistory(liveView, state, true)).toThrow('history fault');
    expect(d1.history.snap()).toEqual(hInit); expect(d1.history.stackDepth()).toBe(0);
    d1.g.ctx.arc = () => { throw new Error('g fault'); }; expect(() => d1.r.drawG({ ...liveView, lateralG: 0.5, longitudinalG: 0.5 })).toThrow('g fault');
    expect(d1.g.snap()).toEqual(gInit); expect(d1.g.stackDepth()).toBe(0);
  });
});
