import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type StyleState = {
  mode: string;
  score: number;
  rankCode: string;
  summary: { active: boolean; flowLabel: string; flowCount: number; holdSeconds: number; riskLabel: string; riskCount: number };
  special: { label: string; count: number; points: number; active: boolean };
  events: {
    flow: { label: string; count: number };
    hold: { seconds: number };
    risk: { label: string; count: number };
  };
};

type DriftStyleEngine = {
  update: (frame: { speedKmh: number; angle: number; flowQuality: number; riskLevel: number }, now: number) => StyleState;
  triggerSpecial: (id: string, now: number) => StyleState;
  getState: () => StyleState;
};

function loadEngine(): DriftStyleEngine {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/drift/assets/drift_style_engine.js'),
    'utf8',
  );
  const window = {} as { DriftStyleEngine?: { create: () => DriftStyleEngine } };
  new Function('window', source)(window);

  if (!window.DriftStyleEngine) throw new Error('Drift Style engine did not register itself');
  return window.DriftStyleEngine.create();
}

const smoothFrame = { speedKmh: 80, angle: 28, flowQuality: 4, riskLevel: 2 };

function advance(
  engine: DriftStyleEngine,
  frame: { speedKmh: number; angle: number; flowQuality: number; riskLevel: number },
  from: number,
  to: number,
): StyleState {
  let state = engine.getState();
  for (let now = from + 50; now <= to; now += 50) state = engine.update(frame, now);
  return state;
}

describe('Drift Style engine', () => {
  it('merges repeated Flow and Risk pulses without mixing their sources', () => {
    const engine = loadEngine();
    engine.update(smoothFrame, 1000);
    const state = advance(engine, smoothFrame, 1000, 3000);

    expect(state.events.flow).toMatchObject({ label: 'SMOOTH', count: 3 });
    expect(state.events.risk).toMatchObject({ label: 'EDGE', count: 2 });
    expect(state.events.hold.seconds).toBeGreaterThan(1.9);
  });

  it('keeps the run alive through a direction swap and confirms the new direction', () => {
    const engine = loadEngine();
    engine.update(smoothFrame, 1000);
    advance(engine, smoothFrame, 1000, 1100);
    const state = advance(engine, { ...smoothFrame, angle: -20 }, 1100, 1300);

    expect(state.mode).toBe('active');
    expect(state.events.hold.seconds).toBeGreaterThan(0.2);
    expect(state.summary.active).toBe(false);
  });

  it('only settles after sustained drift loss and preserves the run highlights', () => {
    const engine = loadEngine();
    engine.update({ ...smoothFrame, riskLevel: 4 }, 1000);
    advance(engine, { ...smoothFrame, riskLevel: 4 }, 1000, 2100);
    const state = advance(engine, { speedKmh: 0, angle: 0, flowQuality: 1, riskLevel: 1 }, 2100, 3200);

    expect(state.summary.active).toBe(true);
    expect(state.summary.flowLabel).toBe('SMOOTH');
    expect(state.summary.holdSeconds).toBeGreaterThan(0.9);
    expect(state.summary.riskLabel).toBe('MAXIMUM');
  });

  it('turns a pending Hero input into a scored special event once drift starts', () => {
    const engine = loadEngine();
    engine.update({ speedKmh: 0, angle: 0, flowQuality: 1, riskLevel: 1 }, 1000);
    engine.triggerSpecial('handbrake', 1050);
    const state = advance(engine, smoothFrame, 1050, 1200);

    expect(state.special).toMatchObject({ label: 'HANDBRAKE ENTRY', count: 1, points: 15, active: true });
    expect(state.score).toBeGreaterThanOrEqual(15);
  });

  it('does not apply an expired pending special event to a later drift run', () => {
    const engine = loadEngine();
    engine.triggerSpecial('handbrake', 1000);
    const state = advance(engine, { speedKmh: 0, angle: 0, flowQuality: 1, riskLevel: 1 }, 1000, 2500);

    expect(state.special.label).toBe('');
    expect(state.special.count).toBe(0);
    expect(state.score).toBe(0);
  });

  it('ignores invalid timestamps without mutating the current state', () => {
    const engine = loadEngine();
    const before = engine.getState();
    engine.update(smoothFrame, Number.NaN);

    expect(engine.getState()).toBe(before);
    expect(before.score).toBe(0);
    expect(before.mode).toBe('idle');
  });

  it('resets the run and summary state for a fresh HUD lifecycle', () => {
    const engine = loadEngine();
    engine.update({ ...smoothFrame, riskLevel: 4 }, 1000);
    advance(engine, { ...smoothFrame, riskLevel: 4 }, 1000, 2100);
    const settled = advance(engine, { speedKmh: 0, angle: 0, flowQuality: 1, riskLevel: 1 }, 2100, 3200);

    expect(settled.summary.active).toBe(true);
    engine.reset();
    const reset = engine.getState();

    expect(reset).toMatchObject({ mode: 'idle', score: 0, rankCode: 'D' });
    expect(reset.summary.active).toBe(false);
    expect(reset.events.flow.label).toBe('');
    expect(reset.events.risk.label).toBe('');
    expect(reset.special.active).toBe(false);
  });
});
