export type DynoQualityStatus = 'unavailable' | 'suspect' | 'observing' | 'confident';

export interface DynoQuality {
  status: DynoQualityStatus;
  confidence: number;
  reasons: string[];
  canCollect: boolean;
  segmentId: number;
  segmentReset: boolean;
}

export interface DynoQualityPresentation {
  label: string;
  detail: string;
  tone: 'secondary' | 'warning' | 'info' | 'success';
}

export function presentDynoQuality(quality?: DynoQuality): DynoQualityPresentation {
  if (!quality || quality.status === 'unavailable') {
    return {
      label: 'Measurement unavailable',
      detail: 'Telemetry timestamp quality is unavailable; no measurement is accepted.',
      tone: 'secondary'
    };
  }
  if (quality.status === 'suspect') {
    return {
      label: 'Measurement suspected',
      detail: `Collection paused: ${quality.reasons.join(', ') || 'telemetry discontinuity'}.`,
      tone: 'warning'
    };
  }
  if (quality.status === 'confident') {
    return {
      label: `Measurement confidence ${Math.round(quality.confidence * 100)}%`,
      detail: 'Consistent telemetry samples are being collected; this is not a tuning truth claim.',
      tone: 'success'
    };
  }
  return {
    label: `Measurement confidence ${Math.round(quality.confidence * 100)}%`,
    detail: 'Collecting timestamp-consistent telemetry before confidence is established.',
    tone: 'info'
  };
}
