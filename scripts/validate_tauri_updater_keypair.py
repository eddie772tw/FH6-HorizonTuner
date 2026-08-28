"""Validate that a Tauri updater signature was produced by the configured key."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path


def _minisign_key_id(encoded: str, label: str) -> bytes:
    """Return the minisign key id from a public key or signature payload."""
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise ValueError(f"{label} is not valid base64") from exc

    if len(decoded) < 10:
        raise ValueError(f"{label} is too short to contain a minisign key id")
    if decoded[:2] not in (b"Ed", b"ED"):
        raise ValueError(f"{label} is not an Ed25519 minisign payload")
    return decoded[2:10]


def _payload_line(text: str, label: str) -> str:
    for line in text.splitlines():
        line = line.lstrip("\ufeff").strip()
        if line and not line.startswith(("untrusted comment:", "trusted comment:")):
            return line
    raise ValueError(f"{label} does not contain a minisign payload")


def validate_signature_key_identity(
    config_path: str | Path, signature_path: str | Path
) -> None:
    """Raise when the generated signature key differs from Tauri's configured pubkey.

    This verifies the minisign key identifier, which lets the release workflow
    fail safely before an artifact signed by a different key is published.
    """
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    try:
        configured_pubkey = config["plugins"]["updater"]["pubkey"]
    except KeyError as exc:
        raise ValueError(
            "Tauri updater public key is missing from configuration"
        ) from exc
    if not isinstance(configured_pubkey, str) or not configured_pubkey.strip():
        raise ValueError("Tauri updater public key is empty")

    public_key_text = base64.b64decode(configured_pubkey, validate=True).decode("utf-8")
    public_key_id = _minisign_key_id(
        _payload_line(public_key_text, "public key"), "public key"
    )
    signature_file = Path(signature_path).read_text(encoding="utf-8").strip()
    try:
        signature_text = base64.b64decode(signature_file, validate=True).decode("utf-8")
    except (UnicodeDecodeError, ValueError) as exc:
        raise ValueError(
            "Tauri updater signature is not a valid minisign envelope"
        ) from exc
    signature_key_id = _minisign_key_id(
        _payload_line(signature_text, "signature"), "signature"
    )

    if public_key_id != signature_key_id:
        raise ValueError(
            "Generated updater signature does not match the public key embedded in tauri.conf.json"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a Tauri updater signature against the configured public key"
    )
    parser.add_argument("--config", required=True, help="Path to tauri.conf.json")
    parser.add_argument(
        "--signature", required=True, help="Path to generated .sig file"
    )
    args = parser.parse_args()
    validate_signature_key_identity(args.config, args.signature)
    print("Tauri updater signature key identity matches the configured public key.")


if __name__ == "__main__":
    main()
