import { describe, expect, it } from 'vitest';
import {
  clearSuspensionTraceHistory, createSuspensionTraceHistory,
  SUSPENSION_TRACE_WINDOW_MS, updateSuspensionTraceHistory,
  type SuspensionTraceHistory,
} from './suspensionTrace';

const ordered = (history: SuspensionTraceHistory) => Array.from(
  { length: history.size }, (_, k) => history.samples[(history.offset + k) % history.size],
);

describe('suspension trace history', () => {
  it.each([30, 60, 120, 144, 165, 240, 360])('retains the full time window at %iHz after repeated wraparound', hz => {
    const history = createSuspensionTraceHistory();
    const slots = [...history.samples];
    for (let frame = 0; frame <= hz * 12; frame++) {
      updateSuspensionTraceHistory(history, frame, frame * 1000 / hz);
    }
    const points = ordered(history);
    const oldest = points[0];
    const latest = points.at(-1)!;
    expect(latest.time - oldest.time).toBeGreaterThanOrEqual(SUSPENSION_TRACE_WINDOW_MS);
    expect(latest.travel).toBe(hz * 12);
    expect(latest.time).toBeCloseTo(12_000);
    expect(history.size).toBe(history.samples.length);
    expect(history.samples.every((sample, index) => sample === slots[index])).toBe(true);
    expect(points.every((sample, k) => k === 0 || (
      sample.time > points[k - 1].time && sample.travel > points[k - 1].travel
    ))).toBe(true);
  });

  it('keeps startup history short and coalesces the live endpoint between samples', () => {
    const history = createSuspensionTraceHistory();
    updateSuspensionTraceHistory(history, 0.2, 1000);
    updateSuspensionTraceHistory(history, 0.8, 1005);
    expect(history.size).toBe(1);
    expect(ordered(history)[0]).toEqual({ travel: 0.8, time: 1005 });
    updateSuspensionTraceHistory(history, 0.4, 1020);
    expect(history.size).toBe(2);
    expect(ordered(history).at(-1)).toEqual({ travel: 0.4, time: 1020 });
  });

  it('continues scrolling during constant stationary travel and then records changes', () => {
    const history = createSuspensionTraceHistory();
    for (let now = 0; now <= 4000; now += 20) updateSuspensionTraceHistory(history, 0.9, now);
    for (let now = 4020; now <= 14_000; now += 20) updateSuspensionTraceHistory(history, 0.5, now);
    expect(ordered(history).every(sample => sample.travel === 0.5)).toBe(true);
    expect(ordered(history).at(-1)?.time).toBe(14_000);
    updateSuspensionTraceHistory(history, 0.6, 14_020);
    expect(ordered(history).at(-1)).toEqual({ travel: 0.6, time: 14_020 });
  });

  it('clears the ring and sampling gate for car, race, display-mode and trace-toggle resets', () => {
    const history = createSuspensionTraceHistory();
    for (let now = 0; now <= 5000; now += 20) updateSuspensionTraceHistory(history, 0.5, now);
    clearSuspensionTraceHistory(history);
    expect(history.size).toBe(0);
    expect(history.offset).toBe(0);
    updateSuspensionTraceHistory(history, 0.3, 90_000);
    expect(ordered(history)).toEqual([{ travel: 0.3, time: 90_000 }]);
  });
});
