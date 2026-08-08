import { invoke } from "@tauri-apps/api/core";

export interface BackendStatus {
  state: "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
}

const DEFAULT_DEV_PORT = 8001;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
}

export function backendHttpUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

export function backendWebSocketUrl(port: number, path: string): string {
  return `ws://127.0.0.1:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

function replaceLegacyBackendPort(value: string, port: number): string {
  return value.replace(/(127\.0\.0\.1|localhost):8001/g, `$1:${port}`);
}

/**
 * Compatibility bridge for views that have not yet moved to backendHttpUrl()
 * and backendWebSocketUrl(). It is installed only after a verified port exists,
 * so no request can be sent to an arbitrary fallback port during startup.
 */
export function installBackendTransport(port: number): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(replaceLegacyBackendPort(input, port), init);
    }
    if (input instanceof URL) {
      return originalFetch(new URL(replaceLegacyBackendPort(input.toString(), port)), init);
    }
    const replacement = replaceLegacyBackendPort(input.url, port);
    return replacement === input.url
      ? originalFetch(input, init)
      : originalFetch(new Request(replacement, input), init);
  };

  const OriginalWebSocket = window.WebSocket;
  const BackendWebSocket = function (
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[],
  ) {
    const endpoint = replaceLegacyBackendPort(url.toString(), port);
    return protocols === undefined
      ? Reflect.construct(OriginalWebSocket, [endpoint], BackendWebSocket)
      : Reflect.construct(OriginalWebSocket, [endpoint, protocols], BackendWebSocket);
  } as unknown as typeof WebSocket;

  BackendWebSocket.prototype = OriginalWebSocket.prototype;
  Object.setPrototypeOf(BackendWebSocket, OriginalWebSocket);
  window.WebSocket = BackendWebSocket;
}

export async function waitForBackendReady(timeoutMs = 15_000): Promise<BackendStatus> {
  if (!isTauriRuntime()) {
    return { state: "ready", port: DEFAULT_DEV_PORT, error: null };
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
