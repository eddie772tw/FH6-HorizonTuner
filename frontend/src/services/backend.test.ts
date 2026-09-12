import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backendHttpUrl,
  backendWebSocketUrl,
  configureBackendTransport,
  createBackendTransport,
} from "./backend";

describe("backend URL helpers", () => {
  afterEach(() => configureBackendTransport(8001));

  it("creates HTTP URLs with a normalized path", () => {
    const transport = createBackendTransport(53124);
    expect(transport.httpUrl("api/settings")).toBe("http://127.0.0.1:53124/api/settings");
  });

  it("creates WebSocket URLs with a normalized path", () => {
    const transport = createBackendTransport(53124);
    expect(transport.webSocketUrl("/ws/telemetry")).toBe("ws://127.0.0.1:53124/ws/telemetry");
  });

  it("uses the configured port for application transport helpers", () => {
    configureBackendTransport(53124);
    expect(backendHttpUrl("/api/settings")).toBe("http://127.0.0.1:53124/api/settings");
    expect(backendWebSocketUrl("/ws/telemetry")).toBe("ws://127.0.0.1:53124/ws/telemetry");
  });

  it("delegates backend requests through the supplied fetch implementation", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response());
    const transport = createBackendTransport(53124, fetchImplementation);
    const init = { method: "POST" };

    await transport.fetch("api/settings", init);

    expect(fetchImplementation).toHaveBeenCalledWith("http://127.0.0.1:53124/api/settings", init);
  });

  it("rejects invalid sidecar ports", () => {
    expect(() => createBackendTransport(0)).toThrow("Invalid backend port: 0");
  });
});
