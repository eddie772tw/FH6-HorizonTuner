"""Tests for MCP Resources Routing and Reading."""

import pytest

from backend.mcp.protocol import McpError
from backend.mcp.resources import McpResourceManager
from backend.mcp.service import HorizonTunerMcpService


@pytest.fixture
def resource_manager(tmp_path):
    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    return McpResourceManager(service)


@pytest.mark.asyncio
async def test_list_resources(resource_manager):
    resources = await resource_manager.list_resources()
    assert isinstance(resources, list)
    uris = {r["uri"] for r in resources}
    assert "fh6://telemetry/live" in uris
    assert "fh6://settings/current" in uris


@pytest.mark.asyncio
async def test_read_resource_live(resource_manager):
    res = await resource_manager.read_resource("fh6://telemetry/live")
    assert "contents" in res
    assert res["contents"][0]["uri"] == "fh6://telemetry/live"
    assert "status" in res["contents"][0]["text"]


@pytest.mark.asyncio
async def test_read_resource_settings(resource_manager):
    res = await resource_manager.read_resource("fh6://settings/current")
    assert "contents" in res
    assert "settings" in res["contents"][0]["text"]


@pytest.mark.asyncio
async def test_read_resource_invalid_scheme(resource_manager):
    with pytest.raises(McpError):
        await resource_manager.read_resource("http://invalid/scheme")
