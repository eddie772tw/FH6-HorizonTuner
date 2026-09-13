import type { AnalysisDataPoint, SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { backendFetch } from "../../services/backend";
import type { SessionOperationGuard } from "./sessionSelection";

type SessionsFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * The feature owns these side-effect-free requests.  In particular, the
 * shared recorder's load/delete helpers write loadedSession before a caller
 * can verify a selection guard, so they are intentionally not used here.
 */
export interface SessionsIo {
  listSavedSessions(signal?: AbortSignal): Promise<readonly SavedSessionHeader[]>;
  readSavedSession(filename: string, signal?: AbortSignal): Promise<AnalysisDataPoint[] | null>;
  deleteSavedSession(filename: string, signal?: AbortSignal): Promise<boolean>;
  importMoTeCCsv(file: File, signal?: AbortSignal): Promise<AnalysisDataPoint[] | null>;
}

function isSavedSessionHeader(value: unknown): value is SavedSessionHeader {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedSessionHeader>;
  return typeof candidate.filename === "string" && candidate.filename.trim().length > 0
    && typeof candidate.session_id === "string" && candidate.session_id.trim().length > 0;
}

export function createSessionsIo(fetcher: SessionsFetch = backendFetch): SessionsIo {
  return {
    async listSavedSessions(signal?: AbortSignal): Promise<readonly SavedSessionHeader[]> {
      try {
        const response = await fetcher("/api/analysis/sessions", { signal });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.filter(isSavedSessionHeader) : [];
      } catch {
        return [];
      }
    },
    async readSavedSession(filename: string, signal?: AbortSignal): Promise<AnalysisDataPoint[] | null> {
      if (!filename) return null;
      try {
        const response = await fetcher(
          `/api/analysis/sessions/${encodeURIComponent(filename)}?lap=0`,
          { signal },
        );
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data) && data.length > 0
          ? data as AnalysisDataPoint[]
          : null;
      } catch {
        return null;
      }
    },
    async deleteSavedSession(filename: string, signal?: AbortSignal): Promise<boolean> {
      try {
        const response = await fetcher(
          `/api/analysis/sessions/${encodeURIComponent(filename)}`,
          { method: "DELETE", signal },
        );
        if (!response.ok) return false;
        const data = await response.json() as { error?: unknown } | null;
        return Boolean(data && !data.error);
      } catch {
        return false;
      }
    },
    async importMoTeCCsv(file: File, signal?: AbortSignal): Promise<AnalysisDataPoint[] | null> {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetcher("/api/analysis/import/motec", {
          method: "POST",
          body: formData,
          signal,
        });
        if (!response.ok) return null;
        const result = await response.json() as { error?: unknown; data?: unknown };
        return !result.error && Array.isArray(result.data)
          ? result.data as AnalysisDataPoint[]
          : null;
      } catch {
        return null;
      }
    },
  };
}

/** A latest request always reads the persisted library, never recorder cache. */
export async function resolveLatestSavedSession(
  io: Pick<SessionsIo, "listSavedSessions">,
  operation: SessionOperationGuard,
): Promise<SavedSessionHeader | null> {
  const sessions = await io.listSavedSessions();
  return operation.isCurrent() ? sessions[0] ?? null : null;
}

/** Analysis intents must keep using the concrete persisted identity they validated. */
export async function resolveSavedSession(
  io: Pick<SessionsIo, "listSavedSessions">,
  requestedIdentity: string,
  operation: SessionOperationGuard,
): Promise<SavedSessionHeader | null> {
  const sessions = await io.listSavedSessions();
  if (!operation.isCurrent()) return null;
  return sessions.find(session => (
    session.filename === requestedIdentity || session.session_id === requestedIdentity
  )) ?? null;
}
