"""Tests for WebSocket Origin Verification and CSWSH Protection."""

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
