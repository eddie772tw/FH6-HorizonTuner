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

## Standard initialization and automatic guidance

After an Agent connects to `/mcp`, the MCP initialization handshake returns the
standard `InitializeResult.instructions` field. The returned instructions tell
the Agent how to use this server, including its localhost scope, read-only
boundary, live-telemetry setting, bounded time-series behavior, and the fact
that a Release Build may use a dynamic port. This is the canonical source for
Agent-facing configuration and usage guidance; clients should not require a
second JSON or CLI copy step after the connection is established.

MCP initialization cannot bootstrap a URL that the client does not know yet.
The first connection still needs a client-specific endpoint registration, a
local integration, or another discovery mechanism provided by that client.
There is no cross-client MCP API that lets this application inject a URL into
every Agent's configuration. For clients that support standard MCP
initialization, the one-time endpoint registration is the only setup required;
the server then supplies its capabilities and operating guidance automatically.

## Codex

Register the running backend endpoint once in Codex's global MCP configuration:

```powershell
codex mcp add fh6-horizon-tuner --url http://127.0.0.1:8001/mcp
```

Verify the registration with:

```powershell
codex mcp list
codex mcp get fh6-horizon-tuner
```

The server will report unavailable until Horizon Tuner is running. Once Codex
connects, it receives the standard initialization instructions automatically.
If a Release Build falls back to a dynamic port, update the one-time URL after
startup using the endpoint shown in Settings.

## Claude Desktop, Cursor, and other HTTP MCP clients

Use the Streamable HTTP URL rather than a local Python command. For clients
that do not offer a local endpoint picker, the one-time JSON configuration
shape is:

```json
{
  "mcpServers": {
    "fh6-horizon-tuner": {
      "url": "http://127.0.0.1:8001/mcp"
    }
  }
}
```

After this initial registration, a client that implements MCP initialization
receives the server instructions from the handshake. The JSON block is a
bootstrap fallback for clients that cannot discover or register a local HTTP
endpoint themselves; it is not a second per-session configuration step.

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
