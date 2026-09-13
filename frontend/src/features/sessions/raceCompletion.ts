import type { AnalysisDataPoint, SavedSessionHeader } from "../../context/TelemetryRecorderContext";

export interface AnalysisRecordingStatus {
  readonly isRecording: boolean;
  readonly currentSessionId: string | null;
}

export interface RaceCompletionReader {
  readStatus(): Promise<AnalysisRecordingStatus | null>;
  readSessions(): Promise<readonly SavedSessionHeader[]>;
  readSessionData(sessionId: string): Promise<AnalysisDataPoint[] | null>;
}

export interface RaceCompletionOptions {
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly isCurrent?: () => boolean;
}

export const RACE_COMPLETION_MAX_ATTEMPTS = 8;
export const RACE_COMPLETION_RETRY_DELAY_MS = 500;

export function findCompletedSession(
  sessions: readonly SavedSessionHeader[],
  expectedSessionId: string,
): SavedSessionHeader | null {
  return sessions.find(
    session => session.session_id === expectedSessionId || session.filename === expectedSessionId,
  ) ?? null;
}

/**
 * Completion is evidence-based: the recorder must stop, its exact identity
 * must appear in the persisted library, and that same identity must expose
 * usable data.  The delay is only a bounded retry cadence, never evidence.
 */
export async function waitForCompletedRaceSession(
  reader: RaceCompletionReader,
  expectedSessionId: string,
  options: RaceCompletionOptions = {},
): Promise<SavedSessionHeader | null> {
  const maxAttempts = options.maxAttempts ?? RACE_COMPLETION_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? RACE_COMPLETION_RETRY_DELAY_MS;
  const wait = options.wait ?? (milliseconds => new Promise<void>(resolve => globalThis.setTimeout(resolve, milliseconds)));
  const isCurrent = options.isCurrent ?? (() => true);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isCurrent()) return null;
    const status = await reader.readStatus();
    if (!isCurrent()) return null;
    if (status && !status.isRecording && status.currentSessionId !== expectedSessionId) {
      const session = findCompletedSession(await reader.readSessions(), expectedSessionId);
      if (!isCurrent()) return null;
      if (session) {
        const data = await reader.readSessionData(session.session_id);
        if (isCurrent() && data && data.length > 0) return session;
      }
    }
    if (attempt + 1 < maxAttempts && isCurrent()) await wait(retryDelayMs);
  }
  return null;
}
