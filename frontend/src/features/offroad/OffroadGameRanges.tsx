import type { OffroadSetting } from './offroadTypes';

export interface GameRangeSpec {
  unit: OffroadSetting['unit'];
  minimum: number;
  maximum: number;
  step: number;
}

export const OFFROAD_DEFAULT_RANGES: Record<string, GameRangeSpec> = {
  'pressure.front': { unit: 'psi', minimum: 15.0, maximum: 55.0, step: 0.5 },
  'pressure.rear': { unit: 'psi', minimum: 15.0, maximum: 55.0, step: 0.5 },
  'spring.front': { unit: 'kgf/mm', minimum: 20.0, maximum: 200.0, step: 1.0 },
  'spring.rear': { unit: 'kgf/mm', minimum: 20.0, maximum: 200.0, step: 1.0 },
  'height.front': { unit: 'cm', minimum: 10.0, maximum: 30.0, step: 0.5 },
  'height.rear': { unit: 'cm', minimum: 10.0, maximum: 30.0, step: 0.5 },
  'arb.front': { unit: 'slider', minimum: 1.0, maximum: 65.0, step: 0.1 },
  'arb.rear': { unit: 'slider', minimum: 1.0, maximum: 65.0, step: 0.1 },
  'rebound.front': { unit: 'slider', minimum: 1.0, maximum: 20.0, step: 0.1 },
  'rebound.rear': { unit: 'slider', minimum: 1.0, maximum: 20.0, step: 0.1 },
  'bump.front': { unit: 'slider', minimum: 1.0, maximum: 20.0, step: 0.1 },
  'bump.rear': { unit: 'slider', minimum: 1.0, maximum: 20.0, step: 0.1 },
};
