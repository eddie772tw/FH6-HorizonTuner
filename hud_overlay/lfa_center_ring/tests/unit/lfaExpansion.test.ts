import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface RaceFrame {
  timestamp: number | null;
  currentLap: number | null;
  rank: number | null;
  lap: number | null;
  raceTime: number | null;
  car: number | null;
}
const scope: any = {};
runInNewContext(readFileSync(resolve(process.cwd(), '../hud_overlay/lfa_center_ring/lfa-expansion.js'), 'utf8'), scope);
const E = scope.LfaExpansion;
const defaults: RaceFrame = { timestamp: 1000, currentLap: 10, rank: 2, lap: 1, raceTime: 90, car: 100 };
function race() {
  const state = E.createRace();
  let stamp = defaults.timestamp!;
  return {
    state,
    feed(now: number, patch: Partial<RaceFrame> = {}, eligible = true) {
      return E.ingestRace(state, { ...defaults, timestamp: stamp += 100, ...patch }, now, eligible);
    },
    confirmed(now: number) { return E.confirmed(state, now); },
  };
}
function activeRace() {
  const session = race();
  session.feed(0);
  session.feed(400, { currentLap: 10.4 });
  expect(session.confirmed(400)).toBe(true);
  return session;
}

describe('LFA race-driven expansion intent', () => {
  it('requires positive advancing elapsed time and 400 ms of fresh packets', () => {
    const s = race();
    s.feed(0);
    expect(s.confirmed(0)).toBe(false);
    s.feed(399, { currentLap: 10.399 });
    expect(s.confirmed(399)).toBe(false);
    expect(s.confirmed(400)).toBe(false); // RAF alone cannot finish entry.
    s.feed(401, { currentLap: 10.401 });
    expect(s.confirmed(401)).toBe(true);
  });
  it('never enters on initial zero, rank, completed laps or race-on alone', () => {
    for (const context of [{ rank: 1, lap: 0 }, { rank: null, lap: 4 }, { rank: null, lap: null }]) {
      const s = race();
      for (const now of [0, 400, 1000, 3000, 9000]) {
        s.feed(now, { currentLap: 0, ...context });
        expect(s.confirmed(now)).toBe(false);
      }
      s.feed(9200, { currentLap: .2 });
      s.feed(9400, { currentLap: .4 });
      expect(s.confirmed(9400)).toBe(false);
      s.feed(9600, { currentLap: .6 });
      expect(s.confirmed(9600)).toBe(true);
    }
    const s = race();
    for (const now of [0, 500, 1000]) s.feed(now, { currentLap: null, raceTime: null });
    expect(s.confirmed(1000)).toBe(false);
  });
  it('does not use frozen positive values, duplicates or out-of-order packets as entry progress', () => {
    const s = race();
    s.feed(0, { timestamp: 1000 });
    s.feed(200, { timestamp: 1200, currentLap: 10.2 });
    s.feed(500, { timestamp: 1300, currentLap: 10.2 });
    s.feed(600, { timestamp: 1300, currentLap: 20 });
    s.feed(700, { timestamp: 1299, currentLap: 30 });
    expect(s.confirmed(700)).toBe(false);
    s.feed(800, { timestamp: 1400, currentLap: 10.8 });
    expect(s.confirmed(800)).toBe(true);
  });
  it('restarts entry evidence after a falling or missing elapsed value', () => {
    for (const currentLap of [0, null, 1]) {
      const s = race();
      s.feed(0);
      s.feed(300, { currentLap });
      s.feed(400, { currentLap: 1.1 });
      expect(s.confirmed(400)).toBe(false);
      s.feed(800, { currentLap: 1.5 });
      expect(s.confirmed(800)).toBe(true);
    }
  });
  it('retains a confirmed race with frozen positive elapsed time on advancing timestamps', () => {
    const s = activeRace();
    for (const now of [1000, 2500, 4000, 6000, 8000]) {
      s.feed(now, { currentLap: 10.4 });
      expect(s.confirmed(now)).toBe(true);
    }
  });
  it('retains confirmed zero with positive rank on fresh packets', () => {
    const s = activeRace();
    for (const now of [500, 2000, 3500, 5000]) {
      s.feed(now, { currentLap: 0, rank: 1, lap: null });
      expect(s.confirmed(now)).toBe(true);
    }
  });
  it('grants observed lap rollover grace without retaining zero from an old static lap count', () => {
    const s = activeRace();
    s.feed(500, { currentLap: 0, rank: null, lap: 1 });
    s.feed(1500, { currentLap: 0, rank: null, lap: 2 });
    s.feed(3000, { currentLap: 0, rank: null, lap: 2 });
    expect(s.confirmed(3499)).toBe(true);
    expect(s.confirmed(3500)).toBe(false);
    const oldLap = activeRace();
    oldLap.feed(500, { currentLap: 0, rank: null, lap: 1 });
    oldLap.feed(2000, { currentLap: 0, rank: null, lap: 1 });
    expect(oldLap.confirmed(2500)).toBe(false);
  });
  it('gives contextless zero and missing/invalid elapsed time exactly two seconds of exit grace', () => {
    for (const currentLap of [0, null, NaN, Infinity, -1, '1']) {
      const s = activeRace();
      s.feed(500, { currentLap: currentLap as any, rank: null, lap: null });
      s.feed(2000, { currentLap: currentLap as any, rank: null, lap: null });
      expect(s.confirmed(2499)).toBe(true);
      expect(s.confirmed(2500)).toBe(false);
    }
  });
  it('does not let invalid context retain zero and does not let context retain missing time', () => {
    for (const patch of [
      { currentLap: 0, rank: 0, lap: 0 },
      { currentLap: 0, rank: 1.5, lap: -1 },
      { currentLap: 0, rank: '1', lap: '2' },
      { currentLap: null, rank: 1, lap: 3 },
    ]) {
      const s = activeRace();
      s.feed(500, patch as any);
      expect(s.confirmed(2500)).toBe(false);
    }
  });
  it('recovers from a short timing gap without collapse, and requires fresh entry after grace expires', () => {
    const short = activeRace();
    short.feed(500, { currentLap: null });
    short.feed(2499, { currentLap: 10.4 });
    expect(short.confirmed(2500)).toBe(true);
    const long = activeRace();
    long.feed(500, { currentLap: null });
    long.feed(2500, { currentLap: 10.4 });
    expect(long.confirmed(2500)).toBe(false);
    long.feed(2900, { currentLap: 10.8 });
    expect(long.confirmed(2900)).toBe(true);
  });
  it('uses only ordered timestamp advances for the three-second outage clock', () => {
    const s = race();
    s.feed(0, { timestamp: 100 });
    s.feed(400, { timestamp: 500, currentLap: 10.4 });
    for (const now of [900, 1500, 2200, 3300]) {
      s.feed(now, { timestamp: 500, currentLap: 11 });
      s.feed(now, { timestamp: 499, currentLap: 12 });
      expect(s.confirmed(now)).toBe(true);
    }
    expect(s.confirmed(3399)).toBe(true);
    expect(s.confirmed(3400)).toBe(false);
    s.feed(3500, { timestamp: 501, currentLap: 12 });
    expect(s.confirmed(3500)).toBe(false);
    s.feed(3900, { timestamp: 901, currentLap: 12.4 });
    expect(s.confirmed(3900)).toBe(true);
  });
  it('accepts timestamp zero but rejects every timestamp outside the uint32 integer contract', () => {
    for (const timestamp of [null, undefined, NaN, Infinity, -1, '10', .5, 4294967295.5, 4294967296, Number.MAX_SAFE_INTEGER]) {
      const s = race();
      s.feed(0, { timestamp: timestamp as any });
      s.feed(500, { timestamp: timestamp as any, currentLap: 11 });
      expect(s.confirmed(500)).toBe(false);
      const active = activeRace();
      active.feed(1000, { timestamp: timestamp as any, currentLap: 11 });
      expect(active.confirmed(3399)).toBe(true);
      expect(active.confirmed(3400)).toBe(false);
    }
    const s = race();
    s.feed(0, { timestamp: 0 });
    s.feed(400, { timestamp: 400, currentLap: 10.4 });
    expect(s.confirmed(400)).toBe(true);
  });
  it('preserves confirmed layout through short transport gaps and reconnects', () => {
    const s = activeRace();
    expect(s.confirmed(2000)).toBe(true);
    s.feed(2500, { currentLap: 12.5 });
    expect(s.confirmed(5000)).toBe(true);
    s.feed(5100, { currentLap: 15.1 });
    expect(s.confirmed(5100)).toBe(true);
  });
  it('retains layout through one ineligible/error frame and recovery without restarting entry', () => {
    const s = activeRace();
    s.feed(500, {}, false);
    expect(s.confirmed(500)).toBe(true);
    s.feed(600, { currentLap: 10.4 });
    expect(s.confirmed(600)).toBe(true);
    expect(s.confirmed(2500)).toBe(true);
  });
  it('bounds sustained ineligible/error input by invalid grace and never refreshes packet freshness', () => {
    const s = activeRace();
    s.feed(500, {}, false);
    s.feed(1500, { currentLap: 11.5 }, false);
    s.feed(2499, { currentLap: 12.499 }, false);
    expect(s.confirmed(2499)).toBe(true);
    expect(s.confirmed(2500)).toBe(false);
    expect(E.target(s.state, { lfaManualExpand: true, lfaAutoExpand: true }, 500)).toBe(true);
    s.feed(2600, { currentLap: 12 });
    expect(s.confirmed(2600)).toBe(false);
    s.feed(3000, { currentLap: 12.4 });
    expect(s.confirmed(3000)).toBe(true);
    const stale = activeRace();
    stale.feed(3000, {}, false);
    expect(stale.confirmed(3399)).toBe(true);
    expect(stale.confirmed(3400)).toBe(false);
  });
  it('clears incomplete entry evidence on ineligible input', () => {
    const s = race();
    s.feed(0);
    s.feed(300, {}, false);
    s.feed(400, { currentLap: 10.4 });
    expect(s.confirmed(400)).toBe(false);
    s.feed(800, { currentLap: 10.8 });
    expect(s.confirmed(800)).toBe(true);
  });
  it('needs only valid lap timing and timestamps to maintain confirmed layout', () => {
    const s = activeRace();
    for (const now of [1000, 2500, 4000]) {
      E.ingestRace(s.state, { timestamp: 1000 + now, currentLap: 10.4, IsRaceOn: 0 }, now, true);
      expect(s.confirmed(now)).toBe(true);
    }
  });
  it('uses strict manual OR (auto AND race) precedence in every combination', () => {
    for (const racing of [false, true]) {
      const s = racing ? activeRace() : race();
      for (const manual of [false, true]) for (const auto of [false, true]) {
        expect(E.target(s.state, { lfaManualExpand: manual, lfaAutoExpand: auto }, 400)).toBe(manual || auto && racing);
      }
      for (const bad of [undefined, null, 1, 'true', {}]) {
        expect(E.target(s.state, { lfaManualExpand: bad, lfaAutoExpand: bad }, 400)).toBe(false);
      }
    }
    expect(E.target(E.createRace(), undefined, 0)).toBe(false);
  });
  it('silently rebaselines ordered car, race-clock and completed-lap resets', () => {
    for (const patch of [{ car: 200 }, { raceTime: 0 }, { lap: 0 }]) {
      const s = activeRace();
      s.feed(500, { currentLap: 1, ...patch });
      expect(s.confirmed(500)).toBe(false);
      s.feed(900, { currentLap: 1.4, ...patch });
      expect(s.confirmed(900)).toBe(true);
    }
  });
  it('ignores isolated late reset/car packets and cancels reset suspicion on normal traffic', () => {
    const s = race();
    s.feed(0, { timestamp: 5000 });
    s.feed(400, { timestamp: 5400, currentLap: 10.4 });
    s.feed(500, { timestamp: 0, currentLap: 0, lap: 0, raceTime: 0, car: 200 });
    expect(s.confirmed(500)).toBe(true);
    s.feed(600, { timestamp: 5600, currentLap: 10.6 });
    s.feed(700, { timestamp: 100, currentLap: .1, lap: 0, raceTime: .1, car: 200 });
    expect(s.confirmed(700)).toBe(true);
    s.feed(800, { timestamp: 5300, currentLap: 5, lap: 0, raceTime: 20, car: 200 });
    expect(s.confirmed(800)).toBe(true);
  });
  it('requires corroboration for a new timestamp epoch and rejects delayed retired-epoch packets', () => {
    const s = race();
    s.feed(0, { timestamp: 5000 });
    s.feed(400, { timestamp: 5400, currentLap: 10.4 });
    s.feed(500, { timestamp: 0, currentLap: 0, lap: 0, raceTime: 0 });
    expect(s.confirmed(500)).toBe(true);
    s.feed(600, { timestamp: 100, currentLap: .1, lap: 0, raceTime: .1 });
    expect(s.confirmed(600)).toBe(false);
    s.feed(650, { timestamp: 5450, currentLap: 10.45 });
    s.feed(800, { timestamp: 300, currentLap: .3, lap: 0, raceTime: .3 });
    expect(s.confirmed(800)).toBe(false);
    s.feed(1000, { timestamp: 500, currentLap: .5, lap: 0, raceTime: .5 });
    expect(s.confirmed(1000)).toBe(true);
  });
  it('treats uint32 timestamp wrap as fresh and rejects delayed pre-wrap packets', () => {
    const s = race();
    s.feed(0, { timestamp: 0xfffffe00 });
    s.feed(400, { timestamp: 0xffffff90, currentLap: 10.4 });
    s.feed(700, { timestamp: 0x100, currentLap: 10.7 });
    expect(s.confirmed(700)).toBe(true);
    s.feed(1000, { timestamp: 0xfffffff0, currentLap: 1, raceTime: 10 });
    expect(s.confirmed(1000)).toBe(true);
    s.feed(1100, { timestamp: 0x290, currentLap: 11.1 });
    expect(s.confirmed(4000)).toBe(true);
    expect(s.confirmed(4100)).toBe(false);
  });
  it('corroborates timestamp restart without raceTime using lap reset or a repeated new car', () => {
    for (const changedCar of [false, true]) {
      const s = race();
      s.feed(0, { timestamp: 5000, raceTime: null });
      s.feed(400, { timestamp: 5400, currentLap: 10.4, raceTime: null });
      const patch = { lap: changedCar ? null : 0, raceTime: null, car: changedCar ? 200 : 100 };
      s.feed(500, { timestamp: 0, currentLap: 0, ...patch });
      expect(s.confirmed(500)).toBe(true);
      s.feed(600, { timestamp: 100, currentLap: .1, ...patch });
      expect(s.confirmed(600)).toBe(false);
      s.feed(1000, { timestamp: 500, currentLap: .5, ...patch });
      expect(s.confirmed(1000)).toBe(true);
    }
  });
});

describe('LFA critically damped expansion motion', () => {
  it('starts at its chosen endpoint with no mount or resize animation', () => {
    for (const initial of [false, true]) {
      const motion = E.createMotion(initial);
      E.advanceMotion(motion, initial, 10000);
      E.advanceMotion(motion, initial, 11000);
      expect(motion).toMatchObject({ progress: initial ? 1 : 0, target: initial, velocity: 0, settled: true });
    }
  });
  it('glides monotonically in both directions and reaches exact endpoints around 600 ms', () => {
    for (const initial of [false, true]) {
      const motion = E.createMotion(initial);
      E.advanceMotion(motion, !initial, 0);
      let previous = motion.progress;
      for (let now = 20; now < 600; now += 20) {
        E.advanceMotion(motion, !initial, now);
        expect(motion.progress).toBeGreaterThanOrEqual(0);
        expect(motion.progress).toBeLessThanOrEqual(1);
        if (initial) expect(motion.progress).toBeLessThanOrEqual(previous);
        else expect(motion.progress).toBeGreaterThanOrEqual(previous);
        previous = motion.progress;
      }
      E.advanceMotion(motion, !initial, 650);
      expect(motion).toMatchObject({ progress: initial ? 0 : 1, velocity: 0, settled: true });
    }
  });
  it('is independent of frame cadence, delayed frames and responsive breakpoint redraws', () => {
    const regular = E.createMotion(), sparse = E.createMotion();
    E.advanceMotion(regular, true, 0);
    E.advanceMotion(sparse, true, 0);
    for (let now = 10; now <= 300; now += 10) E.advanceMotion(regular, true, now);
    E.advanceMotion(sparse, true, 300);
    expect(sparse.progress).toBeCloseTo(regular.progress, 12);
    expect(sparse.velocity).toBeCloseTo(regular.velocity, 12);
    const progress = sparse.progress, velocity = sparse.velocity;
    E.advanceMotion(sparse, true, 300); // Same-time resize/breakpoint render.
    expect(sparse.progress).toBe(progress);
    expect(sparse.velocity).toBe(velocity);
    E.advanceMotion(sparse, true, 10000);
    expect(sparse).toMatchObject({ progress: 1, velocity: 0, settled: true });
  });
  it('preserves position and velocity through rapid reversals and eventually settles', () => {
    const motion = E.createMotion();
    let target = true;
    E.advanceMotion(motion, target, 0);
    for (const now of [40, 85, 120, 180, 220, 260, 310]) {
      E.advanceMotion(motion, target, now);
      const progress = motion.progress, velocity = motion.velocity;
      target = !target;
      E.advanceMotion(motion, target, now);
      expect(motion.progress).toBe(progress);
      expect(motion.velocity).toBe(velocity);
      expect(motion.progress).toBeGreaterThanOrEqual(0);
      expect(motion.progress).toBeLessThanOrEqual(1);
    }
    E.advanceMotion(motion, target, 1000);
    expect(motion).toMatchObject({ progress: target ? 1 : 0, velocity: 0, settled: true });
  });
  it('snaps immediately when reduced motion is enabled, including mid-flight', () => {
    const motion = E.createMotion();
    E.advanceMotion(motion, true, 0);
    E.advanceMotion(motion, true, 120);
    expect(motion.progress).toBeGreaterThan(0);
    expect(motion.progress).toBeLessThan(1);
    E.advanceMotion(motion, false, 120, true);
    expect(motion).toMatchObject({ progress: 0, velocity: 0, target: false, settled: true });
    E.advanceMotion(motion, true, 120, true);
    expect(motion).toMatchObject({ progress: 1, velocity: 0, target: true, settled: true });
  });
  it('never rewinds or corrupts motion on a regressed or invalid caller clock', () => {
    const motion = E.createMotion();
    E.advanceMotion(motion, true, 0);
    E.advanceMotion(motion, true, 100);
    const progress = motion.progress, velocity = motion.velocity;
    for (const now of [50, NaN, Infinity, -1]) {
      E.advanceMotion(motion, true, now);
      expect(motion.progress).toBe(progress);
      expect(motion.velocity).toBe(velocity);
    }
    E.advanceMotion(motion, true, 700);
    expect(motion).toMatchObject({ progress: 1, velocity: 0, settled: true });
  });
});
