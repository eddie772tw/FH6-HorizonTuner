/** Persisted HUD unit contract, independent of any settings form. */
export interface HudDisplayUnits {
  speed: 'kmh' | 'mph';
  boostPressure: 'psi' | 'bar' | 'kpa';
  torque: 'nm' | 'lbft';
  power: 'kw' | 'hp' | 'ps';
  temperature: 'C' | 'F';
}
