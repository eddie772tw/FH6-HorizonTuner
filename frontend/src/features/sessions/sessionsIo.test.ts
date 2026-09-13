import { describe, expect, it } from "vitest";
import { SessionOperationGate } from "./sessionSelection";
import { resolveLatestSavedSession, resolveSavedSession } from "./sessionsIo";

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
});
