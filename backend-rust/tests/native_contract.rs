use fh6_backend::native::{default_audio_devices, media_fallback, NativeServices};
use serde_json::Value;

#[test]
fn audio_device_fallback_matches_python_contract() {
    let devices = default_audio_devices();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].id, "default");
    assert!(devices[0].is_default);
    assert_eq!(devices[0].name, "System Default Speaker / 系統預設輸出裝置");
}

#[test]
fn native_facade_returns_json_contracts_without_hardware() {
    let services = NativeServices::new();
    let devices = services.get_audio_devices();
    assert!(devices.is_array());
    assert_eq!(
        services.audio_spectrum()["spectrum"]
            .as_array()
            .unwrap()
            .len(),
        32
    );
    let media = services.system_media();
    for field in ["title", "artist", "has_media", "state", "source", "success"] {
        assert!(media.get(field).is_some(), "missing media field {field}");
    }
    let status = services.discord_status();
    assert!(status.is_object());
}

#[test]
fn setting_audio_device_is_bounded_and_rejects_empty_ids() {
    let services = NativeServices::new();
    assert!(services.set_audio_device(" ").is_err());
    let result = services.set_audio_device("speaker-id").unwrap();
    assert_eq!(result["success"], Value::Bool(true));
    assert_eq!(result["device_id"], Value::String("speaker-id".into()));
}

#[test]
fn media_fallback_has_all_overlay_fields() {
    let media = media_fallback();
    assert_eq!(media["title"], "Turbo Fire");
    assert_eq!(media["artist"], "TANTRON");
    assert_eq!(media["has_media"], false);
    assert_eq!(media["playback_controls"].as_object().unwrap().len(), 15);
}

#[test]
fn discord_accepts_local_configuration_and_reports_input_before_ipc() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("discord.local.json"),
        r#"{"discord_application_id":"123456789012345678"}"#,
    )
    .unwrap();
    let presence = fh6_backend::native::DiscordPresence::for_data_root(Some(root.path()));
    assert_eq!(presence.status()["configured"], true);
    presence.submit(serde_json::json!({"CarOrdinal":42,"IsRaceOn":1}));
    let status = presence.status();
    assert_eq!(status["state"], "waiting_for_discord");
    assert!(status["lastTelemetryAt"].as_f64().unwrap() > 0.0);
    assert_eq!(status["updatesSent"], 0);
}

#[test]
fn external_pcm_updates_spectrum_without_native_audio() {
    let services = NativeServices::new();
    let samples: Vec<f32> = (0..1024).map(|i| ((i as f32) * 0.1).sin() * 0.25).collect();
    services.update_audio_pcm(&samples);
    let spectrum = services.audio_spectrum();
    assert!(spectrum["sequence"].as_u64().unwrap() >= 1);
    assert_eq!(spectrum["source"], "external");
}

#[test]
fn pcm_and_redaction_match_python_reference() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/native.json")).unwrap();
    let services = NativeServices::new();
    for case in fixture["pcm"].as_array().unwrap() {
        let samples: Vec<f32> = case["samples"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_f64().unwrap() as f32)
            .collect();
        services.update_audio_pcm(&samples);
        let result = services.audio_spectrum();
        for (actual, expected) in result["spectrum"]
            .as_array()
            .unwrap()
            .iter()
            .zip(case["spectrum"].as_array().unwrap())
        {
            let expected = expected.as_f64().unwrap();
            let actual = actual.as_f64().unwrap();
            assert!(
                (actual - expected).abs() <= 0.00002 * expected.abs().max(1.0),
                "FFT {actual} vs {expected}"
            );
        }
        for (key, reference) in [("vu_left", "left"), ("vu_right", "right")] {
            assert!(
                (result[key].as_f64().unwrap() - case[reference].as_f64().unwrap()).abs() < 0.00001
            );
        }
    }
    for case in fixture["redaction"].as_array().unwrap() {
        assert_eq!(
            fh6_backend::diagnostics::redact(&case["input"]),
            case["expected"]
        );
    }
}
