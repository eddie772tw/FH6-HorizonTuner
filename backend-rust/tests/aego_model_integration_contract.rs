use fh6_backend::tuning::{aego_model::AegoModel, gearing::models, ratio_balance, TuningCarParams};
use serde_json::{json, Value};

#[test]
fn ratio_balance_cannot_relax_the_models_observed_hardware_locks() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/aego_rally_joint_v1.json"
    ))
    .unwrap();
    let mut profile = fixture["inputs"]["carParams"].clone();
    profile["adjustability"] = json!({"gearbox":"Full","gears":6});
    let locked = [2.70, 2.18, 1.76, 1.43, 1.15, 0.93];
    profile["rallyObservedBounds"] = json!({"source":"user-observed","finalDrive":{"min":3.52,"max":3.52,"step":0.01},
        "gears":locked.map(|gear|json!({"min":gear,"max":gear,"step":0.01}))});
    let params: TuningCarParams = serde_json::from_value(profile.clone()).unwrap();
    let base = models::solve(AegoModel::RallyJointV1, 6, &params, 7500.0, None);
    assert_ne!(base.gearing.unsupported, Some(true));
    assert_eq!(base.gearing.final_drive, 3.52);
    assert_eq!(base.gearing.gears, locked);
    let raw = json!({"schemaVersion":"ratio-balance/v1","candidateFinalDrive":3.53,
        "bounds":{"source":"user-observed","finalDrive":{"min":1.0,"max":10.0,"step":0.01},
        "gears":vec![json!({"min":0.01,"max":20.0,"step":0.01});6]}});
    let adjusted = ratio_balance::calculate(&profile, Some(&base.gearing), &raw)
        .0
        .unwrap();
    // The old endpoint-only policy accepts this rounded equivalent allocation.
    assert!(fh6_backend::tuning::gearing::rally::respects_hard_targets(
        &adjusted,
        &base.diagnostics
    ));
    assert_ne!(adjusted.final_drive, base.gearing.final_drive);
    // Profile observations remain hard constraints even when the new balance request is broad.
    assert!(!models::respects_hard_targets(
        AegoModel::RallyJointV1,
        &adjusted,
        &base.diagnostics
    ));
    let (denied, diagnostic) =
        ratio_balance::calculate_checked(&profile, Some(&base.gearing), &raw, |g| {
            models::respects_hard_targets(AegoModel::RallyJointV1, g, &base.diagnostics)
        });
    assert!(denied.is_none());
    assert_eq!(diagnostic.legal_final_drives, vec![3.52]);
    assert!(diagnostic
        .reason
        .unwrap()
        .contains("observed profile bounds"));

    // 1. models::adjusted_diagnostics must match respects_hard_targets on Rally/Drag lock rejection
    let r_rej = models::adjusted_diagnostics(AegoModel::RallyJointV1, &adjusted, &base.diagnostics);
    assert_eq!(r_rej["status"], "unavailable");
    assert!(r_rej["reason"]
        .as_str()
        .unwrap()
        .contains("observed profile bounds"));
    assert!(["actualSpeedKmh", "endpointErrorKmh", "actualTotalRatio"]
        .iter()
        .all(|k| r_rej[k].is_null()));

    // 2. Drag lock rejection also clears finish availability & actual telemetry predictions
    let drag_raw: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/aego_drag_joint_v1.json")).unwrap();
    let mut dp = drag_raw["carParams"].clone();
    dp["dragFinishSpeedKmh"] = json!(250.0);
    dp["dragFinishSpeedProvenance"] = json!("manual");
    let solve = |p: &Value| {
        models::solve(
            AegoModel::DragJointV1,
            6,
            &serde_json::from_value(p.clone()).unwrap(),
            7500.0,
            None,
        )
    };
    let init = solve(&dp);
    let fd = init.gearing.final_drive;
    dp["dragObservedBounds"] = json!({"source":"user-observed","finalDrive":{"min":fd,"max":fd,"step":0.01},"gears":init.gearing.gears.iter().map(|g| json!({"min":g,"max":g,"step":0.01})).collect::<Vec<_>>()});
    let drag_base = solve(&dp);
    let mut drag_out = drag_base.gearing.clone();
    drag_out.final_drive = ((fd + 0.01) * 100.0).round() / 100.0;
    assert!(!models::respects_hard_targets(
        AegoModel::DragJointV1,
        &drag_out,
        &drag_base.diagnostics
    ));
    let d_rej =
        models::adjusted_diagnostics(AegoModel::DragJointV1, &drag_out, &drag_base.diagnostics);
    assert_eq!(d_rej["status"], "unavailable");
    assert_eq!(d_rej["dragFinishAvailability"]["status"], "unavailable");
    assert!(d_rej["dragFinishAvailability"]["actualKmh"].is_null());
    assert!(
        ["actualSpeedKmh", "actualLaunchSpeedKmh", "endpointErrorKmh"]
            .iter()
            .all(|k| d_rej[k].is_null())
    );

    // 3. Reject malformed observedBounds (sub-0.01, non-grid, >10000 tick span)
    for bad_fd in [
        json!({"min":1e-10,"max":4.0,"step":0.01}),
        json!({"min":3.511,"max":3.529,"step":0.01}),
        json!({"min":0.01,"max":150.0,"step":0.01}),
    ] {
        let mut tampered = base.diagnostics.clone();
        tampered["observedBounds"]["finalDrive"] = bad_fd;
        assert!(!models::respects_hard_targets(
            AegoModel::RallyJointV1,
            &base.gearing,
            &tampered
        ));
    }
}
