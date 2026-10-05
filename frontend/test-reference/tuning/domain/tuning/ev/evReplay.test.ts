import { describe, expect, it } from 'vitest';
import replay from "../../../../../../tests/fixtures/ev_taycan_replay.json";
import { advanceEvMeasurement, createEvMeasurement, evGearReady } from "./measurement";
import { calculateEvGearing } from "./solver";
import type { TelemetryData } from "../../../../../src/hooks/useTelemetry";
import fs from 'node:fs';

const scan = (run: typeof replay.runs[number]) => run.rows.reduce((state, row) =>
  advanceEvMeasurement(state, Object.fromEntries(replay.columns.map((key, i) => [key, row[i]])) as unknown as TelemetryData),
  createEvMeasurement('3445'));
const scans = replay.runs.map(scan);
const baselineInput = { setup: { finalDrive: 4.03, gearRatios: [4, 2], allForwardGearsConfirmed: true,
  finalDriveAdjustable: true, gearAdjustable: [true, true] },
  measurements: scans[0].gears, candidateFinalDrive: 4.03 };

describe('Taycan decoded recording replay', () => {
  it('builds both held gears without requiring nonzero idle or an ICE torque peak', () => {
    expect(scans[0].status).toBe('collecting');
    expect(scans[0].gears.map(g => g.gear)).toEqual([1, 2]);
    expect(scans[0].gears.map(evGearReady)).toEqual([true, true]);
    const result = calculateEvGearing(baselineInput);
    expect(result?.gears).toEqual([4, 2]);
    expect(result?.envelopes[0].boundKind).toBe('observed-cut');
    expect(result?.envelopes[1].boundKind).toBe('measured-range');
    expect(result!.envelopes[0].peakPowerKw).toBeGreaterThan(550);
    expect(result!.envelopes[0].peakPowerKw).toBeLessThan(570);
  });
  it('reproduces the 2.00 -> 2.20 -> 2.00 ratio response and preserves zero-output evidence', () => {
    const gears = scans.map(s => s.gears.find(g => g.gear === 2)!);
    expect(gears.every(evGearReady)).toBe(true);
    expect(gears[1].rpmPerKmh.mean / gears[0].rpmPerKmh.mean).toBeCloseTo(1.1, 2);
    expect(gears[2].rpmPerKmh.mean / gears[0].rpmPerKmh.mean).toBeCloseTo(1, 2);
    expect(gears.map(g => g.cutoff.count >= 3)).toEqual([false, true, true]);
    expect(Math.abs(gears[1].cutoff.mean - gears[2].cutoff.mean)).toBeLessThan(50);
    expect(calculateEvGearing({ ...baselineInput, measurements: scans[1].gears })).toBeNull();
  });
  it('scales only the measured envelope, without labeling it vehicle top speed', () => {
    const baseline = calculateEvGearing(baselineInput)!;
    const candidate = calculateEvGearing({ ...baselineInput, candidateFinalDrive: 4.433 })!;
    expect(candidate.basis).toBe('ratio-preview');
    expect(candidate.envelopes[0].boundSpeedKmh / baseline.envelopes[0].boundSpeedKmh).toBeCloseTo(1 / 1.1, 10);
    expect(candidate.envelopes[1].peakPowerKw).toBe(baseline.envelopes[1].peakPowerKw);
  });
});

// Explicit regeneration only; regular test runs never modify fixtures.
if (process.env.UPDATE_EV_GOLDEN === '1') {
  const single = { ...baselineInput, setup: { ...baselineInput.setup, gearRatios: [4], gearAdjustable: [false] }, measurements: [scans[0].gears[0]] };
  const cases = [
    { id: 'taycan-baseline', input: baselineInput },
    { id: 'candidate-fd', input: { ...baselineInput, candidateFinalDrive: 4.433 } },
    { id: 'single-speed-contract', input: single },
    { id: 'missing-first-gear', input: { ...baselineInput, measurements: scans[1].gears } },
    { id: 'unconfirmed', input: { ...baselineInput, setup: { ...baselineInput.setup, allForwardGearsConfirmed: false } } },
    { id: 'wrong-ratios', input: { ...baselineInput, setup: { ...baselineInput.setup, gearRatios: [4, 3] } } },
    { id: 'locked-final-drive-preview-rejected', input: { ...baselineInput, setup: { ...baselineInput.setup, finalDriveAdjustable: false }, candidateFinalDrive: 4.4 } },
    { id: 'unknown-locked-single-speed', input: { ...single, setup: { ...single.setup, finalDrive: null, gearRatios: [null], finalDriveAdjustable: false }, candidateFinalDrive: null } },
    { id: 'unknown-locked-two-speed', input: { ...baselineInput, setup: { ...baselineInput.setup, finalDrive: null, gearRatios: [null, null], finalDriveAdjustable: false, gearAdjustable: [false, false] }, candidateFinalDrive: null } },
    { id: 'final-drive-only-preview', input: { ...baselineInput, setup: { ...baselineInput.setup, gearRatios: [null, null], gearAdjustable: [false, false] }, candidateFinalDrive: 4.4 } },
  ].map(item => ({ ...item, expected: calculateEvGearing(item.input) }));
  fs.writeFileSync(new URL("../../../../../../tests/fixtures/ev_golden_fixtures.json", import.meta.url), JSON.stringify(cases, null, 2) + '\n');
}
