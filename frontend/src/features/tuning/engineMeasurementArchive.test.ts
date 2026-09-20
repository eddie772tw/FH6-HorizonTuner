import { describe, expect, it } from 'vitest';
import { engineDependencyKey, parseEngineArchive } from './engineMeasurementArchive';
import type { TuningCarParams } from '../../utils/tuningMath';
import type { EngineObservation } from './engineMeasurementArchive';
const profile: TuningCarParams = { weight: 1200, weight_distribution: 60, drivetrain: 'FWD', induction: 'NA', maxHp: 300, maxTorque: 250, maxHpRpm: 7000, maxTorqueRpm: 5000 };
describe('engine observation dependencies', () => {
  it('roundtrips a completed observation and rejects altered identity or coverage', () => {
    const item: EngineObservation = {
      schema: 'engine-observation/v1', id: 'saved-scan', carId: '42', source: 'measured', capturedAt: 1000,
      dependencyKey: engineDependencyKey('42', profile),
      data: { carId: '42', status: 'ready', guidance: 'ready', acceptedMs: 6500, engineMaxRpm: 8000,
        identity: { ordinal: 42, carClass: 3, performanceIndex: 700 }, lowestRpm: 3000, highestRpm: 7500,
        observedPeakPower: { rpm: 7000, value: 200000 }, observedPeakTorque: { rpm: 5000, value: 400 },
        bins: Array.from({ length: 9 }, (_, i) => ({ index: i + 6, sampleCount: 10, averageRpm: 3000 + i * 500,
          averagePowerWatts: 200000, averageTorqueNewtons: 400, rpmSum: (3000 + i * 500) * 10,
          powerWattsSum: 2000000, torqueNewtonsSum: 4000 })) },
    };
    expect(parseEngineArchive(JSON.stringify([{ ...item, capture: { samples: Array.from({ length: 30000 }, () => ({})) } }]))).toEqual([{ ...item }]);
    for (const data of [{ ...item.data, acceptedMs: 500 }, { ...item.data, highestRpm: 6000 },
      { ...item.data, identity: { ...item.data.identity, ordinal: 43 } },
      { ...item.data, bins: item.data.bins.map(() => item.data.bins[0]) }]) {
      expect(parseEngineArchive(JSON.stringify([{ ...item, data }]))).toEqual([]);
    }
  });
  it('keeps scans compatible with unrelated suspension and tire geometry edits', () => {
    const key = engineDependencyKey('42', profile);
    expect(engineDependencyKey('42', { ...profile, spring_front_min: 30, weight: 1250, frontTireRim: 19 })).toBe(key);
    expect(engineDependencyKey('42', { ...profile, maxHp: 350 })).not.toBe(key);
    expect(engineDependencyKey('42', { ...profile, induction: 'Turbo' })).not.toBe(key);
    expect(engineDependencyKey('43', profile)).not.toBe(key);
  });
  it('does not promote malformed or mismatched archive data to a ready observation', () => {
    for (const value of [null, '{}', 'not json', JSON.stringify([{ schema: 'engine-observation/v1', id: 'x', carId: '42', dependencyKey: 'key', data: { status: 'ready', engineMaxRpm: 8000 } }])]) expect(parseEngineArchive(value)).toEqual([]);
  });
  it('accepts low-rev-limit observation with effectiveRedline or dropoff flag', () => {
    const item: EngineObservation = {
      schema: 'engine-observation/v1', id: 'low-rev-scan', carId: '42', source: 'measured', capturedAt: 1000,
      dependencyKey: engineDependencyKey('42', profile),
      data: { carId: '42', status: 'ready', guidance: 'ready', acceptedMs: 6500, engineMaxRpm: 8000,
        effectiveRedline: 6200, powerDropoffDetected: true,
        identity: { ordinal: 42, carClass: 3, performanceIndex: 700 }, lowestRpm: 3000, highestRpm: 6000,
        observedPeakPower: { rpm: 5000, value: 200000 }, observedPeakTorque: { rpm: 4000, value: 400 },
        bins: Array.from({ length: 6 }, (_, i) => ({ index: i + 6, sampleCount: 10, averageRpm: 3000 + i * 500,
          averagePowerWatts: 200000, averageTorqueNewtons: 400, rpmSum: (3000 + i * 500) * 10,
          powerWattsSum: 2000000, torqueNewtonsSum: 4000 })) },
    };
    expect(parseEngineArchive(JSON.stringify([item]))).toEqual([item]);
  });
  it('requires 90 percent coverage and reserves six bins for a valid adaptive limit', () => {
    const item: EngineObservation = {
      schema: 'engine-observation/v1', id: 'coverage-boundary', carId: '42', source: 'measured', capturedAt: 1000,
      dependencyKey: engineDependencyKey('42', profile),
      data: { carId: '42', status: 'ready', guidance: 'ready', acceptedMs: 6500, engineMaxRpm: 8000,
        identity: { ordinal: 42, carClass: 3, performanceIndex: 700 }, lowestRpm: 3000, highestRpm: 7200,
        observedPeakPower: { rpm: 7000, value: 200000 }, observedPeakTorque: { rpm: 5000, value: 400 },
        bins: Array.from({ length: 8 }, (_, i) => ({ index: i + 6, sampleCount: 10, averageRpm: 3000 + i * 500,
          averagePowerWatts: 200000, averageTorqueNewtons: 400, rpmSum: (3000 + i * 500) * 10,
          powerWattsSum: 2000000, torqueNewtonsSum: 4000 })) },
    };
    for (const highestRpm of [6800, 7040]) {
      expect(parseEngineArchive(JSON.stringify([{ ...item, data: { ...item.data, highestRpm } }]))).toEqual([]);
    }
    expect(parseEngineArchive(JSON.stringify([item]))).toEqual([item]);
    expect(parseEngineArchive(JSON.stringify([{ ...item, data: { ...item.data, bins: item.data.bins.slice(0, 6) } }]))).toEqual([]);
    expect(parseEngineArchive(JSON.stringify([{ ...item, data: { ...item.data, effectiveRedline: 6200,
      powerDropoffDetected: true, highestRpm: 6000, bins: item.data.bins.slice(0, 6) } }]))).toEqual([
      { ...item, data: { ...item.data, effectiveRedline: 6200, powerDropoffDetected: true, highestRpm: 6000, bins: item.data.bins.slice(0, 6) } },
    ]);
  });
  it('rejects malformed morphology flags, invalid effective limits, and flag-only adaptive coverage', () => {
    const item: EngineObservation = {
      schema: 'engine-observation/v1', id: 'morphology-boundary', carId: '42', source: 'measured', capturedAt: 1000,
      dependencyKey: engineDependencyKey('42', profile),
      data: { carId: '42', status: 'ready', guidance: 'ready', acceptedMs: 6500, engineMaxRpm: 8000,
        identity: { ordinal: 42, carClass: 3, performanceIndex: 700 }, lowestRpm: 3000, highestRpm: 6000,
        observedPeakPower: { rpm: 5000, value: 200000 }, observedPeakTorque: { rpm: 4000, value: 400 },
        bins: Array.from({ length: 8 }, (_, i) => ({ index: i + 6, sampleCount: 10, averageRpm: 3000 + i * 500,
          averagePowerWatts: 200000, averageTorqueNewtons: 400, rpmSum: (3000 + i * 500) * 10,
          powerWattsSum: 2000000, torqueNewtonsSum: 4000 })) },
    };
    for (const data of [
      { ...item.data, powerDropoffDetected: 'true' as unknown as boolean, effectiveRedline: 6200 },
      { ...item.data, cutoffDetected: 1 as unknown as boolean, effectiveRedline: 6200 },
      { ...item.data, powerDropoffDetected: true },
      { ...item.data, powerDropoffDetected: true, effectiveRedline: 0 },
      { ...item.data, cutoffDetected: true, effectiveRedline: -1 },
      { ...item.data, cutoffDetected: true, effectiveRedline: 8200 },
    ]) {
      expect(parseEngineArchive(JSON.stringify([{ ...item, data }]))).toEqual([]);
    }
  });
});
