use fh6_backend::tuning::{ratio_balance::calculate, GearingResult};
use serde_json::{json, Value};

fn base(fd: f64, gears: &[f64]) -> GearingResult {
    GearingResult {
        final_drive: fd,
        gears: gears.to_vec(),
        unsupported: None,
        unsupported_reason: None,
    }
}
fn profile() -> Value {
    json!({"adjustability":{"gearbox":"Full"}})
}
fn request(count: usize, fd: Option<f64>) -> Value {
    json!({"schemaVersion":"ratio-balance/v1","candidateFinalDrive":fd,
        "bounds":{"source":"user-observed","finalDrive":{"min":2.0,"max":6.1,"step":0.01},
        "gears":vec![json!({"min":0.4,"max":6.0,"step":0.01});count]}})
}
#[test]
fn observed_grid_excludes_overflow_and_collapsed_gears_without_clamping() {
    let original = base(4.0, &[4.22, 3.0, 2.0, 1.0]);
    let (result, diagnostic) = calculate(&profile(), Some(&original), &request(4, Some(2.8)));
    assert!(result.is_none());
    assert_eq!(diagnostic.status, "unavailable");
    assert!(!diagnostic.legal_final_drives.contains(&2.8));
    assert!(diagnostic.legal_final_drives.contains(&2.82));
    let collapsed = base(3.0, &[3.0, 2.0, 1.02, 1.01]);
    let (result, diagnostic) = calculate(&profile(), Some(&collapsed), &request(4, Some(6.0)));
    assert!(result.is_none());
    assert!(!diagnostic.legal_final_drives.contains(&6.0));
}
#[test]
fn one_cent_steps_and_every_legal_candidate_preserve_original_products_with_bounded_rounding() {
    let original = base(3.5, &[4.0, 3.0, 2.0, 1.0]);
    let (_, diagnostic) = calculate(&profile(), Some(&original), &request(4, None));
    assert!(diagnostic.legal_final_drives.contains(&3.51));
    for fd in diagnostic.legal_final_drives {
        let (result, diagnostic) = calculate(&profile(), Some(&original), &request(4, Some(fd)));
        let result = result.unwrap();
        assert_eq!(result.final_drive, fd);
        assert!(result.gears.windows(2).all(|g| g[0] > g[1]));
        for (i, ratio) in result.gears.iter().enumerate() {
            assert!((0.4..=6.0).contains(ratio));
            let error = fd * ratio - original.final_drive * original.gears[i];
            assert!((error - diagnostic.total_ratio_errors[i]).abs() < 1e-12);
            assert!(error.abs() <= diagnostic.total_ratio_tolerance[i] + 1e-9);
        }
    }
    // Reset and repeated targets use the same immutable base, not the last rounded output.
    for fd in [3.51, 4.21, 3.51] {
        let result = calculate(&profile(), Some(&original), &request(4, Some(fd)))
            .0
            .unwrap();
        assert_eq!(result.gears[0], (14.0 / fd * 100.0).round() / 100.0);
    }
    assert_eq!(
        calculate(&profile(), Some(&original), &request(4, None)).0,
        Some(original)
    );
}
#[test]
fn explicit_capability_bounds_and_request_version_are_required() {
    let original = base(3.5, &[4.0, 3.0, 2.0, 1.0]);
    for p in [
        json!({"transmission":{"type":"cvt"},"adjustability":{"gearbox":"Full"}}),
        json!({}),
        json!({"adjustability":{"gearbox":"Fixed"}}),
        json!({"adjustability":{"gearbox":"FinalDrive"}}),
        json!({"isElectric":true,"adjustability":{"gearbox":"Full"}}),
    ] {
        assert!(calculate(&p, Some(&original), &request(4, None))
            .0
            .is_none());
    }
    for (path, value) in [
        ("/bounds/source", json!("default")),
        ("/bounds/finalDrive/step", json!(0.1)),
        ("/bounds/finalDrive/min", json!(2.001)),
        ("/bounds/finalDrive/max", json!(1000)),
        ("/schemaVersion", json!("future")),
        ("/candidateFinalDrive", json!(3.501)),
    ] {
        let mut r = request(4, None);
        *r.pointer_mut(path).unwrap() = value;
        assert!(
            calculate(&profile(), Some(&original), &r).0.is_none(),
            "{path}"
        );
    }
    let mut forged = request(4, None);
    forged["base"] = json!({"finalDrive":1,"gears":[1,1,1,1]});
    assert!(calculate(&profile(), Some(&original), &forged).0.is_none());
    assert!(calculate(&profile(), None, &request(4, None)).0.is_none());
    assert!(calculate(&profile(), Some(&original), &request(5, None))
        .0
        .is_none());
}
