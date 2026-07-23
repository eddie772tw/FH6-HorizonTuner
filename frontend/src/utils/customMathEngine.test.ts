import { describe, it, expect } from 'vitest';
import { evaluateCustomMath } from './customMathEngine';

describe('evaluateCustomMath Channel Formula Engine', () => {
  const mockContext: Record<string, number> = {
    SpeedMetersPerSecond: 50.0,
    CurrentEngineRpm: 6000,
    AccelInput: 255,
    BrakeInput: 0,
    AccelerationX: 9.81,
    AccelerationZ: -19.62,
    TireTemp_0: 90.0,
    TireTemp_2: 95.0,
  };

  it('should evaluate simple variable math expressions correctly', () => {
    expect(evaluateCustomMath('Speed * 3.6', mockContext)).toBe(180.0);
    expect(evaluateCustomMath('LatG / 9.81', mockContext)).toBe(1.0);
    expect(evaluateCustomMath('LonG / 9.81', mockContext)).toBe(-2.0);
  });

  it('should evaluate difference between inputs', () => {
    expect(evaluateCustomMath('AccelInput - BrakeInput', mockContext)).toBe(255);
  });

  it('should handle parentheses and operator precedence', () => {
    expect(evaluateCustomMath('(TireTemp_2 - TireTemp_0) * 2', mockContext)).toBe(10.0);
  });

  it('should fallback to 0 for invalid or malicious string input', () => {
    expect(evaluateCustomMath('alert("hacked")', mockContext)).toBe(0);
    expect(evaluateCustomMath('Speed * unknown_var', mockContext)).toBe(0);
  });
});
