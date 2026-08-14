import { DiagnosisUnknown } from './diagnosisContracts';

const CALIBRATION_DRIFT_SPEED_THRESHOLD = 5.0; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_AIR_TRAVEL = 0.08; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_IMPACT_G = 3.0; // calibration-prior/v1 status: 'unverified'

export interface TelemetrySample {
  timestamp?: number;
  sidewaysVelocity?: number;
  suspensionTravel?: [number, number, number, number];
  verticalG?: number;
}

export interface TimestampIntegrationResult {
  totalDurationS: number | DiagnosisUnknown;
  driftTimeRatio: number | DiagnosisUnknown;
  airtimeS: number | DiagnosisUnknown;
  impactWindowS: number | DiagnosisUnknown;
  isMonotonic: boolean;
}

export function integrateTimeMetrics(samples: TelemetrySample[]): TimestampIntegrationResult {
  if (samples.length === 0) {
    return {
      totalDurationS: 0,
      driftTimeRatio: 0,
      airtimeS: 0,
      impactWindowS: 0,
      isMonotonic: true
    };
  }

  let totalDurationS = 0;
  let driftTimeS = 0;
  let airtimeS = 0;
  let impactWindowS = 0;
  
  let isMonotonic = true;
  let hasMissingTimestamp = false;
  
  let inAir = false;

  for (let i = 0; i < samples.length; i++) {
    const curr = samples[i];
    
    if (curr.timestamp === undefined) {
      hasMissingTimestamp = true;
      continue;
    }

    if (i > 0) {
      const prev = samples[i - 1];
      if (prev.timestamp === undefined) {
        continue;
      }
      
      const dt = curr.timestamp - prev.timestamp;
      if (dt < 0) {
        isMonotonic = false;
        continue;
      }

      totalDurationS += dt;
      
      if (curr.sidewaysVelocity !== undefined && Math.abs(curr.sidewaysVelocity) > CALIBRATION_DRIFT_SPEED_THRESHOLD) {
        driftTimeS += dt;
      }

      if (curr.suspensionTravel !== undefined) {
        const isSuspExtended = curr.suspensionTravel[0] < CALIBRATION_AIR_TRAVEL &&
                               curr.suspensionTravel[1] < CALIBRATION_AIR_TRAVEL &&
                               curr.suspensionTravel[2] < CALIBRATION_AIR_TRAVEL &&
                               curr.suspensionTravel[3] < CALIBRATION_AIR_TRAVEL;
        if (isSuspExtended) {
          inAir = true;
          airtimeS += dt;
        } else {
          // Landing phase
          if (inAir) {
            inAir = false;
          }
          // Impact window: vertical G spike after landing or during normal driving
          // The prompt says "落地後垂直 G 值尖峰" but let's accumulate time where G > threshold
          if (curr.verticalG !== undefined && Math.abs(curr.verticalG) > CALIBRATION_IMPACT_G) {
            impactWindowS += dt;
          }
        }
      }
    }
  }

  if (hasMissingTimestamp || !isMonotonic) {
    return {
      totalDurationS: 'unknown',
      driftTimeRatio: 'unknown',
      airtimeS: 'unknown',
      impactWindowS: 'unknown',
      isMonotonic: isMonotonic
    };
  }

  return {
    totalDurationS,
    driftTimeRatio: totalDurationS > 0 ? driftTimeS / totalDurationS : 0,
    airtimeS,
    impactWindowS,
    isMonotonic: true
  };
}
