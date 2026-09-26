fn main() {
    std::process::exit(fh6_backend::agent_cli::main(
        std::env::args().skip(1).collect(),
    ));
}
