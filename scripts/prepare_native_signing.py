"""Use production credentials, or an ephemeral OTA key for non-publishing CI."""

import argparse
import json
import os
import secrets
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()
    directory = Path(os.environ["RUNNER_TEMP"])
    key = directory / "fh6-native-test.key"
    config_file = directory / "fh6-native-build.json"
    if args.cleanup:
        for path in (key, Path(str(key) + ".pub"), config_file):
            path.unlink(missing_ok=True)
        return
    config = {
        "build": {
            "beforeBuildCommand": "node -e \"console.log('Using verified LAN frontend')\""
        }
    }
    if os.environ.get("RELEASE_SIGNING") == "true":
        if not os.environ.get("TAURI_SIGNING_PRIVATE_KEY", "").strip():
            raise ValueError("Production OTA signing key is required")
    else:
        password = secrets.token_hex(32)
        subprocess.run(
            [
                "pnpm",
                "--prefix",
                "frontend",
                "exec",
                "tauri",
                "signer",
                "generate",
                "--ci",
                "-p",
                password,
                "-w",
                str(key),
            ],
            check=True,
            capture_output=True,
        )
        config["plugins"] = {
            "updater": {"pubkey": Path(str(key) + ".pub").read_text().strip()}
        }
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
            env.write(
                f"TAURI_SIGNING_PRIVATE_KEY={key}\nTAURI_SIGNING_PRIVATE_KEY_PASSWORD={password}\n"
            )
    config_file.write_text(json.dumps(config), encoding="utf-8")


if __name__ == "__main__":
    main()
