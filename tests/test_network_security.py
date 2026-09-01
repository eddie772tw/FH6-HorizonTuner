"""Tests for Network Security: WebSocket Origin Verification, CSWSH Protection, and CORS Preflight."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.main import app, is_allowed_origin


def test_is_allowed_origin_logic():
    """Verify origin parsing and whitelisting logic."""
    assert is_allowed_origin(None) is True
    assert is_allowed_origin("") is True
    assert is_allowed_origin("http://localhost:1420") is True
    assert is_allowed_origin("http://127.0.0.1:8001") is True
    assert is_allowed_origin("http://tauri.localhost") is True
    assert is_allowed_origin("https://tauri.localhost") is True
    assert is_allowed_origin("tauri://localhost") is True
    assert is_allowed_origin("http://testserver") is True

    # Untrusted / External origins
    assert is_allowed_origin("http://malicious-site.com") is False
    assert is_allowed_origin("https://attacker.io") is False
    assert is_allowed_origin("http://evil.localhost.com") is False


def test_websocket_telemetry_allowed_origin():
    """Verify WebSocket connection succeeds with allowed origin."""
    client = TestClient(app)
    with client.websocket_connect(
        "/ws/telemetry", headers={"origin": "http://localhost:1420"}
    ) as ws:
        # Connection established successfully
        assert ws is not None


def test_websocket_telemetry_rejected_origin():
    """Verify WebSocket connection is rejected with 1008 on unauthorized origin."""
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/telemetry", headers={"origin": "http://malicious-site.com"}
        ):
            pass
    assert exc_info.value.code == 1008


def test_websocket_binary_rejected_origin():
    """Verify binary WebSocket connection is rejected with 1008 on unauthorized origin."""
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/telemetry/binary", headers={"origin": "https://evil-hacker.com"}
        ):
            pass
    assert exc_info.value.code == 1008


def test_websocket_overlay_rejected_origin():
    """Verify overlay WebSocket connection is rejected with 1008 on unauthorized origin."""
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/ws/overlay", headers={"origin": "http://attacker.xyz:8080"}
        ):
            pass
    assert exc_info.value.code == 1008


def test_cors_preflight_valid_origins():
    """Verify CORS preflight succeeds for allowed origins."""
    client = TestClient(app)
    valid_origins = [
        "tauri://localhost",
        "https://tauri.localhost",
        "http://tauri.localhost",
        "http://localhost:1420",
        "http://127.0.0.1:52234",
    ]
    for origin in valid_origins:
        res = client.options(
            "/api/overlay/config",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 200, f"Failed for origin: {origin}"
        assert res.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_blocked_origins():
    """Verify CORS preflight blocks unauthorized external origins."""
    client = TestClient(app)
    blocked_origins = [
        "https://evil-attacker.com",
        "http://malicious-website.org",
        "http://localhost.evil.com",
    ]
    for origin in blocked_origins:
        res = client.options(
            "/api/overlay/config",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.headers.get("access-control-allow-origin") != origin


def test_csrf_protection_blocked():
    """Verify CSRF protection blocks cross-origin state-changing requests."""
    client = TestClient(app)
    # POST with malicious origin
    res = client.post("/api/analysis/clear", headers={"Origin": "https://evil.com"})
    assert res.status_code == 403
    assert "CSRF protection blocked request" in res.json().get("detail", "")

    # PUT with malicious origin
    res = client.put("/api/settings", headers={"Origin": "https://evil.com"}, json={})
    assert res.status_code == 403


def test_csrf_protection_allowed():
    """Verify CSRF protection allows legitimate requests."""
    client = TestClient(app)
    # Valid origin
    res = client.post(
        "/api/analysis/clear", headers={"Origin": "http://localhost:8000"}
    )
    assert res.status_code == 200

    # GET with malicious origin (allowed as GET does not change state)
    res = client.get("/api/settings", headers={"Origin": "https://evil.com"})
    assert res.status_code == 200

    # No origin (local clients)
    res = client.post("/api/analysis/clear")
    assert res.status_code == 200
