import { ROAD_BASELINE_INPUTS, type RoadBaselineInputName } from '../../utils/tuningMath';
export type RoadBaselineGroup = 'pressure' | 'springs' | 'height' | 'arb' | 'damping' | 'alignment' | 'differential' | 'gearing';
export type InputName = RoadBaselineInputName;
export const roadInputGroups = ROAD_BASELINE_INPUTS;
export const roadInputUnits: Partial<Record<InputName, string>> = { weight: 'kg', weight_distribution: '%', maxHp: 'hp',
  frontTireWidth: 'mm', rearTireWidth: 'mm', frontTireAspect: '%', rearTireAspect: '%', frontTireRim: 'in', rearTireRim: 'in',
  spring_front_min: 'kgf/mm', spring_front_max: 'kgf/mm', spring_rear_min: 'kgf/mm', spring_rear_max: 'kgf/mm',
  height_front_min: 'cm', height_front_max: 'cm', height_rear_min: 'cm', height_rear_max: 'cm' };
