/**
 * Unit conversion utility for Forza Horizon Tuner
 */

export const KG_TO_LBS = 2.20462;
export const LBS_TO_KG = 1 / KG_TO_LBS;

export const KGFMM_TO_LBSIN = 55.9974;
export const LBSIN_TO_KGFMM = 1 / KGFMM_TO_LBSIN;

export const PSI_TO_BAR = 0.0689476;
export const BAR_TO_PSI = 1 / PSI_TO_BAR;
export const PSI_TO_KPA = 6.89476;

export function lbsToKg(lbs: number): number {
  return lbs * LBS_TO_KG;
}

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

export function lbsInToKgfMm(lbsIn: number): number {
  return lbsIn * LBSIN_TO_KGFMM;
}

export function kgfMmToLbsIn(kgfMm: number): number {
  return kgfMm * KGFMM_TO_LBSIN;
}

export function psiToBar(psi: number): number {
  return psi * PSI_TO_BAR;
}

export function barToPsi(bar: number): number {
  return bar * BAR_TO_PSI;
}

export function psiToKpa(psi: number): number {
  return psi * PSI_TO_KPA;
}

