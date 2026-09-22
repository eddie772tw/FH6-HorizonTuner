#[tokio::main]
async fn main() {
    if std::env::args().any(|arg| arg == "--build-info") {
        println!(
            "{}",
            serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "hudEnabled": fh6_backend::platform::HUD_ENABLED,
                "embeddedHudFiles": fh6_backend::assets::EMBEDDED.iter().filter(|(key, _)| key.starts_with("hud/")).count(),
            })
        );
        return;
    }
    if std::env::args().any(|arg| arg == "--version") {
        println!("fh6-backend {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let result = match fh6_backend::runtime::Options::parse() {
        Ok(options) => fh6_backend::runtime::run(options).await,
        Err(error) => Err(error),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
