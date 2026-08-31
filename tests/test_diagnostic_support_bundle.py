import io
import json
import zipfile
from datetime import UTC, datetime, timedelta, timezone

import main
import pytest
from diagnostic_support_bundle import (
    MAX_SECTION_BYTES,
    collect_recent_logs,
    create_support_bundle,
    redact_value,
)
from fastapi.testclient import TestClient


def read_bundle(bundle: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        return {name: archive.read(name).decode("utf-8") for name in archive.namelist()}


def test_support_bundle_redacts_sensitive_data_and_bounds_log_window(tmp_path):
    now = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)
    log_file = tmp_path / "backend.log"
    log_file.write_text(
        "2026-08-30 11:40:00,000 [INFO] main: old entry\n"
        "2026-08-30 11:55:00,000 [WARNING] main: C:\\Users\\Eddie\\secret.txt "
        "email eddie@example.test token=abc123\n"
        "2026-08-30 11:56:00,000 [ERROR] main: raw UDP payload: deadbeef\n",
        encoding="utf-8",
    )

    bundle = create_support_bundle(
        log_path=log_file,
        diagnostics={
            "telemetryPipeline": {
                "framesProcessed": 5,
                "rawUdpPayload": "deadbeef",
                "playerName": "Eddie",
            },
            "overlay": {"rendererMode": "optimized", "absolutePath": "C:\\temp"},
            "discordPresence": {"state": "available", "credential": "never-export"},
        },
        app_version="0.1.0",
        backend_version="11.45.15.0",
        window_minutes=10,
        now=now,
    )

    files = read_bundle(bundle)
    manifest = json.loads(files["manifest.json"])
    diagnostic_text = "\n".join(files.values())
    assert manifest["appVersion"] == "0.1.0"
    assert manifest["backendVersion"] == "11.45.15.0"
    assert manifest["settingsSchema"].startswith("settings/v1")
    assert manifest["windowMinutes"] == 10
    assert "old entry" not in files["recent-logs.txt"]
    assert "C:\\Users" not in diagnostic_text
    assert "eddie@example.test" not in diagnostic_text
    assert "abc123" not in diagnostic_text
    assert "deadbeef" not in diagnostic_text
    assert "playerName" not in diagnostic_text
    assert "rawUdpPayload" not in diagnostic_text
    assert "credential" not in files["diagnostics/discordPresence.json"]


@pytest.mark.parametrize(
    "sensitive_value",
    [
        "Authorization: Bearer first credential segment",
        'Proxy-Authorization=Basic "dXNlcjpwYXNz with more data"',
        "Bearer first second third",
        "C:\\Program Files\\FH6 Horizon Tuner\\backend.log",
        '"C:\\Users\\Eddie\\My Documents\\backend.log"',
        "/home/eddie/FH6 Horizon Tuner/backend.log",
        '"/var/lib/FH6 Horizon Tuner/backend.log"',
        r"\\support-host\FH6 Logs\backend.log",
    ],
)
def test_support_bundle_redaction_fails_closed_for_credentials_and_paths(
    sensitive_value,
):
    redacted = redact_value(sensitive_value)

    assert redacted.startswith("[redacted:")
    assert sensitive_value not in redacted


def test_recent_logs_interprets_local_timestamps_and_excludes_future_entries(tmp_path):
    utc = UTC
    local_timezone = timezone(timedelta(hours=8))
    generated_at = datetime(2026, 8, 30, 12, 0, tzinfo=utc)
    cutoff = generated_at - timedelta(minutes=10)
    log_file = tmp_path / "backend.log"
    log_file.write_text(
        "2026-08-30 19:49:59,999 [INFO] main: before cutoff\n"
        "2026-08-30 19:50:00,000 [INFO] main: included cutoff\n"
        "cutoff continuation\n"
        "2026-08-30 20:00:00,000 [INFO] main: included generated at\n"
        "2026-08-30 20:00:00,001 [INFO] main: future entry\n"
        "future continuation\n",
        encoding="utf-8",
    )

    logs = collect_recent_logs(
        log_file,
        cutoff,
        generated_at,
        log_timezone=local_timezone,
    )

    exported = "\n".join(logs)
    assert "before cutoff" not in exported
    assert "future entry" not in exported
    assert "future continuation" not in exported
    assert "included cutoff" in exported
    assert "cutoff continuation" in exported
    assert "included generated at" in exported


def test_support_bundle_rejects_unsafe_fields_and_oversized_sections(tmp_path):
    arguments = {
        "log_path": tmp_path / "missing.log",
        "diagnostics": {"telemetryPipeline": {"framesProcessed": 1}},
        "app_version": "app",
        "backend_version": "backend",
    }
    with pytest.raises(ValueError, match="not allowed"):
        create_support_bundle(
            **arguments,
            requested_fields=["telemetryPipeline", "rawUdpPayload"],
        )
    with pytest.raises(ValueError, match="size limit"):
        create_support_bundle(
            log_path=arguments["log_path"],
            diagnostics={"telemetryPipeline": {"detail": "x" * MAX_SECTION_BYTES}},
            app_version=arguments["app_version"],
            backend_version=arguments["backend_version"],
            requested_fields=["telemetryPipeline"],
        )


def test_support_bundle_api_is_a_no_store_zip_and_rejects_unsafe_fields(
    monkeypatch, tmp_path
):
    async def telemetry_snapshot():
        return {"framesProcessed": 2}

    async def overlay_snapshot():
        return {"renderMode": "optimized"}

    async def discord_snapshot():
        return {"state": "available"}

    monkeypatch.setattr(main, "backend_log_path", str(tmp_path / "backend.log"))
    monkeypatch.setattr(main, "get_telemetry_pipeline_metrics", telemetry_snapshot)
    monkeypatch.setattr(main, "get_overlay_performance_metrics", overlay_snapshot)
    monkeypatch.setattr(main, "get_discord_presence_status", discord_snapshot)
    client = TestClient(main.app)

    response = client.post("/api/diagnostics/support-bundle", json={"windowMinutes": 5})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert response.headers["cache-control"] == "no-store"
    assert "attachment" in response.headers["content-disposition"]

    rejected = client.post(
        "/api/diagnostics/support-bundle",
        json={"windowMinutes": 5, "fields": ["rawUdpPayload"]},
    )
    assert rejected.status_code == 400
    assert "not allowed" in rejected.json()["detail"]
