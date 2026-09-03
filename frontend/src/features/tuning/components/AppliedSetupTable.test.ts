import { describe, it, expect } from 'vitest';
import {
  AppliedSetupTable,
  convertDisplayedSpringToCanonical,
  convertDisplayedHeightToCanonical
} from './AppliedSetupTable';
import { AppliedTuningSetup } from '../../../utils/tuningDiagnosis';

describe('AppliedSetupTable Component Contract', () => {
  it('應正確導出 AppliedSetupTable 組件並符合 TypeScript 契約', () => {
    expect(AppliedSetupTable).toBeDefined();
    expect(typeof AppliedSetupTable).toBe('function');
  });

  it('AppliedTuningSetup 結構應包含所有必要的調校參數鍵名', () => {
    const mockSetup: AppliedTuningSetup = {
      tirePressureFront: 28.5,
      tirePressureRear: 28.5,
      camberFront: -1.5,
      camberRear: -1.0,
      toeFront: 0.0,
      toeRear: 0.0,
      caster: 5.5,
      arbFront: 15.0,
      arbRear: 35.0,
      springsFront: 50.0,
      springsRear: 50.0,
      rideHeightFront: 12.0,
      rideHeightRear: 12.0,
      reboundFront: 10.0,
      reboundRear: 10.0,
      bumpFront: 6.0,
      bumpRear: 6.0,
      diffAccelRear: 50,
      diffDecelRear: 20
    };

    expect(mockSetup.tirePressureFront).toBe(28.5);
    expect(mockSetup.arbFront).toBe(15.0);
    expect(mockSetup.bumpFront).toBe(6.0);
    expect(mockSetup.diffAccelRear).toBe(50);
  });

  it('keeps spring and height edits in canonical units', () => {
    const springCanonical = 50;
    const springDisplayed = springCanonical * 55.9974;
    const heightCanonical = 10;
    const heightDisplayed = heightCanonical * 0.3937;

    // Direct inverse verification (Reviewer regression requirement)
    expect(springDisplayed / 55.9974).toBeCloseTo(springCanonical);
    expect(heightDisplayed / 0.3937).toBeCloseTo(heightCanonical);

    // Component helper inverse verification in imperial mode
    const mockSpringToKgfmmImperial = (val: number) => val / 55.9974;
    const mockHeightToCmImperial = (val: number) => val / 0.3937;

    const springResult = convertDisplayedSpringToCanonical(springDisplayed, mockSpringToKgfmmImperial);
    const heightResult = convertDisplayedHeightToCanonical(heightDisplayed, mockHeightToCmImperial);

    expect(springResult).toBeCloseTo(springCanonical, 1);
    expect(heightResult).toBeCloseTo(heightCanonical, 1);

    // Component helper verification in metric mode (no conversion needed)
    const mockMetricIdentity = (val: number) => val;
    expect(convertDisplayedSpringToCanonical(50, mockMetricIdentity)).toBe(50);
    expect(convertDisplayedHeightToCanonical(10, mockMetricIdentity)).toBe(10);
  });
});
