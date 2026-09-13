import type { SessionIntent } from "../../app/workspaceManifest";
import type { AnalysisDataPoint, SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import type { SessionOperationGuard } from "./sessionSelection";
import type { SessionsIo } from "./sessionsIo";

export interface PreparedAnalysisSession {
  readonly selection: { readonly kind: "latest" | "saved"; readonly filename: string };
  readonly samples: AnalysisDataPoint[];
}

export interface SessionIntentPreparationDependencies {
  readonly io: Pick<SessionsIo, "listSavedSessions" | "readSavedSession">;
  readonly operation: SessionOperationGuard;
  readonly isNavigationCurrent: () => boolean;
  readonly refreshLibrary: () => Promise<void>;
  readonly apply: (prepared: PreparedAnalysisSession) => void;
}

function isCurrent(
  operation: SessionOperationGuard,
  isNavigationCurrent: () => boolean,
): boolean {
  return operation.isCurrent() && isNavigationCurrent();
}

function findRequestedHeader(
  sessions: readonly SavedSessionHeader[],
  intent: Extract<SessionIntent, { kind: "analysis" | "latest-analysis" }>,
): SavedSessionHeader | null {
  if (intent.kind === "latest-analysis") return sessions[0] ?? null;
  return sessions.find(session => (
    session.filename === intent.filename || session.session_id === intent.filename
  )) ?? null;
}

/**
 * Prepares an analysis selection without mutating the recorder or provider.
 * A caller commits only after every persisted read and navigation ownership
 * check has succeeded, so a failed request leaves the rendered session intact.
 */
export async function prepareAnalysisSessionIntent(
  intent: Extract<SessionIntent, { kind: "analysis" | "latest-analysis" }>,
  dependencies: SessionIntentPreparationDependencies,
): Promise<boolean> {
  const { io, operation, isNavigationCurrent, refreshLibrary, apply } = dependencies;
  if (!isCurrent(operation, isNavigationCurrent)) return false;

  let sessions: readonly SavedSessionHeader[];
  try {
    sessions = await io.listSavedSessions();
  } catch {
    return false;
  }
  if (!isCurrent(operation, isNavigationCurrent)) return false;

  const header = findRequestedHeader(sessions, intent);
  if (!header) return false;

  let samples: AnalysisDataPoint[] | null;
  try {
    samples = await io.readSavedSession(header.filename);
  } catch {
    return false;
  }
  if (!samples || samples.length === 0 || !isCurrent(operation, isNavigationCurrent)) return false;

  // The recorder owns its displayed library. Refresh it only after the same
  // persisted identity and data have already been verified, and never let a
  // stale navigation start or complete that side effect.
  if (!isCurrent(operation, isNavigationCurrent)) return false;
  try {
    await refreshLibrary();
  } catch {
    return false;
  }
  if (!isCurrent(operation, isNavigationCurrent)) return false;

  apply({
    selection: { kind: intent.kind === "latest-analysis" ? "latest" : "saved", filename: header.filename },
    samples,
  });
  return true;
}
