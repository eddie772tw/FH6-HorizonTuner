//! Frozen desktop dyno wizard guidance. The collector retains its separate quality contract.
use serde_json::{json, Value};
fn n(v: &Value, k: &str, fallback: f64) -> f64 {
    v[k].as_f64()
        .filter(|x| x.is_finite() && *x != 0.0)
        .unwrap_or(fallback)
}
pub fn guidance(frame: &Value, settings: &Value, profile: &Value) -> Value {
    let gear = n(frame, "Gear", 0.0);
    let rpm = n(frame, "CurrentEngineRpm", 0.0);
    let max = n(frame, "EngineMaxRpm", 8000.0);
    let accel = n(frame, "AccelInput", 0.0);
    let brake = n(frame, "BrakeInput", 0.0);
    let hand = n(frame, "HandBrakeInput", 0.0);
    let clutch = n(frame, "ClutchInput", 0.0);
    let target = settings["dyno_test_gear"].as_f64().unwrap_or(4.0);
    let correct = target == 0.0 || gear == target;
    let launch = gear == 1.0 && hand > 50.0 && accel > 200.0;
    let redline = rpm >= max - 250.0;
    let drive = profile["drivetrain"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("RWD");
    let axles: &[usize] = match drive {
        "RWD" => &[2, 3],
        "FWD" => &[0, 1],
        "AWD" => &[0, 1, 2, 3],
        _ => &[],
    };
    let slipped = settings["dyno_filter_slip"].as_bool().unwrap_or(true)
        && axles
            .iter()
            .any(|i| frame["TireSlipRatio"][*i].as_f64().unwrap_or(0.0).abs() > 0.1);
    json!({"launch":launch,"gearCorrect":correct,"waiting":correct&&rpm>0.0&&rpm<2500.0&&accel<50.0&&brake==0.0&&hand==0.0,"start":accel>=250.0&&rpm>=2000.0&&brake==0.0&&hand==0.0&&clutch==0.0,"stop":!correct||accel<200.0||brake>0.0||hand>0.0||clutch>50.0||redline,"completed":rpm>=max*0.82||redline,"slipped":slipped,"targetGear":target})
}
pub fn import_peaks(curve: &Value) -> Value {
    let mut bins: Vec<_> = curve
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(k, v)| k.parse::<u64>().ok().map(|rpm| (rpm, v)))
        .collect();
    bins.sort_by_key(|(rpm, _)| *rpm);
    let (mut hp, mut torque, mut hp_rpm, mut torque_rpm) = (0.0, 0.0, 0, 0);
    for (rpm, v) in bins {
        let h = n(v, "hp", 0.0);
        let t = n(v, "torque", 0.0);
        if h > hp {
            hp = h;
            hp_rpm = rpm;
        }
        if t > torque {
            torque = t;
            torque_rpm = rpm;
        }
    }
    json!({"maxHp":(hp+0.5).floor(),"maxTorque":(torque+0.5).floor(),"maxHpRpm":hp_rpm,"maxTorqueRpm":torque_rpm})
}
pub fn recommended_gear(input: &Value) -> Value {
    let Some(gears) = input["gearing"]["gears"].as_array() else {
        return Value::Null;
    };
    let count = input["gears"].as_u64().filter(|x| *x > 0).unwrap_or(6) as usize;
    let (mut best, mut difference) = (3, 999.0);
    for (i, ratio) in gears.iter().take(count).enumerate() {
        if let Some(ratio) = ratio.as_f64() {
            let diff = (ratio - 1.0).abs();
            if diff < difference {
                best = i;
                difference = diff;
            }
        }
    }
    gears
        .get(best)
        .filter(|v| v.is_number())
        .map(|ratio| json!({"gear":best+1,"ratio":ratio}))
        .unwrap_or(Value::Null)
}
