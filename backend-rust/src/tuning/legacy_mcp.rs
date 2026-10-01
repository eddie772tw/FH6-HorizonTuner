//! Frozen MCP quick model. Not numerically identical to legacy_cli/v1.
use serde_json::{json, Map, Value};
pub const MODEL_VERSION: &str = "legacy-mcp/v1";
fn round(v: f64, places: i32) -> f64 {
    let precision = places.max(0) as usize;
    format!("{v:.precision$}").parse().unwrap_or(v)
}
pub fn chassis(c: &Map<String, Value>, purpose: &str) -> Value {
    let w = c["weight_kg"].as_f64().unwrap_or(1400.) * 2.20462;
    let f0 = c["front_weight_bias"].as_f64().unwrap_or(0.52);
    let f = if f0 > 1. { f0 / 100. } else { f0 };
    let r = 1. - f;
    let dt = c["drivetrain"].as_str().unwrap_or("RWD").to_uppercase();
    let (af, ar) = match purpose {
        "drag" => (1., 65.),
        "drift" => (round(f * 45. + 1., 1), round(r * 45. + 1., 1)),
        _ => (round(f * 64. + 1., 1), round(r * 64. + 1., 1)),
    };
    let rf = round(f * 12. + 3., 1);
    let rr = round(r * 12. + 3., 1);
    let diff = if dt == "FWD" {
        json!({"front_accel":45,"front_decel":0,"rear_accel":0,"rear_decel":0,"center_balance":0})
    } else if dt == "AWD" {
        json!({"front_accel":30,"front_decel":0,"rear_accel":65,"rear_decel":15,"center_balance":65})
    } else if purpose == "drift" {
        json!({"front_accel":0,"front_decel":0,"rear_accel":100,"rear_decel":100,"center_balance":0})
    } else {
        json!({"front_accel":0,"front_decel":0,"rear_accel":60,"rear_decel":20,"center_balance":0})
    };
    json!({"schemaVersion":"tuning-dev/v1","purpose":purpose,"calculated_setup":{"tires":{"front_cold_psi":28.5,"rear_cold_psi":28.5,"target_hot_psi":32.0},"alignment":{"camber_front_deg":if purpose=="drag"{-0.5}else{-1.8},"camber_rear_deg":if purpose=="drag"{0.0}else{-1.2},"toe_front_deg":if purpose=="drift"{0.5}else{0.0},"toe_rear_deg":if purpose=="drift"{-0.2}else{0.0},"caster_deg":if purpose=="drift"{7.0}else{6.5}},"anti_roll_bars":{"front":af,"rear":ar},"springs":{"front_lbs_in":round(w*f*0.7,1),"rear_lbs_in":round(w*r*0.7,1)},"dampers":{"rebound_front":rf,"rebound_rear":rr,"bump_front":round(rf*0.6,1),"bump_rear":round(rr*0.6,1)},"differential":diff}})
}

pub fn diagnosis(t: &[f64], symptom: Option<&str>) -> Value {
    if t.len() < 4 {
        return json!({"error":"Requires 4 tire temperatures (FL, FR, RL, RR)"});
    };
    let f = (t[0] + t[1]) / 2.;
    let r = (t[2] + t[3]) / 2.;
    let d = f - r;
    let mut a = Vec::new();
    if d > 5. {
        a.push(json!("Front axle overheat: Soften Front ARB (-2.0) or increase front cold tire pressure (+0.5 PSI)."))
    } else if d < -5. {
        a.push(json!("Rear axle overheat: Soften Rear ARB (-2.0) or increase rear cold tire pressure (+0.5 PSI)."))
    }
    if symptom == Some("understeer_entry") {
        a.push(json!("Entry Understeer: Increase front negative camber (-0.2°) and reduce front bump damping."))
    } else if symptom == Some("oversteer_exit") {
        a.push(json!("Exit Oversteer: Soften rear spring (-5%) or reduce rear acceleration differential lock (-10%)."))
    }
    if a.is_empty() {
        a.push(json!(
            "Tire thermal balance is nominal. No adjustments required."
        ))
    }
    json!({"front_avg_temp_c":round(f,1),"rear_avg_temp_c":round(r,1),"axle_delta_t_c":round(d,1),"convergence_status":if d.abs()<=3.0{"converged"}else{"adjustment_required"},"actionable_directives":a})
}
