"""FH6-HorizonTuner MCP (Model Context Protocol) Package.

Provides a localhost read-only MCP server exposing telemetry, car database,
tuning solver, and diagnostic contracts for AI assistants.
"""

from .protocol import McpProtocolHandler
from .resources import McpResourceManager
from .service import HorizonTunerMcpService
from .tools import McpToolManager

__all__ = [
    "HorizonTunerMcpService",
    "McpProtocolHandler",
    "McpResourceManager",
    "McpToolManager",
]
