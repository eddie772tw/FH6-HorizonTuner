import type { EvGearboxSetup } from './types';

export function normalizeEvProfile(raw: unknown): { isElectric: boolean; evGearbox?: EvGearboxSetup } {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const setup = value.evGearbox as Partial<EvGearboxSetup> | undefined;
  const ratio = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 20);
  const valid = setup && ratio(setup.finalDrive) &&
    Array.isArray(setup.gearRatios) && setup.gearRatios.length > 0 && setup.gearRatios.length <= 10 &&
    setup.gearRatios.every(ratio);
  return { isElectric: value.isElectric === true, evGearbox: valid ? {
    finalDrive: setup.finalDrive ?? null, gearRatios: [...setup.gearRatios!],
    finalDriveAdjustable: setup.finalDriveAdjustable === true,
    gearAdjustable: setup.gearRatios!.map((_, i) => setup.gearAdjustable?.[i] === true),
    allForwardGearsConfirmed: setup.allForwardGearsConfirmed === true,
  } : undefined };
}
