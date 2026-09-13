import { describe, expect, it } from "vitest";
import type { AnalysisDataPoint, SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { RaceCompletionLifecycle } from "./raceLifecycle";
import { prepareAnalysisSessionIntent } from "./sessionIntentPreparation";
import { SessionOperationGate } from "./sessionSelection";

const headerA: SavedSessionHeader = { filename: "race-A", session_id: "race-A", size: 1, mtime: 1 };
const headerB: SavedSessionHeader = { filename: "race-B", session_id: "race-B", size: 1, mtime: 2 };
const samplesA = [{ time: 1 }] as AnalysisDataPoint[];
const samplesB = [{ time: 2 }] as AnalysisDataPoint[];

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type Stage = "list" | "samples" | "refresh";

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function createLifecycle(onCompleted: ConstructorParameters<typeof RaceCompletionLifecycle>[1]["onCompleted"]) {
  return new RaceCompletionLifecycle({
    readStatus: async () => ({ isRecording: false, currentSessionId: null }),
    readSessions: async () => [headerB, headerA],
    readSessionData: async sessionId => sessionId === "race-B" ? samplesB : samplesA,
  }, { onPending: () => undefined, onCompleted });
}

describe("race navigation handoff", () => {
  it.each<Stage>(["list", "samples", "refresh"])(
    "does not commit A when B starts during A's %s preflight stage",
    async stage => {
      const operations = new SessionOperationGate();
      const stageReached = deferred<void>();
      const releaseA = deferred<void>();
      let selected = "existing";
      let workspace = "live";
      let resultA: Promise<boolean> | undefined;
      let resultB: Promise<boolean> | undefined;

      const lifecycle = createLifecycle((completed, isCurrent) => {
        const isA = completed.filename === headerA.filename;
        const run = prepareAnalysisSessionIntent({ kind: "analysis", filename: completed.filename }, {
          io: {
            listSavedSessions: async () => {
              if (isA && stage === "list") {
                stageReached.resolve();
                await releaseA.promise;
              }
              return [completed];
            },
            readSavedSession: async () => {
              if (isA && stage === "samples") {
                stageReached.resolve();
                await releaseA.promise;
              }
              return completed.filename === headerA.filename ? samplesA : samplesB;
            },
          },
          operation: operations.begin(),
          isNavigationCurrent: isCurrent,
          refreshLibrary: async () => {
            if (isA && stage === "refresh") {
              stageReached.resolve();
              await releaseA.promise;
            }
          },
          apply: prepared => { selected = prepared.selection.filename; },
        }).then(ready => {
          if (ready && isCurrent()) workspace = "sessions";
          return ready;
        });
        if (isA) resultA = run;
        else resultB = run;
      });

      lifecycle.observeStatus({ isRecording: true, currentSessionId: headerA.session_id });
      lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
      await stageReached.promise;

      // A has handed its completed session to the real preflight and is now
      // blocked in the selected I/O stage. B must invalidate its callback.
      lifecycle.observeStatus({ isRecording: true, currentSessionId: headerB.session_id });
      releaseA.resolve();

      await expect(resultA).resolves.toBe(false);
      expect(selected).toBe("existing");
      expect(workspace).toBe("live");

      lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
      for (let index = 0; index < 12 && !resultB; index += 1) await Promise.resolve();
      await expect(resultB).resolves.toBe(true);

      expect(selected).toBe(headerB.filename);
      expect(workspace).toBe("sessions");
      lifecycle.dispose();
    },
  );

  it("does not commit a handed-off completion after lifecycle disposal", async () => {
    const operations = new SessionOperationGate();
    const refreshReached = deferred<void>();
    const releaseRefresh = deferred<void>();
    let selected = "existing";
    let workspace = "live";
    let result: Promise<boolean> | undefined;

    const lifecycle = createLifecycle((completed, isCurrent) => {
      result = prepareAnalysisSessionIntent({ kind: "analysis", filename: completed.filename }, {
        io: {
          listSavedSessions: async () => [completed],
          readSavedSession: async () => samplesA,
        },
        operation: operations.begin(),
        isNavigationCurrent: isCurrent,
        refreshLibrary: async () => {
          refreshReached.resolve();
          await releaseRefresh.promise;
        },
        apply: prepared => { selected = prepared.selection.filename; },
      }).then(ready => {
        if (ready && isCurrent()) workspace = "sessions";
        return ready;
      });
    });

    lifecycle.observeStatus({ isRecording: true, currentSessionId: headerA.session_id });
    lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
    await refreshReached.promise;

    lifecycle.dispose();
    releaseRefresh.resolve();

    await expect(result).resolves.toBe(false);
    expect(selected).toBe("existing");
    expect(workspace).toBe("live");
  });
});
