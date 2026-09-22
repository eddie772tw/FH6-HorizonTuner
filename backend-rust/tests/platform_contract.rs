#[cfg(not(feature = "hud"))]
use fh6_backend::assets;
use fh6_backend::platform;

#[test]
fn binding_reports_only_actual_receiver_addresses() {
    let binding = platform::TelemetryBinding::from_addresses(vec![
        "127.0.0.1:8010".parse().unwrap(),
        "192.168.1.9:8010".parse().unwrap(),
    ]);
    assert_eq!(binding.port, Some(8010));
    assert_eq!(binding.listen_addresses, ["127.0.0.1", "192.168.1.9"]);
    assert_eq!(platform::TelemetryBinding::default().port, None);
}

#[test]
#[cfg(not(feature = "hud"))]
fn lan_backend_has_no_embedded_hud_or_audio_workers() {
    use fh6_backend::native::NativeServices;
    assert!(!platform::capabilities().hud_overlay);
    assert!(!platform::capabilities().audio_spectrum);
    assert!(!platform::capabilities().system_media);
    assert!(!assets::EMBEDDED
        .iter()
        .any(|(name, _)| name.starts_with("hud/")));
    assert!(assets::json("car_database.json").is_some());
    let native = NativeServices::new();
    assert_eq!(native.get_audio_devices(), serde_json::json!([]));
    assert!(native.set_audio_device("default").is_err());
    assert_eq!(native.audio_spectrum()["state"], "unsupported");
    assert_eq!(native.system_media()["state"], "unsupported");
    assert!(native.discord_status().is_object());
    native.stop_audio_spectrum();
}
