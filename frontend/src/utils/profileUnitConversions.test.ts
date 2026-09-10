import { describe, expect, it } from 'vitest';
import type { UnitSettings } from '../context/SettingsContext';
import {
  displayPowerToProfile,
  displayTorqueToProfile,
  displayWeightToProfile,
  profilePowerToDisplay,
  profileTorqueToDisplay,
  profileWeightToDisplay,
} from './profileUnitConversions';

const metric: UnitSettings = {
  speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'bar', boostPressure: 'bar',
  springRate: 'kgfmm', rideHeight: 'cm', suspensionForce: 'kgf', power: 'kw', torque: 'nm',
};

describe('profile display conversions', () => {
  it('round-trips canonical profile values for a metric display without losing precision', () => {
    const profile = { weight: 1413.408328041368, maxHp: 406.25, maxTorque: 347.375 };

    expect(displayWeightToProfile(profileWeightToDisplay(profile.weight, metric), metric)).toBeCloseTo(profile.weight, 10);
    expect(displayPowerToProfile(profilePowerToDisplay(profile.maxHp, metric), metric)).toBeCloseTo(profile.maxHp, 10);
    expect(displayTorqueToProfile(profileTorqueToDisplay(profile.maxTorque, metric), metric)).toBeCloseTo(profile.maxTorque, 10);
  });

  it('uses profile-native hp and lb-ft as display values while converting stored kg', () => {
    const imperial = { ...metric, weight: 'lbs' as const, power: 'hp' as const, torque: 'lbft' as const };
    expect(profileWeightToDisplay(1000, imperial)).toBe(2204.62);
    expect(displayWeightToProfile(2204.62, imperial)).toBeCloseTo(1000, 10);
    expect(profilePowerToDisplay(406.25, imperial)).toBe(406.25);
    expect(profileTorqueToDisplay(347.375, imperial)).toBe(347.375);
  });
});
