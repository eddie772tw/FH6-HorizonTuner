import base64
import json

import pytest

from scripts.validate_tauri_updater_keypair import validate_signature_key_identity


def _minisign_payload(key_id: bytes) -> str:
    return base64.b64encode(b"Ed" + key_id + b"payload").decode("ascii")


def _write_config_and_signature(
    tmp_path, public_key_id: bytes, signature_key_id: bytes
):
    public_key = (
        "untrusted comment: minisign public key\n"
        + _minisign_payload(public_key_id)
        + "\n"
    )
    config_path = tmp_path / "tauri.conf.json"
    config_path.write_text(
        json.dumps(
            {
                "plugins": {
                    "updater": {
                        "pubkey": base64.b64encode(public_key.encode()).decode()
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    signature_path = tmp_path / "update.sig"
    signature = (
        "untrusted comment: signature from minisign secret key\n"
        + _minisign_payload(signature_key_id)
        + "\ntrusted comment: timestamp\n"
    )
    signature_path.write_text(
        base64.b64encode(signature.encode()).decode(),
        encoding="utf-8",
    )
    return config_path, signature_path


def test_accepts_signature_from_configured_updater_key(tmp_path):
    config_path, signature_path = _write_config_and_signature(
        tmp_path, b"12345678", b"12345678"
    )

    validate_signature_key_identity(config_path, signature_path)


def test_rejects_signature_from_a_rotated_key(tmp_path):
    config_path, signature_path = _write_config_and_signature(
        tmp_path, b"12345678", b"87654321"
    )

    with pytest.raises(ValueError, match="does not match"):
        validate_signature_key_identity(config_path, signature_path)
