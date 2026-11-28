use fh6_backend::{motec, road};
use serde_json::{json, Value};

#[test]
fn debrief_lap_completion_parity_with_summarize_laps_and_regression_edges() {
    let points = vec![
        Value::Null,
        json!(17),
        json!({"LapNumber": -1, "CurrentLap": 0.1, "LastLap": 99.0}),
        json!({"LapNumber": 1.5, "CurrentLap": 0.1, "LastLap": 88.0}),
        json!({"LapNumber": 0, "CurrentLap": 0.8, "TireTemp": ["bad", 212.0]}),
        json!({"LapNumber": 1, "CurrentLap": 0.2, "LastLap": 61.0}),
        json!({"LapNumber": 2, "CurrentLap": 0.6, "LastLap": 0.0}),
        json!({"LapNumber": 2, "CurrentLap": 1.2, "LastLap": 62.5}),
        json!({"LapNumber": 2, "CurrentLap": 2.0, "LastLap": 63.0}),
        json!({"LapNumber": 3, "CurrentLap": 0.1, "LastLap": 63.0}),
        json!({"LapNumber": 5, "CurrentLap": 0.1, "LastLap": 64.0}),
        json!({"LapNumber": 5, "LastLap": 64.0, "extra": 1}),
        // Lap regression stops lap counting, while thermal/suspension/handling continue.
        json!({"LapNumber": 1, "CurrentLap": 0.1, "LastLap": 59.0}),
        json!({"LapNumber": 2, "CurrentLap": 0.1, "LastLap": 58.0, "TireTemp": [null, 212.0], "SuspTravel": [0.96], "extra": 2}),
        json!({"AccelerationX": -3.0, "SpeedMetersPerSecond": 15.0, "TireSlipAngle": [0.4, null, 0.1]}),
    ];
    let mut projected = points.clone();
    for p in &mut projected {
        if let Some(m) = p.as_object_mut() {
            m.remove("extra");
        }
    }
    let laps = road::summarize_laps(&points)
        .iter()
        .filter(|l| l["complete"] == true)
        .count();
    let out = motec::debrief(&points);
    assert_eq!((laps, &out), (1, &motec::debrief(&projected)));
    assert_eq!(
        out,
        json!({
            "total_samples": points.len(), "valid_laps": 1,
            "tire_thermals": {"fl_avg": null, "fr_avg": 100.0, "rl_avg": null, "rr_avg": null, "status": "Optimal"},
            "suspension": {"peak_travel_pct": 96.0, "bottom_out_count": 1, "status": "Occasional Bottoming"},
            "handling_balance": {"understeer_pct": 100.0, "oversteer_pct": 0.0, "tendency": "Understeer Biased"}
        })
    );
}

#[test]
fn debrief_handles_negative_suspension_thresholds_and_thermal_bands() {
    let cold = motec::debrief(&[json!({"TireTemp": [140.0], "SuspTravel": [-0.25, -0.1]})]);
    assert_eq!(cold["tire_thermals"]["status"], "Cold");
    assert_eq!(
        cold["suspension"],
        json!({"peak_travel_pct": -10.0, "bottom_out_count": 0, "status": "Optimal"})
    );

    let mut severe: Vec<Value> = (0..11)
        .map(|_| json!({"TireTemp": [230.0], "SuspTravel": [0.95], "AccelerationX": 3.5, "SpeedMetersPerSecond": 12.0, "TireSlipAngle": [0.1, 0.1, 0.5, 0.5]}))
        .collect();
    severe.push(json!({"TireTemp": [f64::INFINITY], "SuspTravel": [f64::NAN], "AccelerationX": 3.5, "SpeedMetersPerSecond": 12.0, "TireSlipAngle": [0.2, 0.2, 0.2, 0.2]}));
    let out = motec::debrief(&severe);
    assert_eq!(out["tire_thermals"]["fl_avg"], 110.0);
    assert_eq!(out["tire_thermals"]["status"], "Overheating");
    assert_eq!(
        out["suspension"],
        json!({"peak_travel_pct": 95.0, "bottom_out_count": 11, "status": "Severe Bottoming"})
    );
    assert_eq!(
        out["handling_balance"],
        json!({"understeer_pct": 0.0, "oversteer_pct": 91.7, "tendency": "Oversteer Biased"})
    );

    let bal = motec::debrief(&[
        json!({"AccelerationX": 3.0, "SpeedMetersPerSecond": 10.0, "TireSlipAngle": [0.2, 0.2, 0.2, 0.2]}),
    ]);
    assert_eq!(bal["handling_balance"]["tendency"], "Neutral / Balanced");
}
