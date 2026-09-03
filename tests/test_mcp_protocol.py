"""Tests for MCP Protocol Handler and JSON-RPC 2.0 Parser."""

import pytest

from backend.mcp.protocol import McpProtocolHandler
from backend.mcp.resources import McpResourceManager
from backend.mcp.service import HorizonTunerMcpService
from backend.mcp.tools import McpToolManager


@pytest.fixture
def mcp_protocol(tmp_path):
    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    tools = McpToolManager(service)
    resources = McpResourceManager(service)
    return McpProtocolHandler(tools, resources)


@pytest.mark.asyncio
async def test_mcp_initialize(mcp_protocol):
    req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0"},
        },
    }
    resp = await mcp_protocol.handle_request(req)
    assert resp is not None
    assert resp["id"] == 1
    assert "result" in resp
    assert resp["result"]["serverInfo"]["name"] == "fh6-horizon-tuner-mcp"
    assert resp["result"]["serverInfo"]["version"] == "1.1.0"
    assert "tools" in resp["result"]["capabilities"]
    assert "instructions" in resp["result"]
    assert "/mcp" in resp["result"]["instructions"]
    assert "read-only" in resp["result"]["instructions"]
    assert "mcp_allow_live" in resp["result"]["instructions"]


@pytest.mark.asyncio
async def test_mcp_ping(mcp_protocol):
    req = {"jsonrpc": "2.0", "id": 2, "method": "ping"}
    resp = await mcp_protocol.handle_request(req)
    assert resp == {"jsonrpc": "2.0", "id": 2, "result": {}}


@pytest.mark.asyncio
async def test_mcp_notification_initialized(mcp_protocol):
    req = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    resp = await mcp_protocol.handle_request(req)
    assert resp is None
    assert mcp_protocol.initialized is True


@pytest.mark.asyncio
async def test_mcp_method_not_found(mcp_protocol):
    req = {"jsonrpc": "2.0", "id": 3, "method": "non_existent_method"}
    resp = await mcp_protocol.handle_request(req)
    assert resp is not None
    assert "error" in resp
    assert resp["error"]["code"] == -32601


@pytest.mark.asyncio
async def test_mcp_tools_list(mcp_protocol):
    req = {"jsonrpc": "2.0", "id": 4, "method": "tools/list"}
    resp = await mcp_protocol.handle_request(req)
    assert resp is not None
    assert "result" in resp
    tools = resp["result"]["tools"]
    assert isinstance(tools, list)
    assert len(tools) >= 20
    tool_names = {t["name"] for t in tools}
    assert "get_live_telemetry_snapshot" in tool_names
    assert "get_driver_cockpit_telemetry" in tool_names
    assert "get_vehicle_dynamics_telemetry" in tool_names
    assert "get_tires_status_telemetry" in tool_names
    assert "get_suspension_telemetry" in tool_names
    assert "run_dev_tuning_solver" in tool_names
    assert "run_gearing_solver" in tool_names
