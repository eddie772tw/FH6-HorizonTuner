// Frozen characterization reference. Never import at runtime from product code.
import { evGearReady } from "./measurement";
import type { EvGearingInput, EvGearingResult } from "../../../../../src/domain/tuning/ev/types";

/** Measured fixed-ratio EV envelope; no ICE power-peak anchoring or guessed tire radius. */
export function calculateEvGearing(input: EvGearingInput): EvGearingResult | null {
  const { setup, measurements, candidateFinalDrive } = input;
  const ratios = setup.gearRatios;
  const validRatio = (n: number | null) => n === null || (Number.isFinite(n) && n > 0 && n <= 20);
  const changed = candidateFinalDrive !== setup.finalDrive;
  if (!setup.allForwardGearsConfirmed || !validRatio(setup.finalDrive) || !validRatio(candidateFinalDrive) ||
    (changed && (!setup.finalDriveAdjustable || setup.finalDrive === null || candidateFinalDrive === null)) ||
    !ratios.length || ratios.length > 10 || !ratios.every(validRatio) || setup.gearAdjustable?.length !== ratios.length ||
    ratios.some((r, i) => i > 0 && r !== null && ratios[i - 1] !== null && r >= ratios[i - 1]!) ||
    measurements.length !== ratios.length) return null;
  const ordered = [...measurements].sort((a, b) => a.gear - b.gear);
  if (ordered.some((g, i) => g.gear !== i + 1 || !evGearReady(g))) return null;
  // A common final drive may scale speed only if all measured gears support the entered ratios.
  const known = ordered.flatMap((g, i) => ratios[i] === null ? [] : [g.rpmPerKmh.mean / ratios[i]!]);
  if (known.some(r => Math.abs(r / known[0] - 1) > 0.05)) return null;
  const scale = changed ? candidateFinalDrive! / setup.finalDrive! : 1;
  return {
    model: 'ev/v1', basis: changed ? 'ratio-preview' : 'measured-baseline',
    finalDrive: candidateFinalDrive, gears: [...ratios],
    adjustability: { finalDrive: setup.finalDriveAdjustable === true, gears: setup.gearAdjustable.map(v => v === true) },
    envelopes: ordered.map(g => {
      const peak = Math.max(...g.curve.filter(b => b.count >= 3).map(b => b.powerWatts));
      const band = g.curve.filter(b => b.count >= 3 && b.powerWatts >= peak * 0.95);
      const cut = g.cutoff.count >= 3 && Number.isFinite(g.cutoff.mean) && g.cutoff.mean > 0;
      const boundRpm = cut ? g.cutoff.mean : g.highestRpm;
      return { gear: g.gear, lowestRpm: g.lowestRpm, highestRpm: g.highestRpm,
        powerBandStartRpm: band[0]?.rpm ?? g.highestRpm,
        powerBandEndRpm: band[band.length - 1]?.rpm ?? g.highestRpm,
        peakPowerKw: peak / 1000, boundRpm,
        boundKind: cut ? 'observed-cut' : 'measured-range',
        baselineRpmPerKmh: g.rpmPerKmh.mean, boundSpeedKmh: boundRpm / (g.rpmPerKmh.mean * scale) };
    }),
  };
}
