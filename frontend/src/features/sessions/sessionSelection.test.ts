import { describe, expect, it } from "vitest";
import {
  analysisDataPath,
  applyIfOperationCurrent,
  SessionLoadGate,
  SessionOperationGate,
  readSelectionData,
  shouldConsumeSessionRequest,
} from "./sessionSelection";

describe("session selection adapter", () => {
  it("keeps current, saved, and local data sources separate", () => {
    expect(analysisDataPath({ kind: "current" }, 2)).toBe("/api/analysis/data?lap=2");
    expect(analysisDataPath({ kind: "saved", filename: "session/a" }, 0)).toBe("/api/analysis/sessions/session%2Fa?lap=0");
    expect(analysisDataPath({ kind: "local" }, 0)).toBeNull();
  });

  it("rejects a stale async response before it can become the loaded selection", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const reader = {
      read: () => new Promise<unknown>(resolve => { resolveFirst = resolve; }),
    };
    const gate = new SessionLoadGate();
    const staleGuard = gate.begin();
    const stale = readSelectionData(reader, { kind: "saved", filename: "older" }, 0, staleGuard);
    const currentGuard = gate.begin();
    const current = readSelectionData({ read: async () => [{ time: 2 }] }, { kind: "saved", filename: "newer" }, 0, currentGuard);

    resolveFirst?.([{ time: 1 }]);
    await expect(stale).resolves.toBeNull();
    await expect(current).resolves.toEqual([{ time: 2 }]);
  });

  it("invalidates a request when its owner unmounts", () => {
    const gate = new SessionLoadGate();
    const request = gate.begin();
    gate.dispose();
    expect(request.isCurrent()).toBe(false);
  });

  it("aborts the active request before a newer selection starts", () => {
    const gate = new SessionLoadGate();
    const older = gate.begin();
    gate.begin();
    expect(older.signal.aborted).toBe(true);
  });

  it("resumes loads after effect replay without reviving pre-cleanup work", async () => {
    const gate = new SessionLoadGate();
    const oldRequest = gate.begin();
    gate.dispose();
    // Child effects can start a request before the provider's setup runs.
    const replayRequest = gate.begin();
    gate.activate();
    expect(oldRequest.isCurrent()).toBe(false);
    expect(oldRequest.signal.aborted).toBe(true);
    await expect(readSelectionData({ read: async () => [{ time: 2 }] },
      { kind: "saved", filename: "replayed" }, 0, replayRequest)).resolves.toEqual([{ time: 2 }]);
  });

  it("resumes selection operations while keeping a pre-cleanup import stale", () => {
    const gate = new SessionOperationGate();
    const oldImport = gate.begin();
    gate.dispose();
    gate.activate();
    expect(oldImport.isCurrent()).toBe(false);
    expect(gate.begin().isCurrent()).toBe(true);
  });

  it("consumes a request sequence once and never lets an older intent win", () => {
    expect(shouldConsumeSessionRequest(null, 3)).toBe(true);
    expect(shouldConsumeSessionRequest(3, 3)).toBe(false);
    expect(shouldConsumeSessionRequest(3, 2)).toBe(false);
    expect(shouldConsumeSessionRequest(3, 4)).toBe(true);
  });

  it("does not apply a late import result after a newer source selection", async () => {
    let resolveImport: ((value: readonly string[]) => void) | undefined;
    const operations = new SessionOperationGate();
    const importOperation = operations.begin();
    const applied: string[][] = [];
    const importResult = applyIfOperationCurrent(
      importOperation,
      () => new Promise<readonly string[]>(resolve => { resolveImport = resolve; }),
      data => { applied.push(data); },
    );

    // Selecting a saved session is newer user intent than the pending import.
    operations.invalidate();
    resolveImport?.(["imported"]);

    await expect(importResult).resolves.toBe(false);
    expect(applied).toEqual([]);
  });

  it("does not let a late delete reset a newer saved selection", async () => {
    let resolveDeletion: ((value: boolean) => void) | undefined;
    const operations = new SessionOperationGate();
    const deletion = operations.begin();
    let selection = "saved-A";
    const deleteResult = applyIfOperationCurrent(
      deletion,
      () => new Promise<boolean>(resolve => { resolveDeletion = resolve; }),
      success => {
        if (success) selection = "current";
      },
    );

    selection = "saved-B";
    operations.invalidate();
    resolveDeletion?.(true);

    await expect(deleteResult).resolves.toBe(false);
    expect(selection).toBe("saved-B");
  });
});
