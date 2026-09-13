import type { AnalysisDataPoint } from "../../context/TelemetryRecorderContext";

/**
 * Analysis data has four mutually exclusive origins.  Keeping this type local
 * to Sessions prevents a Road workflow id from accidentally becoming a file
 * name in an analysis request.
 */
export type AnalysisSelection =
  | { readonly kind: "current" }
  | { readonly kind: "latest"; readonly filename: string }
  | { readonly kind: "saved"; readonly filename: string }
  | { readonly kind: "local" };

export function analysisSelectionKey(selection: AnalysisSelection): string {
  switch (selection.kind) {
    case "current":
      return "current";
    case "local":
      return "local";
    case "latest":
      return `latest:${selection.filename}`;
    case "saved":
      return `saved:${selection.filename}`;
  }
}

export function analysisSessionId(selection: AnalysisSelection): string | null {
  switch (selection.kind) {
    case "current":
      return "current";
    case "latest":
    case "saved":
      return selection.filename;
    case "local":
      return null;
  }
}

export function analysisDataPath(selection: AnalysisSelection, lap: number): string | null {
  const normalizedLap = Number.isInteger(lap) && lap > 0 ? lap : 0;
  if (selection.kind === "current") {
    return `/api/analysis/data?lap=${normalizedLap}`;
  }
  if (selection.kind === "latest" || selection.kind === "saved") {
    return `/api/analysis/sessions/${encodeURIComponent(selection.filename)}?lap=${normalizedLap}`;
  }
  return null;
}

/** Shell request sequence numbers are monotonic; an older request cannot win. */
export function shouldConsumeSessionRequest(previous: number | null, next: number): boolean {
  return previous === null || next > previous;
}

export interface SessionLoadGuard {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  cancel(): void;
}

/**
 * Guards a user operation which may later change the selected source.  It is
 * deliberately separate from SessionLoadGate: beginning an import or delete
 * must not abort the data currently being rendered, while a newer explicit
 * selection must still make the older operation ineligible to write.
 */
export interface SessionOperationGuard {
  isCurrent(): boolean;
}

export class SessionOperationGate {
  private generation = 0;
  private disposed = false;

  /** React effect replay can resume this owner without reviving older work. */
  activate(): void {
    this.disposed = false;
  }

  begin(): SessionOperationGuard {
    const generation = ++this.generation;
    return {
      isCurrent: () => !this.disposed && generation === this.generation,
    };
  }

  invalidate(): void {
    this.generation += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
}

/** Applies an async result only while the user operation still owns selection. */
export async function applyIfOperationCurrent<T>(
  operation: SessionOperationGuard,
  read: () => Promise<T>,
  apply: (value: T) => void,
): Promise<boolean> {
  const value = await read();
  if (!operation.isCurrent()) return false;
  apply(value);
  return true;
}

/**
 * One channel owns one gate.  A new selection invalidates the older request
 * before its response is allowed to write the shared recorder selection.
 */
export class SessionLoadGate {
  private generation = 0;
  private disposed = false;
  private activeController: AbortController | null = null;

  activate(): void {
    this.disposed = false;
  }

  begin(): SessionLoadGuard {
    this.activeController?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.activeController = controller;
    let cancelled = false;
    return {
      signal: controller.signal,
      isCurrent: () => !this.disposed && !cancelled && generation === this.generation,
      cancel: () => {
        cancelled = true;
        controller.abort();
        if (this.activeController === controller) this.activeController = null;
      },
    };
  }

  invalidate(): void {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = null;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
}

export interface AnalysisDataReader {
  read(path: string, signal: AbortSignal): Promise<unknown>;
}

/** Returns null for cancelled, stale, malformed, or local-source requests. */
export async function readSelectionData(
  reader: AnalysisDataReader,
  selection: AnalysisSelection,
  lap: number,
  guard: SessionLoadGuard,
): Promise<AnalysisDataPoint[] | null> {
  const path = analysisDataPath(selection, lap);
  if (!path) return null;
  try {
    const value = await reader.read(path, guard.signal);
    if (!guard.isCurrent() || !Array.isArray(value)) return null;
    return value as AnalysisDataPoint[];
  } catch {
    return null;
  }
}
