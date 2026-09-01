export interface TuningPresetV1 {
  schemaVersion: 'tuning-preset/v1';
  createdAt: string;          // ISO 8601
  gameBuild: string;          // e.g. "FH6_B1.0" 或 "unknown"
  vehicleClass: string;       // e.g. "X999"
  profileUsed: string;        // e.g. "road" | "rally" | "drift" | "drag"
  installedParts: Record<string, string>;
  parameters: Record<string, number | 'unknown'>;
  solverOutputSnapshot: unknown;
  calibrationStatus: 'unverified' | 'in-calibration' | 'verified';
}

export function serializePreset(input: Omit<TuningPresetV1, 'schemaVersion' | 'createdAt'>): TuningPresetV1 {
  return {
    schemaVersion: 'tuning-preset/v1',
    createdAt: new Date().toISOString(),
    ...input,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidCreatedAt(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isParameterRecord(value: unknown): value is Record<string, number | 'unknown'> {
  return isRecord(value) && Object.values(value).every((entry) => (
    entry === 'unknown' || (typeof entry === 'number' && Number.isFinite(entry))
  ));
}

function invalidPreset(): never {
  throw new Error('Invalid preset format');
}

export function deserializePreset(raw: unknown): TuningPresetV1 {
  if (!isRecord(raw)) {
    invalidPreset();
  }

  const obj = raw;

  if (obj.schemaVersion !== 'tuning-preset/v1') {
    throw new Error('Unsupported schemaVersion');
  }

  if (!isValidCreatedAt(obj.createdAt) || !isNonEmptyString(obj.vehicleClass) || !isNonEmptyString(obj.profileUsed)) {
    invalidPreset();
  }

  if (!isStringRecord(obj.installedParts) || !isParameterRecord(obj.parameters)) {
    invalidPreset();
  }

  if (obj.calibrationStatus !== 'unverified' && obj.calibrationStatus !== 'in-calibration' && obj.calibrationStatus !== 'verified') {
    invalidPreset();
  }

  return {
    schemaVersion: 'tuning-preset/v1',
    createdAt: obj.createdAt,
    gameBuild: isNonEmptyString(obj.gameBuild) ? obj.gameBuild : 'unknown',
    vehicleClass: obj.vehicleClass,
    profileUsed: obj.profileUsed,
    installedParts: { ...obj.installedParts },
    parameters: { ...obj.parameters },
    solverOutputSnapshot: obj.solverOutputSnapshot,
    calibrationStatus: obj.calibrationStatus,
  };
}
