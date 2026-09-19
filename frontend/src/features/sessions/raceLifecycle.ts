import type { SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { type RaceCompletionReader, waitForCompletedRaceSession } from "./raceCompletion";

export interface RaceCompletionLifecycleHooks {
  onPending(sessionId: string): void;
  onCompleted(session: SavedSessionHeader): void;
}

interface ActiveRace {
  readonly token: number;
  ended: boolean;
  capturedSessionId: string | null;
  completionGeneration: number;
}

/**
 * Owns the race-edge lifecycle independently from React polling state. A
 * recorder ID is accepted only from the status request started for this race;
 * a delayed result after race end is forwarded directly to validation instead
 * of writing an ID that a later race could inherit.
 */
export class RaceCompletionLifecycle {
  private nextToken = 0;
  private activeRace: ActiveRace | null = null;
  private disposed = false;

  constructor(
    private readonly reader: RaceCompletionReader,
    private readonly hooks: RaceCompletionLifecycleHooks,
  ) {}

  beginRace(): void {
    const race: ActiveRace = {
      token: ++this.nextToken,
      ended: false,
      capturedSessionId: null,
      completionGeneration: 0,
    };
    this.activeRace = race;
    void this.captureStartIdentity(race);
  }

  endRace(): void {
    const race = this.activeRace;
    if (!race || !this.isCurrentRace(race)) return;
    race.ended = true;
    if (race.capturedSessionId) this.startCompletionValidation(race, race.capturedSessionId);
  }

  retry(sessionId: string): void {
    const race = this.activeRace;
    if (!race || !race.ended || !this.isCurrentRace(race)) return;
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
      this.hooks.onCompleted(completed);
    }
  }
}
