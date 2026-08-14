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

export function deserializePreset(raw: unknown): TuningPresetV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid preset format');
  }
  
  const obj = raw as Record<string, unknown>;
  
  if (obj.schemaVersion !== 'tuning-preset/v1') {
    throw new Error('Unsupported schemaVersion');
  }
  
  if (!obj.gameBuild || typeof obj.gameBuild !== 'string') {
    obj.gameBuild = 'unknown';
  }
  
  return obj as TuningPresetV1;
}
