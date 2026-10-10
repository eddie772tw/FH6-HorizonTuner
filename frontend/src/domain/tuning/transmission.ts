/** Selection/transport only; Rust owns qualification and capability decisions. */
export interface TransmissionSelection {
  type: 'discrete' | 'cvt';
  capability?: 'unknown' | 'fixed' | 'final-drive-only' | 'simulated-gears';
}
export interface CvtFoundationResult {
  schemaVersion: 'cvt-qualification/v1';
  status: 'unsupported';
  captureStatus: 'qualified' | 'missing' | 'invalid' | 'stale' | 'unsupported';
  diagnostics: { status: string; code: string; field: string }[];
  longestContinuousMs: number;
  acceptedSampleCount: number;
  ratioPreview: null;
}
export function usesCvt(profile: { transmission?: TransmissionSelection } | null | undefined): boolean {
  return !!profile?.transmission && profile.transmission.type !== 'discrete';
}
