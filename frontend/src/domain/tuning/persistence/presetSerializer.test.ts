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

  it.each([
    ['missing createdAt', { createdAt: undefined }],
    ['wrong createdAt', { createdAt: 'not-a-date' }],
    ['vehicleClass', { vehicleClass: 999 }],
    ['profileUsed', { profileUsed: null }],
    ['installedParts', { installedParts: [] }],
    ['parameters', { parameters: { spring_front: 'invalid' } }],
    ['calibrationStatus', { calibrationStatus: 'complete' }],
  ])('should reject invalid %s', (_field, override) => {
    const invalid = { ...serializePreset(mockInput), ...override };
    expect(() => deserializePreset(invalid)).toThrow('Invalid preset format');
  });

  it('should not mutate the raw preset while normalizing it', () => {
    const raw = {
      ...serializePreset(mockInput),
      gameBuild: undefined,
      installedParts: { ...mockInput.installedParts },
      parameters: { ...mockInput.parameters },
    };
    const before = structuredClone(raw);

    const deserialized = deserializePreset(raw);

    expect(raw).toEqual(before);
    expect(deserialized.gameBuild).toBe('unknown');
    expect(deserialized.installedParts).not.toBe(raw.installedParts);
    expect(deserialized.parameters).not.toBe(raw.parameters);
  });

  it('should preserve unknown parameter values', () => {
    const raw = {
      ...serializePreset(mockInput),
      parameters: { spring_front: 'unknown' },
    };

    expect(deserializePreset(raw).parameters).toEqual({ spring_front: 'unknown' });
  });

  it.each([NaN, Infinity, -Infinity])('should reject non-finite parameter values: %s', (value) => {
    const invalid = {
      ...serializePreset(mockInput),
      parameters: { spring_front: value },
    };

    expect(() => deserializePreset(invalid)).toThrow('Invalid preset format');
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
