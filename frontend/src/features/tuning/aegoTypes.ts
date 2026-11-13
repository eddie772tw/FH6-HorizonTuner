/** Values resolved by the Rust model. The UI never guesses tire or RPM inputs. */
export interface GearingView {
  tireRadiusM: number;
  drivenTireAxle: 'front' | 'rear';
  referenceRpm: number;
  maxRpm: number;
  effectiveRedline: number;
  powerPeakRpm: number;
  torquePeakRpm: number;
  speedSemantics: string;
}

export interface DriftWorkingTarget {
  source: 'user-target';
  mainGear?: number;
  targetRpm?: number;
  wheelSpeedKmh?: number;
}

export interface AegoGearingDiagnostics {
  modelId: string;
  modelVersion: string;
  status: 'available' | 'limited' | 'unavailable';
  reason?: string;
  targetSource?: string;
  launchSource?: string;
  boundsSource?: string;
  speedSemantics?: string;
  drivetrainApplicability?: string;
  workingBandStatus?: string;
  targetSpeedKmh?: number;
  actualSpeedKmh?: number;
  endpointErrorKmh?: number;
  endpointToleranceKmh?: number;
  launchTargetSpeedKmh?: number;
  actualLaunchSpeedKmh?: number;
  launchErrorKmh?: number;
  launchToleranceKmh?: number;
  mainGear?: number;
  targetRpm?: number;
  targetWheelSpeedKmh?: number;
  actualWheelSpeedKmh?: number;
  wheelSpeedErrorKmh?: number;
  actualRpmAtTargetWheelSpeed?: number;
  finalDriveSaturated?: boolean;
  shapePreferenceLimited?: boolean;
  previewCapApplied?: boolean;
  outsideModelFinalDrivePrior?: boolean;
  referenceRpm?: number;
  maxRpm?: number;
}
