export const tireGripCoefficients: Record<string, number> = {
  'Stock': 0.85,
  'Street': 0.95,
  'Sport': 1.05,
  'Semi-Slick': 1.15,
  'Slick': 1.15,
  'Rally': 1.05,
  'Off-Road': 1.05,
  'Snow': 1.05,
  'Drag': 1.40,
  'Drift': 1.05,
  'Default': 1.0
};

export function getTireCoefficient(tireType?: string): number {
  if (!tireType) return tireGripCoefficients['Default'];
  return tireGripCoefficients[tireType] || tireGripCoefficients['Default'];
}
