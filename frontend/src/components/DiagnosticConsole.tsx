import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { backendFetch } from '../services/backend';
import { fetchExportBlob } from '../services/fileSave';
import {
  SUPPORT_BUNDLE_PRIVACY_NOTICE,
  supportBundleRequestBody,
} from './diagnosticSupportBundle';
import { ModalPortal } from './common/ModalPortal';
import { useModalFocus } from '../hooks/useModalFocus';
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
  const panelRef = useModalFocus<HTMLDivElement>(show, onClose);
  const { t } = useSettings();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { save, isSaving } = useFileSave();
  
  const consoleRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!show || isPaused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const fetchLogs = async () => {
      try {
        const res = await backendFetch(`/api/logs?level=${level}&limit=300`, { signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (data.logs) { setLogs(data.logs); setErrorMsg(null); }
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

  // Clear logs
  const handleClearLogs = async () => {
    if (!window.confirm(t("Are you sure you want to clear all logs?"))) return;
    try {
      await backendFetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      alert(t("Failed to clear logs on server."));
    }
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
        return '#ff1744'; // Bright Red
      case 'WARNING':
      case 'WARN':
        return '#ffeb3b'; // Bright Yellow
      case 'DEBUG':
        return '#00e5ff'; // Cyan
      default:
        return '#e0e0e0'; // Light Gray
    }
  };

  const getLogEntryStyle = (entry: LogEntry): React.CSSProperties => {
    const isTraceback = entry.message.includes("Traceback") || entry.message.includes("File \"");
    return {
      color: isTraceback ? '#ff1744' : getLogLevelColor(entry.level),
      fontStyle: isTraceback ? 'italic' : 'normal',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      marginBottom: '4px',
      display: 'block',
      paddingLeft: '10px',
      borderLeft: `2px solid ${isTraceback ? '#ff1744' : 'transparent'}`
    };
  };

  return (
    <ModalPortal>
      {/* Backdrop */}
      <div
        className={`offcanvas-backdrop fade${show ? ' show' : ''}`}
        style={{
          display: show ? 'block' : 'none',
          zIndex: 1040,
        }}
        onClick={onClose}
      />

      {/* Offcanvas panel */}
      <div
        className={`offcanvas offcanvas-end settings-drawer terminal-sidebar border-start glass-panel shadow-lg${show ? ' show' : ''}`}
        ref={panelRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        style={{
          zIndex: 1050,
          visibility: show ? 'visible' : 'hidden',
          transition: 'transform 0.3s ease-in-out, visibility 0s linear 0s',
        }}
      >
        {/* Header */}
        <div className="offcanvas-header border-bottom px-4 py-2 d-flex justify-content-between align-items-center">
          <h5 className="offcanvas-title text-primary fw-bold fs-6 m-0 d-flex align-items-center gap-2">
            {t("Diagnostic Log Console")}
          </h5>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
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
            <button
              type="button"
              onClick={handleExportSupportBundle}
              className="btn btn-outline-primary btn-sm fw-bold"
              disabled={isSaving}
              title={t(SUPPORT_BUNDLE_PRIVACY_NOTICE)}
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
            <button
              onClick={handleClearLogs}
              className="btn btn-outline-danger btn-sm fw-bold"
            >
              {t("Clear Logs")}
            </button>
          </div>
        </div>

        <p className="px-4 py-2 mb-0 border-bottom text-body-secondary fs-8">
          {t(SUPPORT_BUNDLE_PRIVACY_NOTICE)}
        </p>

        {/* Offcanvas Body */}
        <div className="offcanvas-body p-0 d-flex flex-column flex-grow-1 overflow-hidden" style={{ background: '#050508' }}>
          {errorMsg && (
            <div className="alert alert-danger mb-0 rounded-0 py-2 px-3 fs-7">
              {errorMsg}
            </div>
          )}
          <pre
            ref={consoleRef}
            className="p-3 m-0 flex-grow-1 overflow-auto text-light"
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
                    <span className="me-2 fw-bold badge bg-secondary bg-opacity-25 fs-8">
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

