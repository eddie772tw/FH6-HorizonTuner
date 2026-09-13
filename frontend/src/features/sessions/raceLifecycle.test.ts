import { describe, expect, it, vi } from "vitest";
import { RaceCompletionLifecycle } from "./raceLifecycle";

const completed = { filename: "race-new", session_id: "race-new", size: 1, mtime: 2 };

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("race completion lifecycle", () => {
  it("validates a start-confirmed identity even when its status response arrives after race end", async () => {
    let resolveStart: ((value: { isRecording: boolean; currentSessionId: string | null }) => void) | undefined;
    const readStatus = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveStart = resolve; }))
      .mockResolvedValue({ isRecording: false, currentSessionId: null });
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus,
      readSessions: vi.fn().mockResolvedValue([completed]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onPending: vi.fn(), onCompleted });

    lifecycle.beginRace();
    lifecycle.endRace();
    resolveStart?.({ isRecording: true, currentSessionId: "race-new" });
    await flushAsyncWork();

    expect(onCompleted).toHaveBeenCalledWith(completed, expect.any(Function));
  });

  it("does not validate a prior session ID without current-race status confirmation", async () => {
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: "race-prior" }),
      readSessions: vi.fn().mockResolvedValue([{ ...completed, filename: "race-prior", session_id: "race-prior" }]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onPending: vi.fn(), onCompleted });

    lifecycle.beginRace();
    lifecycle.endRace();
    await flushAsyncWork();

    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("uses a recording identity transition, while an unknown status never ends a race", async () => {
    const onStarted = vi.fn();
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: null }),
      readSessions: vi.fn().mockResolvedValue([completed]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onStarted, onPending: vi.fn(), onCompleted });

    lifecycle.observeStatus({ isRecording: true, currentSessionId: "race-new" });
    lifecycle.observeStatus(null);
    await flushAsyncWork();
    expect(onCompleted).not.toHaveBeenCalled();

    lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
    await flushAsyncWork();

    expect(onStarted).toHaveBeenCalledWith("race-new");
    expect(onCompleted).toHaveBeenCalledWith(completed, expect.any(Function));
  });

  it("cancels an older completion when a newer recorder identity starts", async () => {
    let resolveCompletionStatus: ((value: { isRecording: boolean; currentSessionId: string | null }) => void) | undefined;
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus: vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveCompletionStatus = resolve; })),
      readSessions: vi.fn().mockResolvedValue([completed]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onPending: vi.fn(), onCompleted });

    lifecycle.observeStatus({ isRecording: true, currentSessionId: "race-old" });
    lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
    await Promise.resolve();
    lifecycle.observeStatus({ isRecording: true, currentSessionId: "race-new" });
    resolveCompletionStatus?.({ isRecording: false, currentSessionId: null });
    await flushAsyncWork();

    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("ignores a stale retry for another race without invalidating the current completion", async () => {
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: null }),
      readSessions: vi.fn().mockResolvedValue([completed]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onPending: vi.fn(), onCompleted });

    lifecycle.observeStatus({ isRecording: true, currentSessionId: completed.session_id });
    lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
    await flushAsyncWork();
    const isCurrent = onCompleted.mock.calls[0][1] as () => boolean;

    lifecycle.retry("race-prior");
    await flushAsyncWork();

    expect(isCurrent()).toBe(true);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
  });

  it("replaces completion ownership when the same race is explicitly retried", async () => {
    const onCompleted = vi.fn();
    const lifecycle = new RaceCompletionLifecycle({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: null }),
      readSessions: vi.fn().mockResolvedValue([completed]),
      readSessionData: vi.fn().mockResolvedValue([{ time: 0 }]),
    }, { onPending: vi.fn(), onCompleted });

    lifecycle.observeStatus({ isRecording: true, currentSessionId: completed.session_id });
    lifecycle.observeStatus({ isRecording: false, currentSessionId: null });
    await flushAsyncWork();
    const firstIsCurrent = onCompleted.mock.calls[0][1] as () => boolean;
    lifecycle.retry(completed.session_id);
    await flushAsyncWork();

    expect(firstIsCurrent()).toBe(false);
    expect(onCompleted).toHaveBeenCalledTimes(2);
    expect((onCompleted.mock.calls[1][1] as () => boolean)()).toBe(true);
    lifecycle.dispose();
  });
});
