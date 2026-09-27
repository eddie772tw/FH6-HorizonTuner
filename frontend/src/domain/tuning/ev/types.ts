/** EV contracts are independent of the combustion-engine peak-RPM model. */
export interface EvGearboxSetup {
  finalDrive: number | null;
  gearRatios: (number | null)[];
  finalDriveAdjustable: boolean;
  gearAdjustable: boolean[];
  allForwardGearsConfirmed: boolean;
}

export interface EvIdentity { ordinal: number; performanceIndex: number; carClass: number }
export interface EvMoments { count: number; mean: number; m2: number }
export interface EvCurveBin { rpm: number; powerWatts: number; torqueNewtons: number; count: number }
export interface EvGearMeasurement {
  gear: number;
  acceptedMs: number;
  positiveSamples: number;
  zeroOutputSamples: number;
  lowestRpm: number;
  highestRpm: number;
  reportedMaxRpm: number;
  cutoff: EvMoments;
  rpmPerKmh: EvMoments;
  frontRatio: EvMoments;
  rearRatio: EvMoments;
  curve: EvCurveBin[];
}
export interface EvMeasurement {
  schema: 'ev-measurement/v1';
  carId: string;
  identity?: EvIdentity;
  status: 'collecting' | 'blocked';
  guidance: 'waiting' | 'collecting' | 'identity-changed' | 'session-restarted' | 'sample-limit';
  frameCount: number;
  lastTimestamp?: number;
  lastGear?: number;
  gearSince?: number;
  lastAcceptedTimestamp?: number;
  gears: EvGearMeasurement[];
}
export interface EvGearEnvelope {
  gear: number;
  lowestRpm: number;
  highestRpm: number;
  powerBandStartRpm: number;
  powerBandEndRpm: number;
  peakPowerKw: number;
  boundRpm: number;
  boundKind: 'observed-cut' | 'measured-range';
  baselineRpmPerKmh: number;
  boundSpeedKmh: number;
}
export interface EvGearingInput {
  setup: EvGearboxSetup;
  candidateFinalDrive: number | null;
  measurements: EvGearMeasurement[];
}
export interface EvGearingResult {
  model: 'ev/v1';
  basis: 'measured-baseline' | 'ratio-preview';
  finalDrive: number | null;
  gears: (number | null)[];
  adjustability: { finalDrive: boolean; gears: boolean[] };
  envelopes: EvGearEnvelope[];
}
