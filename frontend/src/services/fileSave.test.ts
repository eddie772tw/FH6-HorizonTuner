import { afterEach, describe, expect, it, vi } from "vitest";
import { backendFetch } from "./backend";
import {
  fetchExportBlob,
  saveFile,
  type SavePlatform,
} from "./fileSave";

vi.mock("./backend", () => ({
  backendFetch: vi.fn(),
}));

const mockedBackendFetch = vi.mocked(backendFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveFile", () => {
  it("writes native ZIP data and does not fall back to browser download", async () => {
    const nativeSave = vi.fn(async (_filename: string, data: Uint8Array) => {
      expect(Array.from(data)).toEqual([80, 75, 3, 4]);
      return "C:\\Exports\\measurement.zip";
    });
    const download = vi.fn();
    const platform: SavePlatform = { nativeSave, download };

    const result = await saveFile({
      filename: "measurement.zip",
      mimeType: "application/zip",
      load: () => new Blob([new Uint8Array([80, 75, 3, 4])], { type: "application/zip" }),
    }, platform);

    expect(result).toEqual({
      status: "saved",
      filename: "measurement.zip",
      path: "C:\\Exports\\measurement.zip",
    });
    expect(nativeSave).toHaveBeenCalledWith("measurement.zip", expect.any(Uint8Array));
    expect(download).not.toHaveBeenCalled();
  });

  it("reports native cancellation without browser fallback", async () => {
    const nativeSave = vi.fn(async () => null);
    const download = vi.fn();
    const platform: SavePlatform = { nativeSave, download };

    const result = await saveFile({
      filename: "cancelled.json",
      mimeType: "application/json",
      load: () => new Blob(["{}"], { type: "application/json" }),
    }, platform);

    expect(result).toEqual({ status: "cancelled" });
    expect(download).not.toHaveBeenCalled();
  });

  it("does not fall back to browser download when native save rejects", async () => {
    const nativeSave = vi.fn(async () => {
      throw new Error("native write failed");
    });
    const download = vi.fn();
    const platform: SavePlatform = { nativeSave, download };

    await expect(saveFile({
      filename: "failed.json",
      mimeType: "application/json",
      load: () => new Blob(["{}"]),
    }, platform)).rejects.toThrow("native write failed");
    expect(download).not.toHaveBeenCalled();
  });

  it("opens the browser picker before loading export data", async () => {
    const events: string[] = [];
    const writer = {
      write: vi.fn(async () => { events.push("write"); }),
      close: vi.fn(async () => { events.push("close"); }),
      abort: vi.fn(async () => { events.push("abort"); }),
    };
    const pickFile = vi.fn(async (options: { suggestedName: string }) => {
      events.push("pick");
      expect(options.suggestedName).toBe("capture.csv");
      return {
        name: "capture.csv",
        createWritable: async () => writer,
      };
    });
    const download = vi.fn();
    const platform: SavePlatform = { pickFile, download };

    const result = await saveFile({
      filename: "capture.csv",
      mimeType: "text/csv",
      load: async () => {
        events.push("load");
        return new Blob(["a,b\n1,2"], { type: "text/csv" });
      },
    }, platform);

    expect(result).toEqual({ status: "saved", filename: "capture.csv" });
    expect(events).toEqual(["pick", "load", "write", "close"]);
    expect(download).not.toHaveBeenCalled();
  });

  it("does not load or download when the browser picker is cancelled", async () => {
    const pickFile = vi.fn(async () => {
      throw Object.assign(new Error("picker cancelled"), { name: "AbortError" });
    });
    const load = vi.fn(async () => new Blob(["unused"]));
    const download = vi.fn();
    const platform: SavePlatform = { pickFile, download };

    const result = await saveFile({
      filename: "cancelled.csv",
      mimeType: "text/csv",
      load,
    }, platform);

    expect(result).toEqual({ status: "cancelled" });
    expect(load).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("cancels before deferred load when the request is stale", async () => {
    const pickFile = vi.fn(async () => ({
      name: "stale.zip",
      createWritable: async () => ({
        write: vi.fn(),
        close: vi.fn(),
        abort: vi.fn(),
      }),
    }));
    const load = vi.fn(async () => new Blob(["unused"]));
    const download = vi.fn();
    const platform: SavePlatform = { pickFile, download };

    const result = await saveFile({
      filename: "stale.zip",
      mimeType: "application/zip",
      isCurrent: () => false,
      load,
    }, platform);

    expect(result).toEqual({ status: "cancelled" });
    expect(load).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("cancels after deferred load when the request becomes stale", async () => {
    let currentChecks = 0;
    const download = vi.fn();
    const load = vi.fn(async () => new Blob(["stale"], { type: "text/plain" }));

    const result = await saveFile({
      filename: "stale.txt",
      mimeType: "text/plain",
      isCurrent: () => {
        currentChecks += 1;
        return currentChecks === 1;
      },
      load,
    }, { download });

    expect(result).toEqual({ status: "cancelled" });
    expect(load).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it("does not fall back to browser download when deferred load has a network failure", async () => {
    const download = vi.fn();
    const platform: SavePlatform = { download };

    await expect(saveFile({
      filename: "network-failure.zip",
      mimeType: "application/zip",
      load: async () => {
        throw new Error("network unavailable");
      },
    }, platform)).rejects.toThrow("network unavailable");
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["write", "close"] as const)("aborts the picker writer when %s fails", async (failurePoint) => {
    const abort = vi.fn(async () => undefined);
    const write = vi.fn(async () => {
      if (failurePoint === "write") throw new Error("write failed");
    });
    const close = vi.fn(async () => {
      if (failurePoint === "close") throw new Error("close failed");
    });
    const handle = {
      name: "capture.json",
      createWritable: async () => ({
        write,
        close,
        abort,
      }),
    };
    const pickFile = vi.fn(async () => handle);
    const download = vi.fn();
    const platform: SavePlatform = { pickFile, download };

    await expect(saveFile({
      filename: "capture.json",
      mimeType: "application/json",
      load: () => new Blob(["{}"]),
    }, platform)).rejects.toThrow(`${failurePoint} failed`);

    expect(abort).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it("falls back to browser download when no native or picker platform is available", async () => {
    const download = vi.fn();
    const platform: SavePlatform = { download };
    const blob = new Blob(["fallback"], { type: "text/plain" });

    const result = await saveFile({
      filename: "fallback.txt",
      mimeType: "text/plain",
      load: () => blob,
    }, platform);

    expect(result).toEqual({ status: "downloaded", filename: "fallback.txt" });
    expect(download).toHaveBeenCalledWith(blob, "fallback.txt");
  });
});

describe("fetchExportBlob", () => {
  it("surfaces a JSON error body even when the HTTP status is 200", async () => {
    mockedBackendFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "export is not ready" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(fetchExportBlob("/api/export", "application/zip"))
      .rejects.toThrow("export is not ready");
  });

  it("surfaces a JSON error body for a 404 response", async () => {
    mockedBackendFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ detail: "capture not found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    ));

    await expect(fetchExportBlob("/api/missing", "application/zip"))
      .rejects.toThrow("capture not found");
  });

  it("rejects a response with the wrong MIME type", async () => {
    mockedBackendFetch.mockResolvedValueOnce(new Response("plain text", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));

    await expect(fetchExportBlob("/api/export", "application/zip"))
      .rejects.toThrow("Export request failed (HTTP 200).");
  });

  it("propagates a backend network failure without producing a download", async () => {
    mockedBackendFetch.mockRejectedValueOnce(new Error("backend unavailable"));

    await expect(fetchExportBlob("/api/export", "application/zip"))
      .rejects.toThrow("backend unavailable");
  });

  it.each([
    ["application/zip", new Uint8Array([80, 75, 3, 4])],
    ["text/csv", "time,speed\n0,10"],
  ] as const)("returns a valid %s export blob", async (mimeType, content) => {
    const response = new Response(content, {
      status: 200,
      headers: { "content-type": `${mimeType}; charset=utf-8` },
    });
    mockedBackendFetch.mockResolvedValueOnce(response);

    const init = { method: "POST" };
    const blob = await fetchExportBlob("/api/export", mimeType, init);

    expect(blob.type.startsWith(mimeType)).toBe(true);
    expect(await blob.arrayBuffer()).toEqual(await new Response(content).arrayBuffer());
    expect(mockedBackendFetch).toHaveBeenCalledWith("/api/export", init);
  });
});
