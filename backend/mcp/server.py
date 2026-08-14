"""Stdio Server Runner for FH6-HorizonTuner MCP."""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import logging
import sys

from .protocol import McpError, McpProtocolHandler
from .resources import McpResourceManager
from .service import HorizonTunerMcpService
from .tools import McpToolManager

# Setup logger to write exclusively to stderr so stdout is 100% clean JSON-RPC
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (mcp) %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("mcp_server")


class StdioMcpServer:
    """Standard I/O MCP Server reading JSON-RPC lines from stdin and replying to stdout."""

    def __init__(self, service: HorizonTunerMcpService):
        self.service = service
        self.tool_manager = McpToolManager(service)
        self.resource_manager = McpResourceManager(service)
        self.protocol = McpProtocolHandler(self.tool_manager, self.resource_manager)
        self.running = False

    async def run(self) -> None:
        """Run standard I/O listener loop."""
        logger.info("Starting FH6-HorizonTuner MCP Server (stdio)...")
        self.running = True

        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin.buffer)

        writer_transport, writer_protocol = await loop.connect_write_pipe(
            asyncio.streams.FlowControlMixin, sys.stdout.buffer
        )
        writer = asyncio.StreamWriter(writer_transport, writer_protocol, None, loop)

        while self.running:
            try:
                line_bytes = await reader.readline()
                if not line_bytes:
                    # EOF reached
                    logger.info("Stdin EOF encountered. Exiting MCP server.")
                    break

                line_str = line_bytes.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue

                # Handle potential Content-Length prefix in LSP/MCP framing
                if line_str.lower().startswith("content-length:"):
                    # Read until double newline
                    length = int(line_str.split(":", 1)[1].strip())
                    while True:
                        header_line = (
                            (await reader.readline())
                            .decode("utf-8", errors="replace")
                            .strip()
                        )
                        if not header_line:
                            break
                    body_bytes = await reader.readexactly(length)
                    line_str = body_bytes.decode("utf-8", errors="replace").strip()

                try:
                    request_obj = self.protocol.parse_line(line_str)
                    if request_obj:
                        response_obj = await self.protocol.handle_request(request_obj)
                        if response_obj:
                            out_str = (
                                json.dumps(response_obj, ensure_ascii=False) + "\n"
                            )
                            writer.write(out_str.encode("utf-8"))
                            await writer.drain()
                except McpError as exc:
                    err_resp = {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {
                            "code": exc.code,
                            "message": exc.message,
                            "data": exc.data,
                        },
                    }
                    writer.write((json.dumps(err_resp) + "\n").encode("utf-8"))
                    await writer.drain()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception("Error processing MCP stdio message: %s", exc)

        logger.info("MCP Server shutdown.")


def main() -> None:
    """CLI entry point for running the MCP server."""
    parser = argparse.ArgumentParser(
        description="FH6-HorizonTuner Read-Only MCP Server"
    )
    parser.add_argument(
        "--data-dir", type=str, default=None, help="Path to writable data directory"
    )
    parser.add_argument(
        "--resource-root",
        type=str,
        default=None,
        help="Path to read-only resource root",
    )
    args = parser.parse_args()

    # Reconfigure streams for clean UTF-8 on Windows
    if sys.platform == "win32":
        if hasattr(sys.stdin, "reconfigure"):
            sys.stdin.reconfigure(encoding="utf-8")
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")

    service = HorizonTunerMcpService(
        data_root=args.data_dir, resource_root=args.resource_root
    )
    server = StdioMcpServer(service)
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
