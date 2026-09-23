"""Non-publishing native packages use unique, throwaway signing credentials."""

from pathlib import Path

from scripts import prepare_native_signing


def test_native_test_signing_uses_unique_passwords(tmp_path, monkeypatch):
    credentials = []

    def generate(arguments, **kwargs):
        assert kwargs["check"] is True
        assert kwargs["capture_output"] is True
        password = arguments[arguments.index("-p") + 1]
        key = Path(arguments[arguments.index("-w") + 1])
        key.with_suffix(".key.pub").write_text("test public key", encoding="utf-8")
        credentials.append(password)

    monkeypatch.setattr(prepare_native_signing.subprocess, "run", generate)
    monkeypatch.delenv("RELEASE_SIGNING", raising=False)
    monkeypatch.setattr("sys.argv", ["prepare_native_signing.py"])

    for run in ("first", "second"):
        directory = tmp_path / run
        directory.mkdir()
        env_file = directory / "github-env"
        monkeypatch.setenv("RUNNER_TEMP", str(directory))
        monkeypatch.setenv("GITHUB_ENV", str(env_file))
        prepare_native_signing.main()
        assert (
            f"TAURI_SIGNING_PRIVATE_KEY_PASSWORD={credentials[-1]}"
            in env_file.read_text(encoding="utf-8")
        )

    assert len(credentials) == 2
    assert credentials[0] != credentials[1]
    assert all(len(value) == 64 and int(value, 16) >= 0 for value in credentials)
