# FH6-HorizonTuner MCP setup

FH6-HorizonTuner exposes a localhost, read-only MCP server from the running
FastAPI backend. The MCP endpoint is Streamable HTTP at `/mcp`, so MCP calls
share the same process and live telemetry snapshot as the application.

MCP is available only when all of these conditions are true:

1. Horizon Tuner is running.
2. The backend is ready and listening on its local HTTP port.
3. `Enable MCP Server` is enabled in Settings.

When the app is stopped or MCP is disabled, the endpoint is intentionally
unavailable. There is no separate stdio process and no second telemetry
consumer.

## Endpoint

Development mode uses:

```text
http://127.0.0.1:8001/mcp
```

The Release Build first attempts to use local HTTP port `8001`. If that port is
occupied, it selects another local port and writes the actual bound port to
`logs/web_port.txt`. The frontend uses that value directly. Use the endpoint
shown by the Settings MCP card when configuring an Agent; a Settings/MCP
popover also appears when the fallback port is active.

The server exposes only this Streamable HTTP endpoint. Legacy HTTP+SSE routes
are intentionally not included because MCP has not been deployed to external
clients yet.

## Codex

Add the running backend endpoint to Codex's global MCP configuration:

```powershell
codex mcp add fh6-horizon-tuner --url http://127.0.0.1:8001/mcp
```

Verify the registration with:

```powershell
codex mcp list
codex mcp get fh6-horizon-tuner
```

The server will report unavailable until Horizon Tuner is running. If a Release
Build falls back to a dynamic port, update the URL after startup using the
endpoint shown in Settings.

## Claude Desktop, Cursor, and other HTTP MCP clients

Use the Streamable HTTP URL rather than a local Python command. For clients
that accept an MCP JSON configuration, the shape is:

```json
{
  "mcpServers": {
    "fh6-horizon-tuner": {
      "url": "http://127.0.0.1:8001/mcp"
    }
  }
}
```

## Safety and scope

The MCP tools are read-only. They expose bounded telemetry summaries, capture
and session windows, car data, tuning contracts, deterministic solvers, and
diagnostics. They do not write tuning values, control the game, expose
arbitrary SQL, or create a second UDP telemetry listener.

The HTTP MCP contract returns request-scoped results. Historical and captured
time-series data is available through `query_session_telemetry` and
`query_capture_window`, including timestamp fields, window slicing, and
downsampling. It does not provide a continuous server-push stream of future
60Hz frames; live data is a point-in-time snapshot and must be queried again
for a later sample.
