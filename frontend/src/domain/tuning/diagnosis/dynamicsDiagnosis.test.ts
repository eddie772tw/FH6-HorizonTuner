import { describe, it, expect } from 'vitest';
import { analyzeDynamicsMetrics, DynamicsSample } from './dynamicsDiagnosis';

describe('analyzeDynamicsMetrics', () => {
  it('should return missing sensors if input is empty', () => {
    const result = analyzeDynamicsMetrics([], 'test');
    expect(result.hasMissingSensors).toBe(true);
    expect(result.advices.length).toBe(0);
  });

  it('should return missing sensors if required fields are undefined', () => {
    const samples: DynamicsSample[] = [
      { lateralG: 1.0 } // missing tireCombinedSlip and suspensionTravel
    ];
    const result = analyzeDynamicsMetrics(samples, 'test');
    expect(result.hasMissingSensors).toBe(true);
  });

  it('should analyze ARB based on travel differences in high G corners', () => {
    const samples: DynamicsSample[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push({
        lateralG: 1.0,
        tireCombinedSlip: [0.1, 0.1, 0.1, 0.1],
        suspensionTravel: [0.8, 0.8, 0.4, 0.4] // Front compresses more than rear
      });
    }
    const result = analyzeDynamicsMetrics(samples, 'test');
    expect(result.hasMissingSensors).toBe(false);
    const arbAdvice = result.advices.find(a => a.category === 'arb');
    expect(arbAdvice).toBeDefined();
    expect(arbAdvice?.parameterKey).toBe('arbFront');
    expect(arbAdvice?.confidence).toBe('medium');
  });

  it('should analyze damping based on bottom-out rates', () => {
    const samples: DynamicsSample[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push({
        lateralG: 0.1,
        tireCombinedSlip: [0.1, 0.1, 0.1, 0.1],
        suspensionTravel: [0.96, 0.96, 0.5, 0.5] // Front bottoms out
      });
    }
    const result = analyzeDynamicsMetrics(samples, 'test');
    expect(result.hasMissingSensors).toBe(false);
    const dampingAdvice = result.advices.find(a => a.category === 'damping');
    expect(dampingAdvice).toBeDefined();
    expect(dampingAdvice?.parameterKey).toBe('bumpFront');
    expect(dampingAdvice?.confidence).toBe('high');
  });

  it('should analyze differential based on acceleration slip diff', () => {
    const samples: DynamicsSample[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push({
        lateralG: 0.5,
        tireCombinedSlip: [0.1, 0.1, 0.9, 0.1], // Huge diff between rear wheels
        suspensionTravel: [0.5, 0.5, 0.5, 0.5]
      });
    }
    const result = analyzeDynamicsMetrics(samples, 'test');
    expect(result.hasMissingSensors).toBe(false);
    const diffAdvice = result.advices.find(a => a.category === 'differential');
    expect(diffAdvice).toBeDefined();
    expect(diffAdvice?.parameterKey).toBe('accelRear');
  });
});
