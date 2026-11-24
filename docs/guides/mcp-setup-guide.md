# FH6-HorizonTuner MCP setup

## Formal tuning owner (v1.7.1)

Use `calculate_tuning_workflow` for desktop-equivalent recommendations. Its request uses `tuning-workflow-result/v1`, the complete profile, goal, season, car identity and qualified evidence (`saved-engine` with `observationId`, or `saved-ev` with `evidenceId`). Original captures can also be replayed by the same Rust library. Bare peak values do not establish measured readiness. This read-only tool preserves saved state; persistence requires backend-issued evidence through the application API.

Older quick solver formulas and Developer Tuning are removed. Cached old tool names return retirement errors; discovery advertises current tools. Use the qualified workflow, and review [archives and compatibility changes](../tuning/model-retirement.md).


FH6-HorizonTuner exposes a localhost MCP server from the running
Rust backend. The MCP endpoint is Streamable HTTP at `/mcp`, so MCP calls
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
the Agent how to use this server, including its localhost scope, experimental game-control
disclosure, live-telemetry setting, bounded time-series behavior, and the fact
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

Most MCP tools expose read-only telemetry summaries, captures, car data and solvers.
The four automated-tuning tools below additionally provide experimental game control.
They do not expose arbitrary SQL/files or create a second UDP listener.

The HTTP MCP contract returns request-scoped results. Historical and captured
time-series data is available through `query_session_telemetry` and
`query_capture_window`, including timestamp fields, window slicing, and
downsampling. It does not provide a continuous server-push stream of future
60Hz frames; live data is a point-in-time snapshot and must be queried again
for a later sample.


## Experimental automated tuning

No separate automated-tuning MCP switch is required. Developer options control the desktop tab's visibility only; these tools remain discoverable and callable with that option off. The existing global MCP server setting still controls the server itself.

Before starting, the Agent must tell the user that this feature is experimental and may be less efficient than the Agent's own native computer-use capability, if available. This requirement is included in `InitializeResult.instructions`, the start-tool description and status response. It does not add another approval prompt or acknowledgement flag.

| Tool | Behavior |
| --- | --- |
| `start_auto_tuning` | Starts Step 1–3 for the selected vehicle. Returns `runId` immediately; acceptance is not completion. |
| `get_auto_tuning_status` | Reports runtime availability, current run, values, recommendations, recent actions and elapsed time. |
| `get_auto_tuning_screenshot` | Returns the current run's latest PNG as MCP image content. Requires its `runId`. |
| `stop_auto_tuning` | Requests cancellation of the named run. Already saved in-game settings are not rolled back. |

Start arguments:

```json
{
  "goal": "Road",
  "season": "Winter",
  "expectedCarName": "1964 Aston Martin DB5",
  "requestId": "agent-db5-road-001"
}
```

Supply the current vehicle name and keep FH6 in the foreground at the festival garage, Cars or Upgrades menu. Fresh, advancing telemetry supplies the authoritative CarOrdinal; spelling, abbreviation and catalog-name mismatches are advisory. The controller still rejects a requested vehicle that resolves to a different ordinal, and cross-checks telemetry PI/drivetrain against the car card. Only when a valid live ordinal is unavailable does it require a unique name match. Agent starts do not attempt to drive an unidentified car back from free roam. Road, Rally and Drag are accepted; Drift still needs manual targets and is rejected.

Measurement starts in manual third gear. A run that reaches the distance limit without high-RPM coverage retries one gear lower; a run with high-RPM coverage but insufficient valid acceleration time retries one gear higher. Each attempt starts from a verified road fast-travel position, uses fresh telemetry and is qualified independently by Rust. There are at most three attempts, without revisiting a gear. Combining brake/reacceleration segments within one pass is not implemented.

The native Windows desktop supplies the embedded runtime to its Rust backend. A headless development backend without those assets reports unavailable. The UI and MCP share one controller: a concurrent start is rejected, the most recent identical `requestId` returns its original run, and stale run IDs cannot read another run's screenshot or stop it. Poll status until completed, failed or stopped. Closing the owning service causes the controller to stop and release its held keys.
