import type { UnitSettings } from '../context/SettingsContext';

/**
 * Stored car profiles use kg, hp, and lb-ft. These helpers only translate
 * values at a display/input boundary; callers must persist the returned
 * profile values without applying a second conversion.
 */
export const profileWeightToDisplay = (kg: number, units: Pick<UnitSettings, 'weight'>): number =>
  units.weight === 'lbs' ? kg * 2.20462 : kg;

export const displayWeightToProfile = (value: number, units: Pick<UnitSettings, 'weight'>): number =>
  units.weight === 'lbs' ? value / 2.20462 : value;

export const profilePowerToDisplay = (hp: number, units: Pick<UnitSettings, 'power'>): number => {
  if (units.power === 'kw') return hp * 0.7457;
  if (units.power === 'ps') return hp * 1.01387;
  return hp;
};

export const displayPowerToProfile = (value: number, units: Pick<UnitSettings, 'power'>): number => {
  if (units.power === 'kw') return value / 0.7457;
  if (units.power === 'ps') return value / 1.01387;
  return value;
};

export const profileTorqueToDisplay = (lbft: number, units: Pick<UnitSettings, 'torque'>): number =>
  units.torque === 'nm' ? lbft * 1.35582 : lbft;

export const displayTorqueToProfile = (value: number, units: Pick<UnitSettings, 'torque'>): number =>
  units.torque === 'nm' ? value / 1.35582 : value;
