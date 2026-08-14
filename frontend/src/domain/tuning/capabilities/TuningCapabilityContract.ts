export type CapabilityStatus = 'unverified' | 'verified';
export type CapabilityBuild = string | 'unknown';

export interface TuningCapabilityContract {
  schemaVersion: 'calibration-prior/v1';
  status: CapabilityStatus;
  gameBuild: CapabilityBuild;
  
  // 懸吊
  spring: boolean;
  damping: boolean;
  arb: boolean;
  
  // 煞車
  brake_balance: boolean;
  brake_pressure: boolean;
  
  // 空氣動力學
  front_aero: boolean;
  rear_aero: boolean;
  
  // 齒輪比
  gear_final: boolean;
  gear_1: boolean;
  gear_2: boolean;
  gear_3: boolean;
  gear_4: boolean;
  gear_5: boolean;
  gear_6: boolean;
  
  // 輪胎
  tire_pressure_hot: boolean;
  camber: boolean;
  toe: boolean;
  caster: boolean;
}

export const DEFAULT_CAPABILITY_CONTRACT: TuningCapabilityContract = {
  schemaVersion: 'calibration-prior/v1',
  status: 'unverified',
  gameBuild: 'unknown',
  spring: false,
  damping: false,
  arb: false,
  brake_balance: false,
  brake_pressure: false,
  front_aero: false,
  rear_aero: false,
  gear_final: false,
  gear_1: false,
  gear_2: false,
  gear_3: false,
  gear_4: false,
  gear_5: false,
  gear_6: false,
  tire_pressure_hot: false,
  camber: false,
  toe: false,
  caster: false,
};
