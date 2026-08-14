"""Tests for MCP Server-Sent Events (SSE) Transport and Endpoints."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.mcp.protocol import McpProtocolHandler
from backend.mcp.resources import McpResourceManager
from backend.mcp.service import HorizonTunerMcpService
from backend.mcp.sse_transport import McpSseTransportManager
from backend.mcp.tools import McpToolManager


@pytest.fixture
def sse_manager(tmp_path):
    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    tools = McpToolManager(service)
    resources = McpResourceManager(service)
    protocol = McpProtocolHandler(tools, resources)
    return McpSseTransportManager(protocol)


@pytest.mark.asyncio
async def test_sse_session_connection(sse_manager):
    session_id, stream = await sse_manager.connect_session()
    assert session_id is not None
    assert sse_manager.active_sessions_count == 1

    # First event in stream must be endpoint
    first_event = await anext(stream)
    assert "event: endpoint" in first_event
    assert f"session_id={session_id}" in first_event


@pytest.mark.asyncio
async def test_sse_handle_post_message(sse_manager):
    session_id, stream = await sse_manager.connect_session()
    await anext(stream)  # Consume initial endpoint event

    # Post initialize message
    init_msg = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0"},
        },
    }

    res = await sse_manager.handle_post_message(session_id, init_msg)
    assert res["status"] == "accepted"
    assert res["has_response"] is True

    # Read response event from SSE stream
    resp_event = await anext(stream)
    assert "event: message" in resp_event
    assert "serverInfo" in resp_event
    assert "fh6-horizon-tuner-mcp" in resp_event


@pytest.mark.asyncio
async def test_sse_invalid_session(sse_manager):
    with pytest.raises(Exception) as exc_info:
        await sse_manager.handle_post_message(
            "non-existent-session", {"jsonrpc": "2.0"}
        )
    assert "Invalid or expired MCP session ID" in str(exc_info.value)


def test_mcp_api_status():
    client = TestClient(app)
    resp = client.get("/api/mcp/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "enabled" in data
    assert "active_sse_clients" in data
    assert "stdio_command" in data
