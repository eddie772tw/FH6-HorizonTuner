import { describe, expect, it } from 'vitest';
import { validateEngineCapture } from './engineCaptureReadback';

const capture = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 'tuning-capture/v1', metadata: { carId: '42' },
  references: { engineObservationId: 'obs', dependencyKey: 'key' }, samples: [{ timestampMS: 1 }], ...overrides,
});

describe('validateEngineCapture', () => {
  it('accepts only matching bounded readback documents', () => {
    expect(validateEngineCapture(capture(), 'obs', '42', 'key')).not.toBeNull();
    expect(validateEngineCapture(capture({ metadata: { carId: '43' } }), 'obs', '42', 'key')).toBeNull();
    expect(validateEngineCapture(capture({ references: { engineObservationId: 'other', dependencyKey: 'key' } }), 'obs', '42', 'key')).toBeNull();
    expect(validateEngineCapture(capture({ samples: Array.from({ length: 30001 }, () => ({})) }), 'obs', '42', 'key')).toBeNull();
    expect(validateEngineCapture(null, 'obs', '42', 'key')).toBeNull();
  });
});
