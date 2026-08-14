import { describe, it, expect } from 'vitest';
import { analyzeThermalMetrics, ThermalInput } from './thermalDiagnosis';

describe('analyzeThermalMetrics', () => {
  it('should return missing sensors if any tire is missing', () => {
    const input: ThermalInput = {
      fl: { inner: 90, middle: 90, outer: 90 },
      fr: { inner: 90, middle: 90, outer: 90 },
      unit: 'C',
      targetHotPressurePsi: 33.0
    };
    const result = analyzeThermalMetrics(input, 'testProfile');
    expect(result.hasMissingSensors).toBe(true);
    expect(result.advices.length).toBe(0);
  });

  it('should analyze camber gradients and suggest negative camber increase if diff > 15C', () => {
    const input: ThermalInput = {
      fl: { inner: 106, middle: 90, outer: 90 }, // diff = 16C
      fr: { inner: 90, middle: 90, outer: 90 },
      rl: { inner: 90, middle: 90, outer: 90 },
      rr: { inner: 90, middle: 90, outer: 90 },
      unit: 'C',
      targetHotPressurePsi: 33.0
    };
    const result = analyzeThermalMetrics(input, 'testProfile');
    expect(result.hasMissingSensors).toBe(false);
    expect(result.advices.length).toBe(1);
    expect(result.advices[0].category).toBe('camber');
    expect(result.advices[0].parameterKey).toBe('camberFront');
    expect(result.advices[0].delta).toBe(-0.5);
  });

  it('should correctly handle Fahrenheit conversion for camber gradient', () => {
    // 15C diff is 27F diff. So if inner = 200F and outer = 170F (diff=30F), it should trigger.
    const input: ThermalInput = {
      fl: { inner: 200, middle: 185, outer: 170 }, // diff = 30F = 16.6C
      fr: { inner: 180, middle: 180, outer: 180 },
      rl: { inner: 180, middle: 180, outer: 180 },
      rr: { inner: 180, middle: 180, outer: 180 },
      unit: 'F',
      targetHotPressurePsi: 33.0
    };
    const result = analyzeThermalMetrics(input, 'testProfile');
    expect(result.hasMissingSensors).toBe(false);
    expect(result.advices.length).toBe(1);
    expect(result.advices[0].category).toBe('camber');
    expect(result.advices[0].reason).toContain('16.7'); // ~16.666
  });

  it('should suggest tire pressure adjustments based on current pressure', () => {
    const input: ThermalInput = {
      fl: { inner: 90, middle: 90, outer: 90 },
      fr: { inner: 90, middle: 90, outer: 90 },
      rl: { inner: 90, middle: 90, outer: 90 },
      rr: { inner: 90, middle: 90, outer: 90 },
      unit: 'C',
      targetHotPressurePsi: 33.0,
      currentHotPressurePsi: { fl: 31.0, fr: 31.0, rl: 34.0, rr: 34.0 }
    };
    const result = analyzeThermalMetrics(input, 'testProfile');
    expect(result.hasMissingSensors).toBe(false);
    
    const pressureAdvices = result.advices.filter(a => a.category === 'tire_pressure');
    expect(pressureAdvices.length).toBe(2);
    
    const frontAdv = pressureAdvices.find(a => a.parameterKey === 'pressureFront');
    expect(frontAdv?.delta).toBe(2.0); // 33.0 - 31.0
    
    const rearAdv = pressureAdvices.find(a => a.parameterKey === 'pressureRear');
    expect(rearAdv?.delta).toBe(-1.0); // 33.0 - 34.0
  });
});
