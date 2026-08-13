export type CalibrationConfidence = 'unverified' | 'community' | 'in_game_capture';
export type CalibrationUnknown = 'unknown';
export type CalibrationNumber = number | CalibrationUnknown;
export type CalibrationStep = number | 'snap' | CalibrationUnknown;

export interface TuningCalibrationRecord {
  car_id: string;
  drivetrain: 'FWD' | 'RWD' | 'AWD' | 'unknown';
  class: string;
  pi: number | CalibrationUnknown;
  game_build: string;
  installed_parts: string[];
  tire_type: string;
  surface: string;
  weather: string;
  assists: string[];
  event_type: string;
  track: string;
  share_code: string;
  control_section: string;
  field: string;
  display_value: number | string | CalibrationUnknown;
  unit: string;
  min: CalibrationNumber;
  max: CalibrationNumber;
  step: CalibrationStep;
  precision: number | CalibrationUnknown;
  screenshot_path: string;
  telemetry_session: string;
  lap_time: CalibrationNumber;
  launch_time: CalibrationNumber;
  notes: string;
  confidence: CalibrationConfidence;
}

export interface TuningCalibrationDataset {
  schemaVersion: 'tuning-calibration/v1';
  records: TuningCalibrationRecord[];
}

const isNumberOrUnknown = (value: unknown): value is number | CalibrationUnknown =>
  value === 'unknown' || (typeof value === 'number' && Number.isFinite(value));

const isStep = (value: unknown): value is CalibrationStep =>
  value === 'unknown' || value === 'snap' || (typeof value === 'number' && Number.isFinite(value) && value > 0);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateCalibrationRecord(record: Partial<TuningCalibrationRecord>): string[] {
  const errors: string[] = [];
  const requiredStrings: Array<keyof TuningCalibrationRecord> = [
    'car_id', 'class', 'game_build', 'tire_type', 'surface', 'weather', 'event_type', 'track', 'share_code',
    'control_section', 'field', 'unit', 'screenshot_path', 'telemetry_session', 'notes'
  ];
  for (const field of requiredStrings) if (typeof record[field] !== 'string') errors.push(`${field} must be a string.`);
  if (!['FWD', 'RWD', 'AWD', 'unknown'].includes(record.drivetrain ?? '')) errors.push('drivetrain is invalid.');
  if (!isStringArray(record.installed_parts)) errors.push('installed_parts must be a string array.');
  if (!isStringArray(record.assists)) errors.push('assists must be a string array.');
  if (!isNumberOrUnknown(record.pi)) errors.push('pi must be a finite number or unknown.');
  if (!(typeof record.display_value === 'number' || typeof record.display_value === 'string')) errors.push('display_value must be a number or string.');
  const min = record.min;
  const max = record.max;
  if (!isNumberOrUnknown(min) || !isNumberOrUnknown(max)) errors.push('min and max must be finite numbers or unknown.');
  if (isNumberOrUnknown(min) && isNumberOrUnknown(max) && min !== 'unknown' && max !== 'unknown' && min > max) errors.push('min must not exceed max.');
  if (!isStep(record.step)) errors.push('step must be a positive number, snap, or unknown.');
  if (!isNumberOrUnknown(record.precision)) errors.push('precision must be a finite number or unknown.');
  if (!isNumberOrUnknown(record.lap_time) || !isNumberOrUnknown(record.launch_time)) errors.push('timing fields must be finite numbers or unknown.');
  if (!['unverified', 'community', 'in_game_capture'].includes(record.confidence ?? '')) errors.push('confidence is invalid.');
  return errors;
}

export function validateCalibrationDataset(dataset: TuningCalibrationDataset): string[] {
  const errors: string[] = [];
  if (dataset.schemaVersion !== 'tuning-calibration/v1') errors.push('Unsupported calibration dataset schema.');
  if (!Array.isArray(dataset.records)) return [...errors, 'records must be an array.'];
  dataset.records.forEach((record, index) => {
    for (const error of validateCalibrationRecord(record)) errors.push(`records[${index}]: ${error}`);
  });
  return errors;
}

export function parseCalibrationDataset(raw: unknown): TuningCalibrationDataset {
  if (!raw || typeof raw !== 'object') throw new Error('Calibration dataset must be an object.');
  const dataset = raw as Partial<TuningCalibrationDataset>;
  const candidate = { schemaVersion: dataset.schemaVersion, records: dataset.records } as TuningCalibrationDataset;
  const errors = validateCalibrationDataset(candidate);
  if (errors.length > 0) throw new Error(`Invalid calibration dataset: ${errors.join(' ')}`);
  return candidate;
}
