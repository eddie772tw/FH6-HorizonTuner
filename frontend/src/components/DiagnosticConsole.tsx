import React, { useState, useEffect, useRef, useId } from 'react';
import { useSettings } from '../context/SettingsContext';
import { backendFetch } from '../services/backend';
import { fetchExportBlob } from '../services/fileSave';
import {
  SUPPORT_BUNDLE_PRIVACY_NOTICE,
  supportBundleRequestBody,
} from './diagnosticSupportBundle';
import { ModalPortal } from './common/ModalPortal';
import { useDialogTransition } from '../hooks/useDialogTransition';
import { useFileSave } from '../hooks/useFileSave';

interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface DiagnosticConsoleProps {
  show: boolean;
  onClose: () => void;
}

const DiagnosticConsole: React.FC<DiagnosticConsoleProps> = ({ show, onClose }) => {
  const { shown, close, panelRef, onTransitionEnd } = useDialogTransition(show, onClose);
  const { t } = useSettings();
  const titleId = useId();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const { save, isSaving } = useFileSave();
  
  const consoleRef = useRef<HTMLPreElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const cancelClearBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!show || isPaused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const fetchLogs = async () => {
      try {
        const res = await backendFetch(`/api/logs?level=${level}&limit=300`, { signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (data.logs) { setLogs(data.logs); setErrorMsg(prev => prev === t("Failed to clear logs on server.") ? prev : null); }
        else if (data.error) setErrorMsg(data.error);
      } catch {
        if (!controller.signal.aborted) setErrorMsg(t('Failed to connect to backend log API.'));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(fetchLogs, 1000);
      }
    };
    void fetchLogs();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [show, level, isPaused, t]);

  // Handle auto scroll
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const cancelConfirmation = () => {
    setConfirmClear(false);
    requestAnimationFrame(() => clearBtnRef.current?.focus());
  };

  useEffect(() => { if (!show) { setConfirmClear(false); setStatusMsg(null); } }, [show]);

  useEffect(() => {
    if (!show || !confirmClear) return;
    cancelClearBtnRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      cancelConfirmation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [show, confirmClear]);

  const handleClearLogs = async () => {
    setIsClearing(true);
    setStatusMsg(null);
    try {
      const res = await backendFetch('/api/logs', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLogs([]); setErrorMsg(null); setConfirmClear(false);
      setStatusMsg(t('No log messages matching filter.'));
      requestAnimationFrame(() => consoleRef.current?.focus());
    } catch {
      cancelConfirmation();
      setErrorMsg(t("Failed to clear logs on server."));
    } finally { setIsClearing(false); }
  };

  const handleExportSupportBundle = () => {
    void save({
      filename: 'fh6-diagnostic-support.zip',
      mimeType: 'application/zip',
      load: () => fetchExportBlob('/api/diagnostics/support-bundle', 'application/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: supportBundleRequestBody(),
      }),
    }).then(result => {
      if (result?.status === 'saved' || result?.status === 'downloaded') setErrorMsg(null);
    });
  };

  const getLogLevelColor = (lvl: string) => {
    switch (lvl.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'var(--bs-danger-text-emphasis)';
      case 'WARNING':
      case 'WARN':
        return 'var(--bs-warning-text-emphasis)';
      case 'DEBUG':
        return 'var(--bs-info-text-emphasis)';
      default:
        return 'var(--text-primary)';
    }
  };

  const getLogEntryStyle = (entry: LogEntry): React.CSSProperties => {
    const isTraceback = entry.message.includes("Traceback") || entry.message.includes("File \"");
    return {
      color: isTraceback ? 'var(--bs-danger-text-emphasis)' : getLogLevelColor(entry.level),
      fontStyle: isTraceback ? 'italic' : 'normal',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      marginBottom: '4px',
      display: 'block',
      paddingLeft: '10px',
      borderLeft: `2px solid ${isTraceback ? 'var(--bs-danger-text-emphasis)' : 'transparent'}`
    };
  };

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className={`offcanvas-backdrop fade${shown ? ' show' : ''}`}
        aria-hidden="true"
        style={{
          display: show ? 'block' : 'none',
          zIndex: 1040,
        }}
        onClick={close}
      />

      {/* Offcanvas panel */}
      <div
        className={`offcanvas offcanvas-end app-menu-drawer settings-drawer terminal-sidebar border-start glass-panel shadow-lg${shown ? ' show' : ''}`}
        ref={panelRef}
        onTransitionEnd={onTransitionEnd}
        tabIndex={-1}
        aria-modal="true"
        aria-hidden={!show}
        aria-labelledby={titleId}
        role="dialog"
        style={{
          zIndex: 1050,
        }}
      >
        {/* Header */}
        <div className="offcanvas-header border-bottom px-4 py-3 d-flex justify-content-between align-items-center">
          <h5 id={titleId} className="offcanvas-title text-primary fw-bold fs-6 m-0 d-flex align-items-center gap-2">
            {t("Diagnostic Log Console")}
          </h5>
          <button
            type="button"
            className="btn-close"
            onClick={close}
            aria-label={t("Close Console")}
          />
        </div>

        {/* Toolbar */}
        <div className="diagnostic-toolbar border-bottom px-4 py-2 d-flex justify-content-between align-items-center flex-wrap gap-2" style={{ background: 'var(--surface-1)' }}>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="log-level-select" className="form-label mb-0 text-body-secondary fs-7">{t("Log Level")}:</label>
              <select
                id="log-level-select"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="form-select form-select-sm"
                style={{ width: 'auto', minWidth: '110px' }}
              >
                <option value="ALL">{t("ALL")}</option>
                <option value="INFO">{t("INFO")}</option>
                <option value="WARNING">{t("WARNING")}</option>
                <option value="ERROR">{t("ERROR")}</option>
              </select>
            </div>

            <div className="form-check mb-0">
              <input
                type="checkbox"
                className="form-check-input"
                id="chk-auto-scroll"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <label className="form-check-label fs-7 text-body-secondary" htmlFor="chk-auto-scroll">
                {t("Auto Scroll")}
              </label>
            </div>

            <div className="form-check mb-0">
              <input
                type="checkbox"
                className="form-check-input"
                id="chk-pause"
                checked={isPaused}
                onChange={(e) => setIsPaused(e.target.checked)}
              />
              <label className="form-check-label fs-7 text-body-secondary" htmlFor="chk-pause">
                {t("Pause")}
              </label>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span
              className="d-inline-flex"
              title={t(SUPPORT_BUNDLE_PRIVACY_NOTICE)}
              style={isSaving ? { cursor: 'not-allowed' } : undefined}
            >
              <button
                type="button"
                onClick={handleExportSupportBundle}
                className="btn btn-outline-primary btn-sm fw-bold"
                disabled={isSaving}
                title={t(SUPPORT_BUNDLE_PRIVACY_NOTICE)}
                style={isSaving ? { pointerEvents: 'none' } : undefined}
              >
                {isSaving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
                    {t('Preparing Support Bundle...')}
                  </>
                ) : (
                  t('Download Support Bundle')
                )}
              </button>
            </span>
            {confirmClear ? (
              <div className="d-inline-flex align-items-center gap-1" role="group" aria-label={t("Are you sure you want to clear all logs?")}>
                <button ref={cancelClearBtnRef} type="button" onClick={cancelConfirmation} disabled={isClearing} className="btn btn-outline-secondary btn-sm">
                  {t("Cancel")}
                </button>
                <button type="button" onClick={() => void handleClearLogs()} disabled={isClearing} aria-busy={isClearing} className="btn btn-danger btn-sm fw-bold">
                  {isClearing && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                  {t("Confirm Clear")}
                </button>
              </div>
            ) : (
              <span className="d-inline-flex" title={logs.length === 0 ? t("No log messages matching filter.") : undefined} style={logs.length === 0 ? { cursor: 'not-allowed' } : undefined}>
                <button ref={clearBtnRef} type="button" onClick={() => setConfirmClear(true)} disabled={logs.length === 0} style={logs.length === 0 ? { pointerEvents: 'none' } : undefined} className="btn btn-outline-danger btn-sm fw-bold">
                  {t("Clear Logs")}
                </button>
              </span>
            )}
          </div>
        </div>

        <p className="px-4 py-2 mb-0 border-bottom text-body-secondary fs-8">
          {t(SUPPORT_BUNDLE_PRIVACY_NOTICE)}
        </p>

        {/* Offcanvas Body */}
        <div className="offcanvas-body p-0 d-flex flex-column flex-grow-1 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
          <div className="visually-hidden" role="status" aria-live="polite">{statusMsg ?? ''}</div>
          {errorMsg && (
            <div className="alert alert-danger mb-0 rounded-0 py-2 px-3 fs-7" role="alert">
              {errorMsg}
            </div>
          )}
          <pre
            ref={consoleRef}
            tabIndex={0}
            role="region"
            aria-label={t("Show Logs")}
            className="p-3 m-0 flex-grow-1 overflow-auto text-body"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace",
              fontSize: '0.85rem',
              lineHeight: '1.5',
            }}
          >
            {logs.length === 0 ? (
              <div className="text-body-secondary p-4 text-center">
                -- {t("No log messages matching filter.")} --
              </div>
            ) : (
              logs.map((entry, idx) => (
                <span key={idx} style={getLogEntryStyle(entry)}>
                  {entry.timestamp && <span className="text-secondary me-2">{entry.timestamp}</span>}
                  {entry.level && (
                    <span className="me-2 fw-bold badge text-body bg-secondary bg-opacity-25 fs-8">
                      [{entry.level}]
                    </span>
                  )}
                  {entry.logger && <span className="text-primary me-2">{entry.logger}:</span>}
                  <span>{entry.message}</span>
                </span>
              ))
            )}
          </pre>
        </div>
      </div>
    </ModalPortal>
  );
};


export default DiagnosticConsole;

