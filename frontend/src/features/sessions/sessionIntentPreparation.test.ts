import { describe, expect, it, vi } from "vitest";
import { SessionOperationGate } from "./sessionSelection";
import { prepareAnalysisSessionIntent, type PreparedAnalysisSession } from "./sessionIntentPreparation";

const older = { filename: "older", session_id: "older", size: 1, mtime: 1 };
const newest = { filename: "newest", session_id: "newest", size: 1, mtime: 2 };
const samples = [{ time: 0 }] as any[];

function createDependencies(overrides: Partial<Parameters<typeof prepareAnalysisSessionIntent>[1]> = {}) {
  const operations = new SessionOperationGate();
  const apply = vi.fn<(prepared: PreparedAnalysisSession) => void>();
  const refreshLibrary = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return {
    operations,
    apply,
    refreshLibrary,
    dependencies: {
      io: {
        listSavedSessions: vi.fn().mockResolvedValue([newest, older]),
        readSavedSession: vi.fn().mockResolvedValue(samples),
      },
      operation: operations.begin(),
      isNavigationCurrent: () => true,
      refreshLibrary,
      apply,
      ...overrides,
    },
  };
}

describe("session intent preparation", () => {
  it.each([
    ["failed library read", { listSavedSessions: vi.fn().mockResolvedValue([]) }],
    ["missing requested header", { listSavedSessions: vi.fn().mockResolvedValue([older]) }],
    ["empty target samples", { readSavedSession: vi.fn().mockResolvedValue([]) }],
  ])("keeps the existing selection and data for a %s", async (_name, ioOverrides) => {
    const { dependencies, apply, refreshLibrary } = createDependencies({
      io: { ...createDependencies().dependencies.io, ...ioOverrides },
    });

    await expect(prepareAnalysisSessionIntent(
      { kind: "analysis", filename: "newest" },
      dependencies,
    )).resolves.toBe(false);

    expect(apply).not.toHaveBeenCalled();
    expect(refreshLibrary).not.toHaveBeenCalled();
  });

  it("commits an explicit and latest request with the same freshly read file", async () => {
    const explicit = createDependencies();
    await expect(prepareAnalysisSessionIntent(
      { kind: "analysis", filename: "newest" },
      explicit.dependencies,
    )).resolves.toBe(true);

    const latest = createDependencies();
    await expect(prepareAnalysisSessionIntent(
      { kind: "latest-analysis" },
      latest.dependencies,
    )).resolves.toBe(true);

    expect(explicit.apply).toHaveBeenCalledWith({ selection: { kind: "saved", filename: "newest" }, samples });
    expect(latest.apply).toHaveBeenCalledWith({ selection: { kind: "latest", filename: "newest" }, samples });
  });

  it("lets a newer request cancel an older one before recorder or selection effects", async () => {
    let resolveList: ((value: readonly typeof newest[]) => void) | undefined;
    const { operations, dependencies, apply, refreshLibrary } = createDependencies({
      io: {
        listSavedSessions: () => new Promise(resolve => { resolveList = resolve; }),
        readSavedSession: vi.fn(),
      },
    });
    const pending = prepareAnalysisSessionIntent({ kind: "analysis", filename: "newest" }, dependencies);

    operations.begin();
    resolveList?.([newest]);

    await expect(pending).resolves.toBe(false);
    expect(refreshLibrary).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("lets a later workspace cancel a request before it writes state", async () => {
    let resolveSamples: ((value: any[]) => void) | undefined;
    let navigationCurrent = true;
    const { dependencies, apply, refreshLibrary } = createDependencies({
      io: {
        listSavedSessions: vi.fn().mockResolvedValue([newest]),
        readSavedSession: () => new Promise(resolve => { resolveSamples = resolve; }),
      },
      isNavigationCurrent: () => navigationCurrent,
    });
    const pending = prepareAnalysisSessionIntent({ kind: "analysis", filename: "newest" }, dependencies);

    await Promise.resolve();
    navigationCurrent = false;
    resolveSamples?.(samples);

    await expect(pending).resolves.toBe(false);
    expect(refreshLibrary).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
