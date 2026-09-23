"""Non-publishing packages use a disposable key without persisting a password."""

from pathlib import Path

from scripts import prepare_native_signing


def test_native_test_signing_never_persists_password(tmp_path, monkeypatch):
    keys = []

    def generate(arguments, **kwargs):
        assert kwargs["check"] is True
        assert kwargs["capture_output"] is True
        assert arguments[arguments.index("-p") + 1] == ""
        key = Path(arguments[arguments.index("-w") + 1])
        key.with_suffix(".key.pub").write_text("test public key", encoding="utf-8")
        keys.append(key)

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
        assert env_file.read_text(encoding="utf-8") == (
            f"TAURI_SIGNING_PRIVATE_KEY={keys[-1]}\n"
        )

    assert len(keys) == 2
    assert keys[0] != keys[1]
