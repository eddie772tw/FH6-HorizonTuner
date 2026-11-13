import type { GearingResult } from '../../../domain/tuning/types';
import type { GearingView } from '../aegoTypes';

/** Validate display input completeness, without selecting an axle or a fallback. */
export function validGearingView(view: GearingView | null | undefined, gearing: GearingResult): view is GearingView {
  return Boolean(view && ['front', 'rear'].includes(view.drivenTireAxle)
    && [view.tireRadiusM, view.referenceRpm, view.maxRpm, view.effectiveRedline, view.powerPeakRpm, view.torquePeakRpm]
      .every(value => Number.isFinite(value) && value > 0)
    && view.effectiveRedline <= view.maxRpm && !gearing.unsupported
    && Number.isFinite(gearing.finalDrive) && gearing.finalDrive > 0 && gearing.gears.length >= 4
    && gearing.gears.every((gear, index) => Number.isFinite(gear) && gear > 0 && (!index || gear < gearing.gears[index - 1])));
}
