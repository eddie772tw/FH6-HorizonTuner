//! Frozen tuning-dev/v1 CLI compatibility, not the calibrated tuning core.
//! Numeric and export contracts come from ec7d769 backend/agent_cli.py.
use serde_json::{json, Value};

fn round(n: f64, digits: usize) -> f64 {
    format!("{n:.digits$}").parse().unwrap_or(n)
}

pub fn chassis(weight: f64, bias: f64, drive: &str, goal: &str, aero_f: f64, aero_r: f64) -> Value {
    let weight = weight.clamp(500., 3500.);
    let lbs = weight * 2.20462;
    let f = (if bias > 1. { bias / 100. } else { bias }).clamp(0.2, 0.8);
    let r = 1. - f;
    let drive = drive.to_uppercase();
    let drive = if ["AWD", "RWD", "FWD"].contains(&drive.as_str()) {
        drive.as_str()
    } else {
        "RWD"
    };
    let goal = goal.to_lowercase();
    let goal = if ["road", "drift", "rally", "drag"].contains(&goal.as_str()) {
        goal.as_str()
    } else {
        "road"
    };
    let (af, ar) = match goal {
        "drag" => (1., 65.),
        "drift" => (10., 50.),
        "rally" => (
            round((64. * f + 1.) * 0.35, 1),
            round((64. * r + 1.) * 0.35, 1),
        ),
        _ if drive == "AWD" => (
            round((1. + 4. * f).min(5.), 1),
            round((65. - 0.3 * (100. - r * 100.)).max(50.), 1),
        ),
        _ => (round(64. * f + 1., 1), round(64. * r + 1., 1)),
    };
    let (bf, br) = (lbs * f * 0.70, lbs * r * 0.70);
    let (sf, sr) = match goal {
        "drift" => (lbs * f * 0.035 * 10., lbs * r * 0.035 * 10.),
        "rally" => (bf * 0.65, br * 0.65),
        "drag" => (bf * 0.5, br * 1.3),
        _ => (
            bf + aero_f.max(0.) / 10. * 0.5,
            br + aero_r.max(0.) / 25. * 0.5,
        ),
    };
    let (hf, hr) = match goal {
        "drift" => ("Lowest + 1 click", "Lowest"),
        "rally" => ("Maximum (Highest)", "Maximum (Highest)"),
        "drag" => ("Lowest (Front Rake)", "Highest (Weight Transfer)"),
        _ => ("Stock/Min + 3 clicks", "Stock/Min + 3 clicks"),
    };
    let (rf, rr, bf, br) = match goal {
        "drift" => (6., 6., 3., 3.),
        "drag" => (3., 12., 4., 10.),
        "rally" => {
            let (a, b) = (round(14. * f + 1., 1), round(14. * r + 1., 1));
            (a, b, round(a * 0.4, 1), round(b * 0.4, 1))
        }
        _ => {
            let (a, b) = (round(19. * f + 1., 1), round(19. * r + 1., 1));
            (a, b, round(a * 0.6, 1), round(b * 0.6, 1))
        }
    };
    let diff = match (drive, goal) {
        ("FWD", _) => [45, 0, 0, 0, 0],
        ("AWD", "drift") => [25, 0, 100, 100, 85],
        ("AWD", "rally") => [40, 0, 70, 20, 60],
        ("AWD", _) => [30, 0, 65, 15, 65],
        (_, "drift" | "drag") => [0, 0, 100, 100, 0],
        _ => [0, 0, 60, 20, 0],
    };
    let (cf, cr, tf, tr, ca, pf, pr) = match goal {
        "drift" => (-3.5, -1., 0.5, -0.2, 7., 32., 26.),
        "rally" => (-1.5, -1., 0.1, 0., 6., 25., 25.),
        "drag" => (-0.5, 0., 0., 0., 5., 35., 20.),
        _ => (-1.8, -1.2, 0., 0., 6.5, 28.5, 28.5),
    };
    json!({"schemaVersion":"tuning-dev/v1","goal":goal,"drivetrain":drive,
        "weight_kg":round(weight,1),"front_weight_bias_pct":round(f*100.,1),
        "anti_roll_bars":{"front":af,"rear":ar},
        "springs":{"front_lbs_in":round(sf,1),"rear_lbs_in":round(sr,1),"front_kgf_mm":round(sf*0.017858,2),"rear_kgf_mm":round(sr*0.017858,2)},
        "ride_height":{"front":hf,"rear":hr},
        "dampers":{"rebound_front":rf,"rebound_rear":rr,"bump_front":bf,"bump_rear":br},
        "alignment":{"camber_front_deg":cf,"camber_rear_deg":cr,"toe_front_deg":tf,"toe_rear_deg":tr,"caster_deg":ca},
        "tires":{"front_cold_psi":pf,"rear_cold_psi":pr,"target_hot_psi":32.0},
        "differential":{"front_accel":diff[0],"front_decel":diff[1],"rear_accel":diff[2],"rear_decel":diff[3],"center_balance":diff[4]}})
}

pub fn gearing(max: f64, peak: f64, top: f64, count: i64, tire: f64) -> Value {
    if ![max, peak, top, tire].iter().all(|v| v.is_finite())
        || max <= 0.
        || peak <= 0.
        || top < 0.
        || tire <= 0.
        || !(1..=10).contains(&count)
    {
        return json!({"error":"Invalid engine or gear parameters"});
    }
    let circ = tire / 100. * std::f64::consts::PI;
    let wheel = top / 3.6 / circ * 60.;
    let fd = if wheel > 0. {
        round(peak / (wheel * 0.85), 2)
    } else {
        3.73
    };
    let step = (peak / max).min(0.85);
    let mut ratio = 3.2;
    let mut gears = Vec::new();
    for g in 1..=count {
        let speed = if fd > 0. && ratio > 0. {
            (max / (ratio * fd) * circ / 60.) * 3.6
        } else {
            0.
        };
        gears.push(json!({"gear":g,"ratio":round(ratio,2),"speed_at_redline_kmh":round(speed,1),"upshift_drop_rpm":if g<count {json!(round(max*step,0))} else {Value::Null}}));
        ratio *= step;
    }
    json!({"final_drive":fd,"gears_count":count,"gears":gears,"powerband_retention_ratio":round(step,3)})
}

pub fn applied(chassis: &Value, gearing: Option<&Value>) -> Value {
    let mut out = json!({"rideHeightFront":12.0,"rideHeightRear":12.0});
    for (dest, group, field) in [
        ("tirePressureFront", "tires", "front_cold_psi"),
        ("tirePressureRear", "tires", "rear_cold_psi"),
        ("camberFront", "alignment", "camber_front_deg"),
        ("camberRear", "alignment", "camber_rear_deg"),
        ("toeFront", "alignment", "toe_front_deg"),
        ("toeRear", "alignment", "toe_rear_deg"),
        ("caster", "alignment", "caster_deg"),
        ("arbFront", "anti_roll_bars", "front"),
        ("arbRear", "anti_roll_bars", "rear"),
        ("springsFront", "springs", "front_lbs_in"),
        ("springsRear", "springs", "rear_lbs_in"),
        ("reboundFront", "dampers", "rebound_front"),
        ("reboundRear", "dampers", "rebound_rear"),
        ("bumpFront", "dampers", "bump_front"),
        ("bumpRear", "dampers", "bump_rear"),
        ("diffAccelRear", "differential", "rear_accel"),
        ("diffDecelRear", "differential", "rear_decel"),
        ("diffAccelFront", "differential", "front_accel"),
        ("diffDecelFront", "differential", "front_decel"),
        ("diffCenterRear", "differential", "center_balance"),
    ] {
        out[dest] = chassis[group][field].clone();
    }
    if let Some(g) = gearing {
        out["finalDrive"] = g["final_drive"].clone();
    }
    out
}

pub fn preset(class: &str, chassis: &Value, gearing: &Value) -> Value {
    let applied = applied(chassis, Some(gearing));
    let mut parameters = json!({});
    for (dest, src) in [
        ("tire_pressure_f", "tirePressureFront"),
        ("tire_pressure_r", "tirePressureRear"),
        ("camber_front", "camberFront"),
        ("camber_rear", "camberRear"),
        ("toe_front", "toeFront"),
        ("toe_rear", "toeRear"),
        ("caster", "caster"),
        ("arb_front", "arbFront"),
        ("arb_rear", "arbRear"),
        ("spring_front", "springsFront"),
        ("spring_rear", "springsRear"),
        ("rebound_front", "reboundFront"),
        ("rebound_rear", "reboundRear"),
        ("bump_front", "bumpFront"),
        ("bump_rear", "bumpRear"),
        ("diff_accel_rear", "diffAccelRear"),
        ("diff_decel_rear", "diffDecelRear"),
        ("final_drive", "finalDrive"),
    ] {
        parameters[dest] = applied[src].clone();
    }
    json!({"schemaVersion":"tuning-preset/v1","createdAt":chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),"gameBuild":"FH6_B1.0","vehicleClass":class.to_uppercase(),"profileUsed":chassis["goal"],"installedParts":{},"parameters":parameters,"solverOutputSnapshot":{"chassis":chassis,"gearing":gearing},"calibrationStatus":"unverified"})
}
