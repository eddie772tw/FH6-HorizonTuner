import { describe, expect, it, vi } from "vitest";
import { findCompletedSession, waitForCompletedRaceSession } from "./raceCompletion";

const session = {
  filename: "session-new",
  session_id: "session-new",
  size: 0,
  mtime: 1,
};

describe("race completion adapter", () => {
  it("matches only the recorded identity, not an older latest entry", () => {
    expect(findCompletedSession([{ ...session, filename: "older", session_id: "older" }], "session-new")).toBeNull();
    expect(findCompletedSession([session], "session-new")).toEqual(session);
  });

  it("waits for stopped status, persisted identity, and usable data", async () => {
    const readSessions = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([session]);
    const readData = vi.fn().mockResolvedValue([{ time: 0 }]);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCompletedRaceSession({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: null }),
      readSessions,
      readSessionData: readData,
    }, "session-new", { maxAttempts: 3, wait });

    expect(result).toEqual(session);
    expect(readData).toHaveBeenCalledWith("session-new");
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("does not treat a retry delay alone as proof of completion", async () => {
    const result = await waitForCompletedRaceSession({
      readStatus: vi.fn().mockResolvedValue({ isRecording: false, currentSessionId: null }),
      readSessions: vi.fn().mockResolvedValue([session]),
      readSessionData: vi.fn().mockResolvedValue([]),
    }, "session-new", { maxAttempts: 2, wait: vi.fn().mockResolvedValue(undefined) });

    expect(result).toBeNull();
  });

  it("stops a stale completion observer before it reads or schedules another retry", async () => {
    const readStatus = vi.fn();
    const wait = vi.fn();
    const result = await waitForCompletedRaceSession({
      readStatus,
      readSessions: vi.fn(),
      readSessionData: vi.fn(),
    }, "session-new", { isCurrent: () => false, wait });

    expect(result).toBeNull();
    expect(readStatus).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
});
