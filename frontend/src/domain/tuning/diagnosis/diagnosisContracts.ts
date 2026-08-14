export type DiagnosisUnknown = 'unknown';
export type DiagnosisConfidence = 'high' | 'medium' | 'low';

export interface ClosedLoopAdvice {
  category: 'tire_pressure' | 'camber' | 'spring' | 'damping' | 'arb' | 'differential' | 'gearing';
  parameterKey: string;
  currentEstimatedValue: number | DiagnosisUnknown;
  recommendedTargetValue: number;
  delta: number | DiagnosisUnknown;
  confidence: DiagnosisConfidence;
  reason: string;
  sourceProfile: string;
}

export interface DiagnosisSessionSummary {
  totalSamples: number;
  durationS: number | DiagnosisUnknown;
  timestampMonotonic: boolean;
  missingSensors: string[];
}
