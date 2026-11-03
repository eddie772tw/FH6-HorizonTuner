/** UI contracts only; Rust owns eligibility, ratio allocation and legal grids. */
export interface RatioBalanceRange { min: number; max: number; step: 0.01 }
export interface RatioBalanceRequest {
  schemaVersion: 'ratio-balance/v1';
  candidateFinalDrive?: number;
  bounds: { source: 'user-observed'; finalDrive: RatioBalanceRange; gears: RatioBalanceRange[] };
}
export interface RatioBalanceDiagnostic {
  status: 'available' | 'unavailable';
  reason?: string;
  base?: { finalDrive: number; gears: number[] };
  legalFinalDrives: number[];
  selectedFinalDrive?: number;
  totalRatioErrors: number[];
  totalRatioTolerance: number[];
}
