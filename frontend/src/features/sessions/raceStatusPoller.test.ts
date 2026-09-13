import { describe, expect, it, vi } from "vitest";
import { RaceStatusPoller } from "./raceStatusPoller";

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

describe("race status poller", () => {
  it("does not overlap status reads and forwards an authoritative transition once", async () => {
    let resolveRead: ((value: { isRecording: boolean; currentSessionId: string }) => void) | undefined;
    const readStatus = vi.fn(() => new Promise<{ isRecording: boolean; currentSessionId: string }>(resolve => {
      resolveRead = resolve;
    }));
    const observeStatus = vi.fn();
    const poller = new RaceStatusPoller(readStatus, observeStatus, 60_000);

    poller.start();
    poller.poll();
    expect(readStatus).toHaveBeenCalledTimes(1);

    resolveRead?.({ isRecording: true, currentSessionId: "race-new" });
    await flushAsyncWork();

    expect(observeStatus).toHaveBeenCalledWith({ isRecording: true, currentSessionId: "race-new" });
    poller.dispose();
  });

  it("cancels an in-flight read and suppresses its late result on unmount", async () => {
    let resolveRead: ((value: { isRecording: boolean; currentSessionId: string | null }) => void) | undefined;
    let signal: AbortSignal | undefined;
    const readStatus = vi.fn((requestSignal: AbortSignal) => new Promise<{ isRecording: boolean; currentSessionId: string | null }>(resolve => {
      signal = requestSignal;
      resolveRead = resolve;
    }));
    const observeStatus = vi.fn();
    const poller = new RaceStatusPoller(readStatus, observeStatus, 60_000);

    poller.start();
    poller.dispose();
    resolveRead?.({ isRecording: false, currentSessionId: null });
    await flushAsyncWork();

    expect(signal?.aborted).toBe(true);
    expect(observeStatus).not.toHaveBeenCalled();
  });

  it("forwards an unknown status without treating it as an inferred race stop", async () => {
    const observeStatus = vi.fn();
    const poller = new RaceStatusPoller(async () => null, observeStatus, 60_000);

    poller.start();
    await flushAsyncWork();

    expect(observeStatus).toHaveBeenCalledWith(null);
    poller.dispose();
  });
});
