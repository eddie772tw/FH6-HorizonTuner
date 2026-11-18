use std::f64::consts::PI;

pub fn calc_gear_speed(rpm: f64, gear_ratio: f64, final_drive: f64, tire_radius_m: f64) -> f64 {
    if !rpm.is_finite()
        || rpm <= 0.0
        || !gear_ratio.is_finite()
        || gear_ratio <= 0.0
        || !final_drive.is_finite()
        || final_drive <= 0.0
        || !tire_radius_m.is_finite()
        || tire_radius_m <= 0.0
    {
        return 0.0;
    }
    (rpm * 2.0 * PI * tire_radius_m) / (gear_ratio * final_drive * 60.0)
}

pub fn calc_gear_rpm(speed_ms: f64, gear_ratio: f64, final_drive: f64, tire_radius_m: f64) -> f64 {
    if !speed_ms.is_finite()
        || speed_ms <= 0.0
        || !gear_ratio.is_finite()
        || gear_ratio <= 0.0
        || !final_drive.is_finite()
        || final_drive <= 0.0
        || !tire_radius_m.is_finite()
        || tire_radius_m <= 0.0
    {
        return 0.0;
    }
    (speed_ms * gear_ratio * final_drive * 60.0) / (2.0 * PI * tire_radius_m)
}
