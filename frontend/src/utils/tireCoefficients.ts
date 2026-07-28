export const tireGripCoefficients: Record<string, number> = {
  'Stock': 0.85,
  'Street': 0.90,
  'Sport': 0.95,
  'Semi-Slick': 1.05,
  'Slick': 1.15,
  'Rally': 0.85,
  'Off-Road': 0.80,
  'Snow': 0.70,
  'Drag': 1.25,
  'Drift': 0.90,
  'Default': 1.0
};

export function getTireCoefficient(tireType?: string): number {
  if (!tireType) return tireGripCoefficients['Default'];
  return tireGripCoefficients[tireType] || tireGripCoefficients['Default'];
}
