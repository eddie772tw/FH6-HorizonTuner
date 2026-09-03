"""Tests for the FastAPI Streamable HTTP MCP endpoint."""

from fastapi.testclient import TestClient

from backend.main import app, app_settings


def test_mcp_api_status():
    client = TestClient(app)
    resp = client.get("/api/mcp/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["transport"] == "streamable-http"
    assert data["mcp_endpoint"] == "/mcp"
    assert "total_requests_served" in data
    assert data["continuous_streaming"] is False
    assert "query_capture_window" in data["time_series_tools"]


def test_mcp_streamable_http_initialize_and_tools():
    client = TestClient(app)
    headers = {"Accept": "application/json, text/event-stream"}
    init = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0"},
        },
    }

    init_response = client.post("/mcp", json=init, headers=headers)
    assert init_response.status_code == 200
    assert init_response.json()["result"]["serverInfo"]["name"] == (
        "fh6-horizon-tuner-mcp"
    )
    init_result = init_response.json()["result"]
    assert init_result["instructions"]
    assert "dynamic local port" in init_result["instructions"]

    tools_response = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        headers=headers,
    )
    assert tools_response.status_code == 200
    assert "get_live_telemetry_snapshot" in {
        tool["name"] for tool in tools_response.json()["result"]["tools"]
    }


def test_mcp_streamable_http_rejects_non_local_origin():
    client = TestClient(app)
    response = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
        headers={"Origin": "https://attacker.example"},
    )
    assert response.status_code == 403


def test_mcp_streamable_http_is_disabled_with_app_setting():
    client = TestClient(app)
    original = app_settings["mcp_enabled"]
    app_settings["mcp_enabled"] = False
    try:
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
        )
        assert response.status_code == 403
    finally:
        app_settings["mcp_enabled"] = original
