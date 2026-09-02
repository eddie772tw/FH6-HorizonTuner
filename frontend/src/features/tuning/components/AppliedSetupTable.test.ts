import { describe, it, expect } from 'vitest';
import { AppliedSetupTable } from './AppliedSetupTable';
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
});
