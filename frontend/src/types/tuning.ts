export interface CarParams {
  id?: string;
  name?: string;
  weight_kg: number;
  weight_distribution_front: number;
  max_hp?: number;
  max_torque_nm?: number;
  max_rpm?: number;
  drive_type?: 'AWD' | 'RWD' | 'FWD';
  front_tire_width?: number;
  rear_tire_width?: number;
  num_gears?: number;
}

export interface TuningResult {
  tire_pressure?: {
    front: number;
    rear: number;
  };
  springs?: {
    front: number;
    rear: number;
  };
  ride_height?: {
    front: number;
    rear: number;
  };
  arb?: {
    front: number;
    rear: number;
  };
  dampers?: {
    rebound_front: number;
    rebound_rear: number;
    bump_front: number;
    bump_rear: number;
  };
  gearing?: {
    final_drive: number;
    gears: number[];
  };
}
