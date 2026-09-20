import type { SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import {
  type AnalysisRecordingStatus,
  type RaceCompletionReader,
  waitForCompletedRaceSession,
} from "./raceCompletion";

export interface RaceCompletionLifecycleHooks {
  onStarted?(sessionId: string): void;
  onPending(sessionId: string): void;
  onCompleted(session: SavedSessionHeader, isCurrent: () => boolean): void;
}

interface ActiveRace {
  readonly token: number;
  ended: boolean;
  capturedSessionId: string | null;
  completionGeneration: number;
}

/**
 * Owns recorder identity transitions independently from React. Only an
 * authoritative status response that is recording with an identity can begin
 * a race; unknown status responses never imply its end.
 */
export class RaceCompletionLifecycle {
  private nextToken = 0;
  private activeRace: ActiveRace | null = null;
  private disposed = false;

  constructor(
    private readonly reader: RaceCompletionReader,
    private readonly hooks: RaceCompletionLifecycleHooks,
  ) {}

  beginRace(sessionId?: string): void {
    const race: ActiveRace = {
      token: ++this.nextToken,
      ended: false,
      capturedSessionId: sessionId ?? null,
      completionGeneration: 0,
    };
    this.activeRace = race;
    if (sessionId) {
      this.hooks.onStarted?.(sessionId);
    } else {
      // Kept for direct callers while they migrate to observeStatus. Runtime
      // transitions supply the identity synchronously from the same status.
      void this.captureStartIdentity(race);
    }
  }

  observeStatus(status: AnalysisRecordingStatus | null): void {
    if (this.disposed || !status) return;
    if (status.isRecording) {
      if (!status.currentSessionId) return;
      const race = this.activeRace;
      if (!race || !this.isCurrentRace(race) || race.ended || race.capturedSessionId !== status.currentSessionId) {
        this.beginRace(status.currentSessionId);
      }
      return;
    }
    this.endRace();
  }

  endRace(): void {
    const race = this.activeRace;
    if (!race || race.ended || !this.isCurrentRace(race)) return;
    race.ended = true;
    if (race.capturedSessionId) this.startCompletionValidation(race, race.capturedSessionId);
  }

  retry(sessionId: string): void {
    const race = this.activeRace;
    if (!race || !race.ended || !this.isCurrentRace(race)) return;
    if (race.capturedSessionId !== null && race.capturedSessionId !== sessionId) return;
    this.startCompletionValidation(race, sessionId);
  }

  dispose(): void {
    this.disposed = true;
    this.activeRace = null;
  }

  private isCurrentRace(race: ActiveRace): boolean {
    return !this.disposed && this.activeRace === race && race.token === this.nextToken;
  }

  private async captureStartIdentity(race: ActiveRace): Promise<void> {
    const status = await this.reader.readStatus();
    if (!this.isCurrentRace(race) || !status?.isRecording || !status.currentSessionId) return;

    const sessionId = status.currentSessionId;
    if (race.ended) {
      // Race end has closed capture state. Do not write this late value into a
      // ref; validate this exact, start-confirmed identity immediately.
      this.startCompletionValidation(race, sessionId);
      return;
    }
    race.capturedSessionId = sessionId;
    this.hooks.onStarted?.(sessionId);
  }

  private startCompletionValidation(race: ActiveRace, sessionId: string): void {
    if (!this.isCurrentRace(race) || !race.ended) return;
    const generation = ++race.completionGeneration;
    this.hooks.onPending(sessionId);
    void this.validateCompletion(race, sessionId, generation);
  }

  private async validateCompletion(
    race: ActiveRace,
    sessionId: string,
    generation: number,
  ): Promise<void> {
    const completed = await waitForCompletedRaceSession(this.reader, sessionId, {
      isCurrent: () => this.isCurrentRace(race) && race.completionGeneration === generation,
    });
    if (completed && this.isCurrentRace(race) && race.completionGeneration === generation) {
      // The consumer may still need asynchronous reads before committing its
      // selection. Keep this race's ownership valid through that handoff.
      this.hooks.onCompleted(completed, () => this.isCurrentRace(race) && race.completionGeneration === generation);
    }
  }
}
