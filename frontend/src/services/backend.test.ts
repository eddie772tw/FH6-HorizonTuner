import { describe, expect, it } from "vitest";
import { backendHttpUrl, backendWebSocketUrl } from "./backend";

describe("backend URL helpers", () => {
  it("creates HTTP URLs with a normalized path", () => {
    expect(backendHttpUrl(53124, "api/settings")).toBe("http://127.0.0.1:53124/api/settings");
  });

  it("creates WebSocket URLs with a normalized path", () => {
    expect(backendWebSocketUrl(53124, "/ws/telemetry")).toBe("ws://127.0.0.1:53124/ws/telemetry");
  });
});
