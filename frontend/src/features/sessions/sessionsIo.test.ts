import { describe, expect, it } from "vitest";
import { SessionOperationGate } from "./sessionSelection";
import { createSessionsIo, resolveLatestSavedSession, resolveSavedSession } from "./sessionsIo";

const older = { filename: "older", session_id: "older", size: 1, mtime: 1 };
const newest = { filename: "newest", session_id: "newest", size: 1, mtime: 2 };

describe("sessions I/O adapter", () => {
  it("resolves latest from the fresh persisted library, not a caller cache", async () => {
    const operation = new SessionOperationGate().begin();
    const latest = await resolveLatestSavedSession({
      listSavedSessions: async () => [newest, older],
    }, operation);

    expect(latest).toEqual(newest);
  });

  it("keeps the exact validated identity when reconciling a race completion", async () => {
    const operation = new SessionOperationGate().begin();
    const resolved = await resolveSavedSession({
      listSavedSessions: async () => [newest, older],
    }, "newest", operation);

    expect(resolved?.filename).toBe("newest");
  });

  it("drops a latest response once a newer selection operation begins", async () => {
    let resolveList: ((value: readonly typeof older[]) => void) | undefined;
    const operations = new SessionOperationGate();
    const olderOperation = operations.begin();
    const latest = resolveLatestSavedSession({
      listSavedSessions: () => new Promise(resolve => { resolveList = resolve; }),
    }, olderOperation);

    operations.begin();
    resolveList?.([older]);

    await expect(latest).resolves.toBeNull();
  });

  it("treats a failed, malformed, or empty saved-data response as unreadable", async () => {
    const failed = createSessionsIo(async () => ({ ok: false, json: async () => [{ time: 0 }] }) as Response);
    await expect(failed.readSavedSession("newest")).resolves.toBeNull();

    const empty = createSessionsIo(async () => ({ ok: true, json: async () => [] }) as Response);
    await expect(empty.readSavedSession("newest")).resolves.toBeNull();

    const malformed = createSessionsIo(async () => ({ ok: true, json: async () => ({ error: "paused" }) }) as Response);
    await expect(malformed.readSavedSession("newest")).resolves.toBeNull();
  });

  it("reads nonempty saved samples without mutating a shared recorder", async () => {
    const requests: string[] = [];
    const io = createSessionsIo(async (path) => {
      requests.push(path);
      return { ok: true, json: async () => [{ time: 0 }] } as Response;
    });

    await expect(io.readSavedSession("folder/session A")).resolves.toEqual([{ time: 0 }]);
    expect(requests).toEqual(["/api/analysis/sessions/folder%2Fsession%20A?lap=0"]);
  });
});
