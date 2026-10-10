//! Explicit unknown bounds remain unknown; no guessed game slider limits.
use serde_json::{json, Value};
pub fn contract(car: &Value) -> Value {
    let a = &car["adjustability"];
    let part = |k: &str| a[k].as_str().unwrap_or("unknown");
    let suspension = part("suspension");
    let arb = part("arb");
    let gearbox = part("gearbox");
    let aero = part("aero");
    let brakes = part("brakes");
    let diff = part("diff");
    let su = suspension != "Fixed" && suspension != "unknown";
    let au = arb == "Adjustable";
    let cvt = super::cvt::selected(car);
    let gu = !cvt && (gearbox == "Full" || gearbox == "FinalDrive");
    let fu = !cvt && gearbox == "Full";
    let aero_u = ["Adjustable", "Front Only", "Rear Only"].contains(&aero);
    let bu = brakes == "Adjustable";
    let du = diff == "Adjustable";
    let current=format!("suspension:{suspension};arb:{arb};gearbox:{gearbox};aero:{aero};brakes:{brakes};diff:{diff}");
    let mut controls = vec![];
    for (section, field, unlocked, unit, key) in [
        ("springs", "front", su, "kgf/mm", "spring_front"),
        ("springs", "rear", su, "kgf/mm", "spring_rear"),
        ("rideHeight", "front", su, "cm", "height_front"),
        ("rideHeight", "rear", su, "cm", "height_rear"),
        ("arb", "front", au, "game-value", "arb_front"),
        ("arb", "rear", au, "game-value", "arb_rear"),
        ("damping", "rebound", su, "game-value", ""),
        ("damping", "bump", su, "game-value", ""),
        ("gearing", "finalDrive", gu, "ratio", ""),
        (
            "gearing",
            "gears",
            fu && a["gears"].as_f64().is_some_and(f64::is_finite),
            "ratio",
            "",
        ),
        (
            "aero",
            "front",
            aero_u && aero != "Rear Only",
            "game-value",
            "",
        ),
        (
            "aero",
            "rear",
            aero_u && aero != "Front Only",
            "game-value",
            "",
        ),
        ("brakes", "balance", bu, "%", ""),
        ("diff", "frontAccel", du, "%", ""),
        ("diff", "frontDecel", du, "%", ""),
        ("diff", "rearAccel", du, "%", ""),
        ("diff", "rearDecel", du, "%", ""),
        ("diff", "centerToRear", du, "%", ""),
    ] {
        let min = car[format!("{key}_min")].as_f64();
        let max = car[format!("{key}_max")].as_f64();
        let bounded = !key.is_empty()
            && min
                .zip(max)
                .is_some_and(|(a, b)| a.is_finite() && b.is_finite() && a <= b);
        controls.push(json!({"section":section,"field":field,"unlocked":unlocked,"min":if bounded{json!(min)}else{json!("unknown")},"max":if bounded{json!(max)}else{json!("unknown")},"step":"unknown","precision":"unknown","unit":unit,"source":if bounded{"default"}else{"unknown"},"installedPart":current}));
    }
    json!({"schemaVersion":"tuning-capabilities/v1","game":"forza-horizon-6","gameBuild":"unknown","source":"default","upgrades":[{"installedPart":current,"capabilities":{"suspension":su,"arb":au,"gearbox":gu,"fullGearbox":fu,"aero":aero_u,"brakes":bu,"differential":du},"controls":controls}],"controls":controls})
}
