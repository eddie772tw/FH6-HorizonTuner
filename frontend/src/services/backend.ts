import { invoke } from "@tauri-apps/api/core";

export interface BackendStatus {
  state: "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
}

export const PREFERRED_BACKEND_PORT = 8001;
export const DEFAULT_BACKEND_REQUEST_TIMEOUT_MS = 10_000;

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

/** Keep requests made by the Companion WebView on the host that served it. */
function companionPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized.startsWith("//") || /[\\\u0000-\u001f\u007f#]/.test(normalized)) {
    throw new Error("Invalid companion request path.");
  }
  const pathname = normalized.split("?", 1)[0];
  for (const segment of pathname.split("/")) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); }
    catch { throw new Error("Invalid companion request path."); }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new Error("Invalid companion request path.");
    }
  }
  return normalized;
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

/** Companion assets and APIs share the selected PC origin (including adb reverse). */
export function configureCompanionTransport(): void {
  const base = new URL(window.location.origin);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Companion requires an HTTP host.');
  backendTransport = {
    port: Number(base.port || (base.protocol === 'https:' ? 443 : 80)),
    httpUrl: path => new URL(companionPath(path), base).href,
    webSocketUrl: path => {
      const url = new URL(companionPath(path), base);
      url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      return url.href;
    },
    // A path-only browser request cannot retarget the host via a WebSocket frame
    // or an API value. The same-origin response still uses the selected PC port.
    fetch: async (path, init) => fetch(companionPath(path), init),
  };
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

export function backendFetch(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_BACKEND_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const externalSignal = init?.signal;
  const forwardAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  return backendTransport
    .fetch(path, { ...init, signal: controller.signal })
    .finally(() => {
      if (timeout !== undefined) clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardAbort);
    });
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
