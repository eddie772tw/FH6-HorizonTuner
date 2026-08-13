import { describe, expect, it } from 'vitest';
import { parseCalibrationDataset, TuningCalibrationRecord, validateCalibrationRecord } from './calibration';

const record: TuningCalibrationRecord = {
  car_id: 'fixture-car',
  drivetrain: 'AWD',
  class: 'A',
  pi: 'unknown',
  game_build: 'unknown',
  installed_parts: ['race-suspension'],
  tire_type: 'Sport',
  surface: 'tarmac',
  weather: 'dry',
  assists: [],
  event_type: 'road',
  track: 'fixture-track',
  share_code: 'unknown',
  control_section: 'springs',
  field: 'front',
  display_value: 42.5,
  unit: 'kgf/mm',
  min: 'unknown',
  max: 'unknown',
  step: 'unknown',
  precision: 'unknown',
  screenshot_path: 'unverified/fixture.png',
  telemetry_session: 'unknown',
  lap_time: 'unknown',
  launch_time: 'unknown',
  notes: 'Schema fixture only; not a validated FH6 measurement.',
  confidence: 'unverified'
};

describe('tuning calibration schema', () => {
  it('accepts an explicit unknown boundary without treating it as zero', () => {
    expect(validateCalibrationRecord(record)).toEqual([]);
    expect(parseCalibrationDataset({ schemaVersion: 'tuning-calibration/v1', records: [record] }).records[0].min).toBe('unknown');
  });

  it('rejects invalid ranges and steps', () => {
    const errors = validateCalibrationRecord({ ...record, min: 10, max: 5, step: 0 });
    expect(errors).toContain('min must not exceed max.');
    expect(errors).toContain('step must be a positive number, snap, or unknown.');
  });

  it('rejects an unsupported dataset schema', () => {
    expect(() => parseCalibrationDataset({ schemaVersion: 'v0', records: [] })).toThrow('Unsupported calibration dataset schema.');
  });
});
