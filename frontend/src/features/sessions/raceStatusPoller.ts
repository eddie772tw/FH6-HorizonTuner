import type { AnalysisRecordingStatus } from "./raceCompletion";

export const RACE_STATUS_POLL_INTERVAL_MS = 1_000;

/**
 * Owns one low-frequency status request at a time. A missing or failed status
 * is delivered as unknown, never interpreted as a recorder stop.
 */
export class RaceStatusPoller {
  private timer: ReturnType<typeof globalThis.setInterval> | null = null;
  private inFlight = false;
  private disposed = false;
  private activeController: AbortController | null = null;

  constructor(
    private readonly readStatus: (signal: AbortSignal) => Promise<AnalysisRecordingStatus | null>,
    private readonly observeStatus: (status: AnalysisRecordingStatus | null) => void,
    private readonly intervalMs = RACE_STATUS_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.timer !== null || this.disposed) return;
    this.poll();
    this.timer = globalThis.setInterval(() => this.poll(), this.intervalMs);
  }

  poll(): void {
    if (this.disposed || this.inFlight) return;
    const controller = new AbortController();
    this.activeController = controller;
    this.inFlight = true;
    void this.readStatus(controller.signal)
      .then(status => {
        if (!this.disposed && !controller.signal.aborted) this.observeStatus(status);
      })
      .catch(() => {
        if (!this.disposed && !controller.signal.aborted) this.observeStatus(null);
      })
      .finally(() => {
        this.inFlight = false;
        if (this.activeController === controller) this.activeController = null;
      });
  }

  dispose(): void {
    this.disposed = true;
    this.activeController?.abort();
    this.activeController = null;
    if (this.timer !== null) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
