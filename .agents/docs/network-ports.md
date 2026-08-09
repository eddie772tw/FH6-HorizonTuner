# Network Port Contract

FH6-HorizonTuner has separate transport endpoints for game telemetry and the local application API.

| Service | Protocol | Development default | Configuration |
| --- | --- | ---: | --- |
| Forza Horizon Data Out listener | UDP | `127.0.0.1:8000` | `TELEMETRY_IP`, `TELEMETRY_PORT` |
| FastAPI REST API and WebSocket server | HTTP / WebSocket over TCP | `127.0.0.1:8001` | `BACKEND_PORT` |

The game must send Data Out packets to UDP port `8000` unless `TELEMETRY_PORT` and the in-game Data Out setting are changed together. The frontend must use the HTTP/WebSocket backend port, not the telemetry UDP port.

For a packaged portable release, the backend selects an available TCP port to avoid clashes between instances. The Tauri host discovers it through the sidecar readiness event or `logs/web_port.txt`. The UDP telemetry listener remains on the configured telemetry port, which defaults to `8000`.

When changing either port, update the corresponding environment variable and every external client that uses that transport. Do not use `8000` as an HTTP URL merely because it is the default telemetry port.
