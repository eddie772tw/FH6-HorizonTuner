#[tokio::main]
async fn main() {
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
