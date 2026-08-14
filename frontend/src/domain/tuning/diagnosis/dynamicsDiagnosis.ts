import { ClosedLoopAdvice } from './diagnosisContracts';

export interface DynamicsSample {
  tireCombinedSlip?: [number, number, number, number];
  lateralG?: number;
  suspensionTravel?: [number, number, number, number]; // 0~1
  driftAngle?: number;
}

export interface DynamicsDiagnosisResult {
  advices: ClosedLoopAdvice[];
  hasMissingSensors: boolean;
}

const CALIBRATION_SUSPENSION_BOTTOM_OUT = 0.95; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_ARB_ROLL_DIFF = 0.15; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_DIFF_SLIP_TOLERANCE = 0.2; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_LATERAL_G_THRESHOLD = 0.5; // calibration-prior/v1 status: 'unverified'

export function analyzeDynamicsMetrics(samples: DynamicsSample[], sourceProfile: string): DynamicsDiagnosisResult {
  const advices: ClosedLoopAdvice[] = [];
  
  if (samples.length === 0) {
    return { advices, hasMissingSensors: true };
  }

  let hasMissingSensors = false;
  
  let totalFrontTravel = 0;
  let totalRearTravel = 0;
  let bottomOutFront = 0;
  let bottomOutRear = 0;
  
  let accelSlipDiffCount = 0;
  let highGCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    
    if (!s.suspensionTravel || s.lateralG === undefined || !s.tireCombinedSlip) {
      hasMissingSensors = true;
      continue;
    }
    

    totalFrontTravel += (s.suspensionTravel[0] + s.suspensionTravel[1]) / 2;
    totalRearTravel += (s.suspensionTravel[2] + s.suspensionTravel[3]) / 2;
    
    if (s.suspensionTravel[0] >= CALIBRATION_SUSPENSION_BOTTOM_OUT || s.suspensionTravel[1] >= CALIBRATION_SUSPENSION_BOTTOM_OUT) {
      bottomOutFront++;
    }
    if (s.suspensionTravel[2] >= CALIBRATION_SUSPENSION_BOTTOM_OUT || s.suspensionTravel[3] >= CALIBRATION_SUSPENSION_BOTTOM_OUT) {
      bottomOutRear++;
    }

    if (Math.abs(s.lateralG) > CALIBRATION_LATERAL_G_THRESHOLD) {
      highGCount++;
    }
    
    // Check differential slip on acceleration
    const rearSlipL = s.tireCombinedSlip[2];
    const rearSlipR = s.tireCombinedSlip[3];
    if (Math.abs(rearSlipL - rearSlipR) > CALIBRATION_DIFF_SLIP_TOLERANCE && Math.abs(s.lateralG) > 0.2) {
      accelSlipDiffCount++;
    }
  }

  const validSamples = samples.length; // assuming all are valid for rates if sensors missing handled per frame, actually lets just use total length for simplicity

  // ARB Advice (Roll diff in high G corners)
  if (highGCount > validSamples * 0.1) {
    const avgFrontTravel = totalFrontTravel / validSamples;
    const avgRearTravel = totalRearTravel / validSamples;
    const travelDiff = avgFrontTravel - avgRearTravel;

    if (travelDiff > CALIBRATION_ARB_ROLL_DIFF) {
      advices.push({
        category: 'arb',
        parameterKey: 'arbFront',
        currentEstimatedValue: 'unknown',
        recommendedTargetValue: 0,
        delta: 5,
        confidence: 'medium',
        reason: `過彎時前軸側傾顯著大於後軸 (行程差 ${travelDiff.toFixed(2)})，建議調硬前防傾桿以平衡前後滾轉剛性。`,
        sourceProfile
      });
    } else if (travelDiff < -CALIBRATION_ARB_ROLL_DIFF) {
      advices.push({
        category: 'arb',
        parameterKey: 'arbRear',
        currentEstimatedValue: 'unknown',
        recommendedTargetValue: 0,
        delta: 5,
        confidence: 'medium',
        reason: `過彎時後軸側傾顯著大於前軸 (行程差 ${(-travelDiff).toFixed(2)})，建議調硬後防傾桿以平衡前後滾轉剛性。`,
        sourceProfile
      });
    }
  }
  
  // Damping / Spring Advice (Bottom out)
  const frontBottomRate = bottomOutFront / validSamples;
  const rearBottomRate = bottomOutRear / validSamples;
  
  if (frontBottomRate > 0.05) {
    advices.push({
      category: 'damping',
      parameterKey: 'bumpFront',
      currentEstimatedValue: 'unknown',
      recommendedTargetValue: 0,
      delta: 1.0,
      confidence: 'high',
      reason: `前懸吊觸底率過高 (${(frontBottomRate * 100).toFixed(1)}%)，建議調高前壓縮阻尼以吸收衝擊。`,
      sourceProfile
    });
  }
  if (rearBottomRate > 0.05) {
    advices.push({
      category: 'damping',
      parameterKey: 'bumpRear',
      currentEstimatedValue: 'unknown',
      recommendedTargetValue: 0,
      delta: 1.0,
      confidence: 'high',
      reason: `後懸吊觸底率過高 (${(rearBottomRate * 100).toFixed(1)}%)，建議調高後壓縮阻尼以吸收衝擊。`,
      sourceProfile
    });
  }

  // Differential Advice
  if (accelSlipDiffCount > validSamples * 0.1) {
    advices.push({
      category: 'differential',
      parameterKey: 'accelRear',
      currentEstimatedValue: 'unknown',
      recommendedTargetValue: 0,
      delta: 10,
      confidence: 'medium',
      reason: `加速過彎時後輪滑移極不一致，建議調高後差速器加速鎖定率。`,
      sourceProfile
    });
  }

  return { advices, hasMissingSensors };
}
