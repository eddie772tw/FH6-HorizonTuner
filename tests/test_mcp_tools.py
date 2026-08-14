"""Tests for MCP Tools Dispatching and Validation."""

import pytest

from backend.mcp.protocol import McpError
from backend.mcp.service import HorizonTunerMcpService
from backend.mcp.tools import McpToolManager


@pytest.fixture
def tool_manager(tmp_path):
    service = HorizonTunerMcpService(
        data_root=str(tmp_path), resource_root=str(tmp_path)
    )
    return McpToolManager(service)


@pytest.mark.asyncio
async def test_tool_call_get_system_settings(tool_manager):
    resp = await tool_manager.call_tool("get_system_settings", {})
    assert "content" in resp
    assert len(resp["content"]) == 1
    assert "speedUnit" in resp["content"][0]["text"]


@pytest.mark.asyncio
async def test_tool_call_tuning_solver(tool_manager):
    args = {
        "car_params": {
            "weight_kg": 1600,
            "front_weight_bias": 0.52,
            "drivetrain": "AWD",
            "max_rpm": 7000,
        },
        "purpose": "rally",
    }
    resp = await tool_manager.call_tool("run_dev_tuning_solver", args)
    assert "content" in resp
    text = resp["content"][0]["text"]
    assert "calculated_setup" in text
    assert "differential" in text


@pytest.mark.asyncio
async def test_tool_call_gearing_solver_missing_args(tool_manager):
    resp = await tool_manager.call_tool("run_gearing_solver", {})
    assert "error" in resp["content"][0]["text"].lower() or resp.get("isError")


@pytest.mark.asyncio
async def test_tool_call_non_existent(tool_manager):
    with pytest.raises(McpError):
        await tool_manager.call_tool("invalid_tool_name", {})
