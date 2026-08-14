import { describe, it, expect } from 'vitest';
import { serializePreset, deserializePreset, TuningPresetV1 } from './presetSerializer';

describe('presetSerializer', () => {
  const mockInput: Omit<TuningPresetV1, 'schemaVersion' | 'createdAt'> = {
    gameBuild: 'FH6_B1.0',
    vehicleClass: 'X999',
    profileUsed: 'road',
    installedParts: { spring: 'race' },
    parameters: { spring_front: 100 },
    solverOutputSnapshot: { val: 42 },
    calibrationStatus: 'verified'
  };

  it('should serialize preset correctly', () => {
    const result = serializePreset(mockInput);
    expect(result.schemaVersion).toBe('tuning-preset/v1');
    expect(typeof result.createdAt).toBe('string');
    // Basic ISO 8601 validation
    expect(!isNaN(Date.parse(result.createdAt))).toBe(true);
    expect(result.gameBuild).toBe('FH6_B1.0');
    expect(result.vehicleClass).toBe('X999');
  });

  it('should deserialize a valid preset correctly', () => {
    const serialized = serializePreset(mockInput);
    const deserialized = deserializePreset(serialized);
    expect(deserialized).toEqual(serialized);
  });

  it('should throw an error if schemaVersion is not tuning-preset/v1', () => {
    const invalid = {
      ...serializePreset(mockInput),
      schemaVersion: 'invalid/v2'
    };
    expect(() => deserializePreset(invalid)).toThrow('Unsupported schemaVersion');
  });

  it('should fallback gameBuild to unknown if not provided', () => {
    const raw = {
      schemaVersion: 'tuning-preset/v1',
      createdAt: new Date().toISOString(),
      vehicleClass: 'X999',
      profileUsed: 'road',
      installedParts: {},
      parameters: {},
      solverOutputSnapshot: null,
      calibrationStatus: 'unverified'
    };
    const deserialized = deserializePreset(raw);
    expect(deserialized.gameBuild).toBe('unknown');
  });

  it('should throw an error for non-object inputs', () => {
    expect(() => deserializePreset(null)).toThrow('Invalid preset format');
    expect(() => deserializePreset('string')).toThrow('Invalid preset format');
  });
});
