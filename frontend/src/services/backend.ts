import { invoke } from "@tauri-apps/api/core";

export interface BackendStatus {
  state: "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
}

export const PREFERRED_BACKEND_PORT = 8001;

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BackendTransport {
  readonly port: number;
  httpUrl(path: string): string;
  webSocketUrl(path: string): string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function createBackendTransport(
  port: number,
  fetchImplementation: FetchImplementation = fetch,
): BackendTransport {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid backend port: ${port}`);
  }

  const httpUrl = (path: string) => `http://127.0.0.1:${port}${normalizePath(path)}`;
  const webSocketUrl = (path: string) => `ws://127.0.0.1:${port}${normalizePath(path)}`;

  return {
    port,
    httpUrl,
    webSocketUrl,
    fetch: (path, init) => fetchImplementation(httpUrl(path), init),
  };
}

let backendTransport = createBackendTransport(PREFERRED_BACKEND_PORT);

/**
 * Configured once the Tauri sidecar reports a verified listening port. Keeping
 * this as an explicit client avoids globally replacing window.fetch/WebSocket,
 * which could accidentally reroute non-backend resources.
 */
export function configureBackendTransport(port: number): void {
  backendTransport = createBackendTransport(port);
}

export function getBackendPort(): number {
  return backendTransport.port;
}

export function backendHttpUrl(path: string): string {
  return backendTransport.httpUrl(path);
}

export function backendWebSocketUrl(path: string): string {
  return backendTransport.webSocketUrl(path);
}

export function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return backendTransport.fetch(path, init);
}

export async function waitForBackendReady(timeoutMs = 30_000): Promise<BackendStatus> {
  if (!isTauriRuntime()) {
    return { state: "ready", port: PREFERRED_BACKEND_PORT, error: null };
  }

  const deadline = Date.now() + timeoutMs;
  let lastStatus: BackendStatus = { state: "starting", port: null, error: null };

  while (Date.now() < deadline) {
    lastStatus = await invoke<BackendStatus>("get_backend_status");
    if (lastStatus.state === "ready" || lastStatus.state === "failed") return lastStatus;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return {
    state: "failed",
    port: null,
    error: lastStatus.error || "Backend startup timed out.",
  };
}
