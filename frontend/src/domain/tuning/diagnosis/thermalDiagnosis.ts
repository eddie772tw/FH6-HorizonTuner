import { ClosedLoopAdvice } from './diagnosisContracts';

const CALIBRATION_CAMBER_TEMP_DIFF = 15.0; // calibration-prior/v1 status: 'unverified'
const CALIBRATION_TEMP_CONVERSION = 5 / 9; // calibration-prior/v1 status: 'unverified'

export interface TireTempArray {
  inner: number;
  middle: number;
  outer: number;
}

export interface ThermalInput {
  fl?: TireTempArray;
  fr?: TireTempArray;
  rl?: TireTempArray;
  rr?: TireTempArray;
  unit: 'C' | 'F';
  targetHotPressurePsi: number;
  currentHotPressurePsi?: { fl: number; fr: number; rl: number; rr: number };
}

export interface ThermalDiagnosisResult {
  advices: ClosedLoopAdvice[];
  hasMissingSensors: boolean;
}

export function analyzeThermalMetrics(input: ThermalInput, sourceProfile: string): ThermalDiagnosisResult {
  const advices: ClosedLoopAdvice[] = [];
  
  if (!input.fl || !input.fr || !input.rl || !input.rr) {
    return { advices, hasMissingSensors: true };
  }
  
  const toCelsius = (val: number) => input.unit === 'F' ? (val - 32) * CALIBRATION_TEMP_CONVERSION : val;
  
  // Camber analysis (inner vs outer)
  const analyzeCamber = (tire: TireTempArray, key: string, name: string) => {
    const innerC = toCelsius(tire.inner);
    const outerC = toCelsius(tire.outer);
    const diff = innerC - outerC;
    
    if (diff > CALIBRATION_CAMBER_TEMP_DIFF) {
      advices.push({
        category: 'camber',
        parameterKey: key,
        currentEstimatedValue: 'unknown',
        recommendedTargetValue: 0,
        delta: -0.5,
        confidence: 'high',
        reason: `${name}內側溫度比外側高出 ${diff.toFixed(1)}°C，超過 15°C 的容許梯度，建議增加負外傾角。`,
        sourceProfile
      });
    }
  };

  analyzeCamber(input.fl, 'camberFront', '左前輪');
  analyzeCamber(input.fr, 'camberFront', '右前輪');
  analyzeCamber(input.rl, 'camberRear', '左後輪');
  analyzeCamber(input.rr, 'camberRear', '右後輪');
  
  // Tire pressure advice (if current pressure is provided)
  if (input.currentHotPressurePsi) {
     const frontAvgPressure = (input.currentHotPressurePsi.fl + input.currentHotPressurePsi.fr) / 2;
     const rearAvgPressure = (input.currentHotPressurePsi.rl + input.currentHotPressurePsi.rr) / 2;
     
     const frontDiff = input.targetHotPressurePsi - frontAvgPressure;
     if (Math.abs(frontDiff) > 0.5) {
       advices.push({
         category: 'tire_pressure',
         parameterKey: 'pressureFront',
         currentEstimatedValue: frontAvgPressure,
         recommendedTargetValue: input.targetHotPressurePsi,
         delta: frontDiff,
         confidence: 'high',
         reason: `前軸熱胎壓與目標差距 ${frontDiff.toFixed(1)} PSI，建議修正胎壓。`,
         sourceProfile
       });
     }
     
     const rearDiff = input.targetHotPressurePsi - rearAvgPressure;
     if (Math.abs(rearDiff) > 0.5) {
       advices.push({
         category: 'tire_pressure',
         parameterKey: 'pressureRear',
         currentEstimatedValue: rearAvgPressure,
         recommendedTargetValue: input.targetHotPressurePsi,
         delta: rearDiff,
         confidence: 'high',
         reason: `後軸熱胎壓與目標差距 ${rearDiff.toFixed(1)} PSI，建議修正胎壓。`,
         sourceProfile
       });
     }
  }

  return { advices, hasMissingSensors: false };
}
