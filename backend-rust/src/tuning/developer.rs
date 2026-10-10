//! Frozen desktop experimental model, distinct from CLI and MCP quick models.
use serde_json::{json, Value};
pub const MODEL_VERSION: &str = "legacy-desktop-experimental/v1";
fn n(v: &Value, k: &str, f: f64) -> f64 {
    v[k].as_f64().filter(|v| v.is_finite()).unwrap_or(f)
}
fn round(v: f64, d: i32) -> f64 {
    let factor = 10_f64.powi(d);
    (v * factor + 0.5).floor() / factor
}
fn clamp(v: f64, low: f64, high: f64) -> f64 {
    v.max(low).min(high)
}
fn bounds(c: &Value, key: &str, low: f64, high: f64) -> (f64, f64) {
    let max = n(c, &format!("{key}_max"), high);
    let min = n(c, &format!("{key}_min"), low);
    (if min <= max { min } else { low }, max)
}
pub fn calculate(input: &Value) -> Result<Value, String> {
    let car = &input["car"];
    let goal = input["raceGoal"].as_str().ok_or("raceGoal is required")?;
    let surface = input["surface"].as_str().ok_or("surface is required")?;
    if !["Road", "Rally", "Drag", "Drift"].contains(&goal)
        || !["tarmac", "gravel", "snow", "dragStrip"].contains(&surface)
        || !car.is_object()
    {
        return Err("Invalid developer inputs".into());
    }
    let drive = car["drivetrain"].as_str().unwrap_or("RWD");
    let weight = n(car, "weight", 1400.0).max(600.0);
    let front = clamp(n(car, "weight_distribution", 50.0), 20.0, 80.0) / 100.0;
    let fm = weight * 0.86 * front / 2.0;
    let rm = weight * 0.86 * (1.0 - front) / 2.0;
    let ff = clamp(n(input, "targetRideFrequencyFrontHz", 2.2), 1.0, 4.5);
    let rf = clamp(n(input, "targetRideFrequencyRearHz", 2.3), 1.0, 4.5);
    let (fsmin, fsmax) = bounds(car, "spring_front", 10.0, 120.0);
    let (rsmin, rsmax) = bounds(car, "spring_rear", 10.0, 120.0);
    let fs = clamp(
        (2.0 * std::f64::consts::PI * ff).powi(2) * fm / 9806.65,
        fsmin,
        fsmax,
    );
    let rs = clamp(
        (2.0 * std::f64::consts::PI * rf).powi(2) * rm / 9806.65,
        rsmin,
        rsmax,
    );
    let (fhmin, fhmax) = bounds(car, "height_front", 10.0, 25.0);
    let (rhmin, rhmax) = bounds(car, "height_rear", 10.0, 25.0);
    let (fraction_f, fraction_r, arb_f, arb_r) = match goal {
        "Rally" => (0.9, 0.9, 0.42, 0.5),
        "Drag" => (0.05, 0.7, 0.12, 0.95),
        "Drift" => (0.2, 0.2, 0.3, 0.9),
        _ => (0.12, 0.12, 0.62, 0.78),
    };
    let (famin, famax) = bounds(car, "arb_front", 1.0, 65.0);
    let (ramin, ramax) = bounds(car, "arb_rear", 1.0, 65.0);
    let bias = (front - 0.5) * 8.0;
    let fc = round(2.0 * (fs * 9806.65 * fm).sqrt(), 1);
    let rc = round(2.0 * (rs * 9806.65 * rm).sqrt(), 1);
    let fdr = clamp(n(input, "dampingRatioFront", 0.7), 0.3, 1.2);
    let rdr = clamp(n(input, "dampingRatioRear", 0.7), 0.3, 1.2);
    let freb = round(fc * fdr, 1);
    let rreb = round(rc * rdr, 1);
    let fslider = round(clamp(1.0 + fdr * 16.0 + (ff - 2.0) * 1.5, 1.0, 20.0), 1);
    let rslider = round(clamp(1.0 + rdr * 16.0 + (rf - 2.0) * 1.5, 1.0, 20.0), 1);
    let chassis = json!({"springs":{"modelType":"direct_wheel_load_approx","assumedMotionRatio":1.0,"frontKgfMm":round(fs,2),"rearKgfMm":round(rs,2),"frontRideHeightCm":round(fhmin+(fhmax-fhmin)*fraction_f,1),"rearRideHeightCm":round(rhmin+(rhmax-rhmin)*fraction_r,1)},"damping":{"frontCriticalNsM":fc,"rearCriticalNsM":rc,"frontSliderValue":fslider,"rearSliderValue":rslider,"bumpToReboundRatio":0.55,"physical":{"frontCriticalNsM":fc,"rearCriticalNsM":rc,"frontReboundDampingNsM":freb,"rearReboundDampingNsM":rreb,"frontBumpDampingNsM":round(freb*0.55,1),"rearBumpDampingNsM":round(rreb*0.55,1)},"priors":{"frontDampingRatio":fdr,"rearDampingRatio":rdr,"bumpToReboundRatio":0.55,"source":"calibration-prior/v1"},"sliderMapping":{"frontSliderValue":fslider,"rearSliderValue":rslider,"mappingSource":"advisory_heuristic_v1"}},"arb":{"front":round(clamp(1.0+64.0*arb_f*front+bias,famin,famax),1),"rear":round(clamp(1.0+64.0*arb_r*(1.0-front)-bias,ramin,ramax),1)}});
    let (hot, camber_f, camber_r, toe_f, toe_r, caster) = match goal {
        "Rally" => (27.5, -1.3, -0.8, 0.02, 0.08, 5.5),
        "Drag" => (23.5, 0.0, -0.1, 0.0, 0.0, 5.0),
        "Drift" => (24.0, -3.5, -0.8, -0.1, 0.15, 7.0),
        _ => (30.0, -1.5, -0.8, 0.0, 0.05, 6.5),
    };
    let hot = hot
        + match surface {
            "snow" => -1.0,
            "gravel" => -0.5,
            _ => 0.0,
        };
    let alignment = json!({"pressureColdFrontPsi":round(hot-3.0,1),"pressureColdRearPsi":round(hot-3.0,1),"targetHotPressurePsi":round(hot,1),"camberFrontDeg":camber_f,"camberRearDeg":camber_r,"toeFrontDeg":toe_f,"toeRearDeg":toe_r,"casterDeg":caster});
    let compound = car["tireType"].as_str().unwrap_or("Default");
    let (compound, long, lat) = match compound {
        "Stock" => (compound, 0.85, 0.85),
        "Street" => (compound, 0.95, 0.95),
        "Sport" => (compound, 1.05, 1.05),
        "Semi-Slick" | "Slick" => (compound, 1.15, 1.15),
        "Rally" => (compound, 1.05, 1.02),
        "Off-Road" => (compound, 1.02, 1.0),
        "Snow" => (compound, 1.05, 1.0),
        "Drag" => (compound, 1.4, 0.7),
        "Drift" => (compound, 1.05, 0.82),
        _ => ("Default", 1.0, 1.0),
    };
    let (sf, sl) = match surface {
        "gravel" => (0.78, 0.82),
        "snow" => (0.62, 0.66),
        "dragStrip" => (1.08, 0.92),
        _ => (1.0, 1.0),
    };
    let tire = json!({"compound":compound,"surface":surface,"muLongitudinal":round(long*sf,3),"muLateral":round(lat*sl,3),"temperatureMultiplier":1.0,"pressureMultiplier":1.0,"loadSensitivity":0.7,"peakSlipRatio":if compound=="Drag"{0.08}else if compound=="Drift"{0.12}else{0.10},"peakSlipAngleDeg":if compound=="Drift"{8.0}else{6.5},"source":"calibration-prior"});
    let fwd = drive == "FWD";
    let rwd = drive == "RWD";
    let (fa, fd, ra, rd, center) = match goal {
        "Drag" => (
            if fwd { 80 } else { 0 },
            if fwd { 20 } else { 0 },
            if rwd { 100 } else { 0 },
            if rwd { 25 } else { 0 },
            50,
        ),
        "Drift" => (
            if fwd { 45 } else { 0 },
            0,
            if rwd { 100 } else { 85 },
            if rwd { 20 } else { 15 },
            75,
        ),
        "Rally" => (
            if fwd { 55 } else { 35 },
            15,
            if rwd { 65 } else { 55 },
            20,
            58,
        ),
        _ => (
            if fwd { 35 } else { 25 },
            10,
            if rwd { 55 } else { 45 },
            18,
            60,
        ),
    };
    let differential = json!({"frontAccelPercent":fa,"frontDecelPercent":fd,"rearAccelPercent":ra,"rearDecelPercent":rd,"centerToRearPercent":center});
    let gearing = if super::cvt::selected(car) || car["isElectric"] == true {
        json!({"finalDrive":0,"gears":[],"tireCircumferenceM":0,"topSpeedAtPeakHpKmh":0,"unsupported":true,"unsupportedReason":if super::cvt::selected(car) {"CVT solver is unavailable; use the capture foundation."} else {"EV requires the measured EV workflow."}})
    } else {
        let axle = if fwd { "front" } else { "rear" };
        let circumference = ((n(car, &format!("{axle}TireWidth"), 245.0)
            * n(car, &format!("{axle}TireAspect"), 40.0)
            / 100.0)
            * 2.0
            + n(car, &format!("{axle}TireRim"), 18.0) * 25.4)
            * std::f64::consts::PI
            / 1000.0;
        let rpm = n(car, "maxHpRpm", 7500.0).max(3000.0);
        let target = clamp(n(input, "targetTopSpeedKmh", 280.0), 80.0, 450.0);
        let top = match goal {
            "Drag" | "Drift" => 1.0,
            "Rally" => 0.84,
            _ => 0.78,
        };
        let fd = clamp(
            rpm * circumference * 60.0 / (target * 1000.0 * top),
            2.0,
            6.5,
        );
        let count = clamp(n(&car["adjustability"], "gears", 6.0).round(), 4.0, 10.0) as usize;
        let first_target = match goal {
            "Drag" => 105.0,
            "Drift" => 115.0,
            _ => 100.0,
        };
        let first = clamp(
            rpm * circumference * 60.0 / (first_target * fd * 1000.0),
            2.2,
            4.8,
        );
        let spacing = (first / top).powf(1.0 / (count - 1) as f64);
        let gears: Vec<f64> = (0..count)
            .map(|i| round(first / spacing.powi(i as i32), 2))
            .collect();
        let speed = rpm * circumference * 60.0 / (gears[count - 1] * fd * 1000.0);
        json!({"finalDrive":round(fd,2),"gears":gears,"tireCircumferenceM":round(circumference,3),"topSpeedAtPeakHpKmh":round(speed,1)})
    };
    let mut warnings=vec!["Experimental TuningMath: coefficients are calibration priors and require telemetry or in-game validation.","Spring calculations use a direct wheel-load approximation (MR=1.0 assumed); vehicle-specific suspension motion ratios and tire vertical stiffness are not yet calibrated.","Damping is resolved into explicit physical critical damping (N·s/m), damping-ratio priors, and advisory FH6 slider mappings.","FH6 slider increments and upgrade locks are not inferred from this calculation layer; verify against the selected part."];
    for (field, text) in [
        (
            "suspension",
            "Suspension is marked Fixed; spring, height, and damping outputs may not be editable.",
        ),
        (
            "arb",
            "Anti-roll bars are marked Fixed; ARB outputs may not be editable.",
        ),
        (
            "gearbox",
            "Gearbox is marked Fixed; gearing output is advisory only.",
        ),
        (
            "diff",
            "Differential is marked Fixed; differential output is advisory only.",
        ),
    ] {
        if car["adjustability"][field] == "Fixed" {
            warnings.push(text);
        }
    }
    Ok(
        json!({"schemaVersion":"tuning-dev/v1","inputSummary":{"raceGoal":goal,"surface":surface,"drivetrain":drive},"tire":tire,"chassis":chassis,"alignment":alignment,"gearing":gearing,"differential":differential,"warnings":warnings}),
    )
}
