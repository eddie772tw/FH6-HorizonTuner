use fh6_backend::tuning::{
    chassis_load::{self, calculate, resolve_aero},
    profile,
    workflow::{calculate_workflow, WorkflowRequest},
    RaceGoal, TuningCarParams,
};
use serde_json::{json, Value};

fn profile_value() -> Value {
    json!({"weight":1525.4329544320565,"weight_distribution":56,"drivetrain":"AWD","aeroInputVersion":"optional/v1","spring_front_min":3.110858718440499,"spring_front_max":15.556079389400223,"spring_rear_min":5.134166943465233,"spring_rear_max":15.556079389400223,"height_front_min":16.51003302006604,"height_front_max":20.32004064008128,"height_rear_min":17.526035052070107,"height_rear_max":20.82804165608331,"adjustability":{"suspension":"Race","arb":"Adjustable","aero":"Fixed","diff":"Adjustable","gearbox":"Full","gears":6}})
}
fn params(v: Value) -> TuningCarParams {
    serde_json::from_value(v).unwrap()
}
fn workflow(profile: Value, version: &str) -> Value {
    let input: WorkflowRequest=serde_json::from_value(json!({"schemaVersion":version,"goal":"Road","season":"Summer","profile":profile,"engine":null,"ev":null,"inputSnapshot":{"carId":"1060"}})).unwrap();
    serde_json::to_value(calculate_workflow(input).unwrap()).unwrap()
}
fn pair(v: &chassis_load::Calculation) -> [f64; 2] {
    [v.values.springs.front, v.values.springs.rear]
}

#[test]
fn measured_vehicle_baselines_need_only_road_or_rally() {
    // Source: docs/tuning/chassis-existing-vehicles-validation-20261011.md.
    // Expected candidates were evaluated before implementation; not game-performance claims.
    for (mass, w, drive, lo, hi, goal, cross, expected) in [
        (
            1525.4329544320565,
            56.0,
            "AWD",
            [3.110858718440499, 5.134166943465233],
            [15.556079389400223; 2],
            RaceGoal::Rally,
            true,
            [10.8, 8.5],
        ),
        (
            801.952263882211,
            42.0,
            "RWD",
            [3.2751520606313864; 2],
            [16.379331897552387; 2],
            RaceGoal::Road,
            false,
            [8.8, 10.9],
        ),
        (
            1858.8237428672517,
            51.0,
            "RWD",
            [7.582494901549001; 2],
            [37.90890291334955; 2],
            RaceGoal::Road,
            false,
            [23.0, 22.4],
        ),
        (
            1673.7578358175106,
            43.0,
            "AWD",
            [6.830674281305918, 6.827102686910464],
            [34.13551343455232; 2],
            RaceGoal::Road,
            false,
            [18.6, 22.4],
        ),
        (
            1651.0781903457287,
            53.0,
            "AWD",
            [3.3680135149131925, 4.3769889316289685],
            [16.838281777368234; 2],
            RaceGoal::Rally,
            false,
            [8.9, 7.9],
        ),
        (
            1575.3281744699768,
            50.0,
            "RWD",
            [6.4252983174218805; 2],
            [32.13006318150486; 2],
            RaceGoal::Road,
            false,
            [19.3, 19.3],
        ),
        (
            1172.084077981693,
            52.0,
            "AWD",
            [3.621596716990432, 4.135906309935819],
            [23.908252883169574; 2],
            RaceGoal::Rally,
            false,
            [11.3, 10.5],
        ),
    ] {
        let p = params(
            json!({"weight":mass,"weight_distribution":w,"drivetrain":drive,"spring_front_min":lo[0],"spring_rear_min":lo[1],"spring_front_max":hi[0],"spring_rear_max":hi[1],"rallyProfile":if cross{"cross-country"}else{"mixed-surface"}}),
        );
        let result = calculate(goal, &p);
        assert!(result.available);
        assert_eq!(pair(&result), expected);
        assert!(result.diagnostics["axles"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["baseLimited"] == false));
    }
}

#[test]
fn optional_loads_and_explicit_balance_are_equivalent_across_capabilities() {
    for goal in [RaceGoal::Road, RaceGoal::Rally] {
        let mut p = profile_value();
        assert_eq!(resolve_aero(&params(p.clone())).source, "omitted");
        p["aero_downforce_front"] = json!(100);
        p["aero_downforce_rear"] = json!(150);
        p["aeroBalance"] = json!(0.99); // ignored when both axles supplied
        let expected = calculate(goal, &params(p.clone()));
        assert_eq!(
            pair(&expected),
            if goal == RaceGoal::Road {
                [11.3, 11.9]
            } else {
                [10.2, 8.7]
            }
        );
        assert_eq!(
            [
                expected.values.damping.rebound_f,
                expected.values.damping.rebound_r
            ],
            if goal == RaceGoal::Road {
                [12.3, 10.4]
            } else {
                [10.2, 7.4]
            }
        );
        for capability in ["Fixed", "Front Only", "Rear Only", "Adjustable"] {
            p["adjustability"]["aero"] = json!(capability);
            p["aeroBalance"] = json!(0.4);
            for absent in ["aero_downforce_front", "aero_downforce_rear"] {
                let mut one = p.clone();
                one[absent] = Value::Null;
                let result = calculate(goal, &params(one));
                assert_eq!(result.values, expected.values);
                assert!(result.available);
            }
        }
    }
}

#[test]
fn aero_zero_endpoints_invalid_values_and_overflow_are_explicit() {
    let mut p = params(profile_value());
    p.aero_downforce_front = Some(0.0);
    assert_eq!(resolve_aero(&p).reason, Some("aero-balance-required"));
    p.aero_balance = Some(0.5);
    assert_eq!(resolve_aero(&p).rear, Some(0.0));
    p.aero_balance = Some(f64::from_bits(1));
    assert_eq!(resolve_aero(&p).rear, Some(0.0));
    p.aero_balance = Some(0.0);
    assert_eq!(resolve_aero(&p).reason, Some("aero-balance-not-solvable"));
    p.aero_balance = Some(1.0);
    assert_eq!(resolve_aero(&p).rear, Some(0.0));
    p.aero_downforce_front = None;
    p.aero_downforce_rear = Some(100.0);
    p.aero_balance = Some(0.0);
    assert_eq!(resolve_aero(&p).front, Some(0.0));
    p.aero_balance = Some(1.0);
    assert_eq!(resolve_aero(&p).reason, Some("aero-balance-not-solvable"));
    for invalid in [-0.01, 1.01, f64::NAN, f64::INFINITY] {
        p.aero_balance = Some(invalid);
        assert_eq!(resolve_aero(&p).reason, Some("invalid-aero-balance"));
    }
    for invalid in [-1.0, f64::NAN, f64::INFINITY] {
        p.aero_downforce_rear = Some(invalid);
        assert_eq!(resolve_aero(&p).reason, Some("invalid-downforce"));
    }
    p.aero_downforce_rear = Some(f64::MAX);
    p.aero_balance = Some(0.9);
    assert_eq!(resolve_aero(&p).reason, Some("aero-overflow"));
    p.aero_downforce_front = Some(0.0);
    p.aero_downforce_rear = Some(0.0);
    assert_eq!(resolve_aero(&p).source, "provided");
}

#[test]
fn legacy_drafts_never_promote_auto_or_default_balance_into_evidence() {
    let legacy = json!({"aero_downforce_front":100,"aero_downforce_rear":0,"aeroBalance":0.5,"rallyProfile":"cross-country"});
    let normalized = profile::normalize(&legacy);
    assert_eq!(normalized["aero_downforce_front"], 100);
    assert!(normalized["aero_downforce_rear"].is_null());
    assert!(normalized["aeroBalance"].is_null());
    assert_eq!(normalized["rallyProfile"], "cross-country");
    assert_eq!(
        resolve_aero(&params(legacy.clone())).reason,
        Some("aero-balance-required")
    );
    assert_eq!(
        resolve_aero(&params(normalized.clone())).reason,
        Some("aero-balance-required")
    );
    let explicit = json!({"aeroInputVersion":"optional/v1","aero_downforce_front":0,"aero_downforce_rear":null,"aeroBalance":0.4});
    let once = profile::normalize(&explicit);
    assert_eq!(once["aero_downforce_front"], 0);
    assert_eq!(profile::normalize(&once), once);
    assert_eq!(legacy["aero_downforce_rear"], 0);
    assert!(profile::normalize(&json!({}))["spring_front_min"].is_null());
}

#[test]
fn unavailable_correction_is_not_returned_or_applied_as_a_complete_chassis() {
    let mut p = profile_value();
    p["aero_downforce_front"] = json!(100);
    let result = workflow(p.clone(), "tuning-workflow-result/v2");
    assert!(result["chassis"].is_null());
    assert_eq!(
        result["chassisDiagnostics"]["aero"]["reason"],
        "aero-balance-required"
    );
    for f in result["baselinePreview"]["fields"].as_array().unwrap() {
        if ["spring.", "rebound.", "bump."]
            .iter()
            .any(|k| f["key"].as_str().unwrap().starts_with(k))
        {
            assert!(f["recommended"].is_null());
        }
    }
    assert!(result["baselinePreview"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["key"] == "height.front" && f["status"] == "available"));
    p["aero_downforce_front"] = Value::Null;
    assert_eq!(
        workflow(p.clone(), "tuning-workflow-result/v2")["chassis"]["springs"]["front"],
        10.1
    );
    for (key, value) in [
        ("weight", json!(0)),
        ("weight_distribution", json!(100)),
        ("spring_front_min", Value::Null),
        ("spring_rear_max", json!(1)),
    ] {
        let mut invalid = p.clone();
        invalid[key] = value;
        assert!(workflow(invalid, "tuning-workflow-result/v2")["chassis"].is_null());
    }
}

#[test]
fn legacy_schema_and_non_target_modes_keep_old_numbers() {
    let p = profile_value();
    let old = workflow(p.clone(), "tuning-workflow-result/v1");
    assert_eq!(old["chassis"]["springs"]["front"], 15.5);
    assert!(old.get("chassisDiagnostics").is_none());
    for goal in [RaceGoal::Drift, RaceGoal::Drag, RaceGoal::DangerSign] {
        let p = params(p.clone());
        let result = calculate(goal, &p);
        assert_eq!(
            result.values,
            fh6_backend::tuning::calculate_chassis_tuning(goal, &p)
        );
        assert_eq!(
            result.diagnostics["modelVersion"],
            chassis_load::LEGACY_MODEL
        );
    }
}

#[test]
fn bounds_saturation_fwd_and_rally_asymmetry_have_observable_diagnostics() {
    let mut p = params(profile_value());
    p.spring_front_min = Some(3.11);
    p.spring_front_max = Some(3.11);
    p.spring_rear_min = Some(5.17);
    p.spring_rear_max = Some(5.19);
    p.aero_downforce_front = Some(1e6);
    p.aero_downforce_rear = Some(1e6);
    let result = calculate(RaceGoal::Road, &p);
    assert_eq!(pair(&result), [3.11, 5.19]);
    assert_eq!(result.diagnostics["axles"][0]["aeroLimited"], true);
    p.aero_downforce_front = Some(1e7);
    p.aero_downforce_rear = Some(1e7);
    assert_eq!(
        calculate(RaceGoal::Road, &p).values.damping,
        result.values.damping
    );
    let mut p = params(profile_value());
    p.drivetrain = Some("FWD".into());
    let result = calculate(RaceGoal::Road, &p);
    assert_eq!(pair(&result), [8.8, 10.8]);
    let p = params(
        json!({"weight":1400,"weight_distribution":70,"spring_front_min":3,"spring_front_max":10,"spring_rear_min":8,"spring_rear_max":12}),
    );
    let result = calculate(RaceGoal::Rally, &p);
    assert_eq!(result.diagnostics["axles"][0]["baseLimited"], true);
    assert_eq!(result.diagnostics["axles"][1]["baseLimited"], true);
    assert_eq!(pair(&result), [10.0, 8.0]);
}

#[test]
fn increasing_load_is_monotone_and_does_not_change_independent_fields() {
    for goal in [RaceGoal::Road, RaceGoal::Rally] {
        for mass in [500.0, 1500.0, 3000.0] {
            for distribution in [20.0, 50.0, 80.0] {
                let mut p = params(profile_value());
                p.weight = Some(mass);
                p.weight_distribution = Some(distribution);
                let base = calculate(goal, &p);
                let mut previous = base.values.clone();
                for fraction in [0.0, 0.1, 0.5, 1.0, 5.0] {
                    p.aero_downforce_front = Some(mass * distribution / 100.0 * fraction);
                    p.aero_downforce_rear = Some(mass * (1.0 - distribution / 100.0) * fraction);
                    let result = calculate(goal, &p);
                    assert!(result.available);
                    for (spring, prior, min, max) in [
                        (
                            result.values.springs.front,
                            previous.springs.front,
                            p.spring_front_min.unwrap(),
                            p.spring_front_max.unwrap(),
                        ),
                        (
                            result.values.springs.rear,
                            previous.springs.rear,
                            p.spring_rear_min.unwrap(),
                            p.spring_rear_max.unwrap(),
                        ),
                    ] {
                        assert!(spring >= prior && spring >= min && spring <= max);
                    }
                    assert!(result.values.damping.rebound_f >= previous.damping.rebound_f);
                    assert!(result.values.damping.rebound_r >= previous.damping.rebound_r);
                    assert_eq!(result.values.arb, base.values.arb);
                    assert_eq!(result.values.diff, base.values.diff);
                    assert_eq!(result.values.springs.height_f, base.values.springs.height_f);
                    previous = result.values;
                }
            }
        }
    }
}
