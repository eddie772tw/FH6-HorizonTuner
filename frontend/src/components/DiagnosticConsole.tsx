import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';

interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface DiagnosticConsoleProps {
  onClose: () => void;
}

const DiagnosticConsole: React.FC<DiagnosticConsoleProps> = ({ onClose }) => {
  const { t } = useSettings();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const consoleRef = useRef<HTMLPreElement>(null);

  // Fetch logs
  const fetchLogs = async () => {
    if (isPaused) return;
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/logs?level=${level}&limit=300`);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
        setErrorMsg(null);
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend log API.");
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);
    return () => clearInterval(interval);
  }, [level, isPaused]);

  // Handle auto scroll
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Clear logs
  const handleClearLogs = async () => {
    if (!window.confirm(t("Are you sure you want to clear all logs?") || "確定要清空所有日誌嗎？")) return;
    try {
      await fetch('http://127.0.0.1:8001/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      alert("Failed to clear logs on server.");
    }
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
    <div style={modalOverlayStyle}>
      <div style={modalWindowStyle}>
        {/* Header */}
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, color: 'var(--primary)', textShadow: '0 0 8px rgba(0, 240, 255, 0.4)' }}>
            💻 {t("Diagnostic Log Console") || "診斷主控台"}
          </h3>
          <button style={closeBtnStyle} onClick={onClose}>&times;</button>
        </div>

        {/* Toolbar */}
        <div style={toolbarStyle}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t("Log Level") || "日誌層級"}:</span>
              <select 
                value={level} 
                onChange={(e) => setLevel(e.target.value)} 
                className="cyber-select"
                style={{ padding: '0.3rem 0.6rem', minWidth: '100px' }}
              >
                <option value="ALL">ALL</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={autoScroll} 
                onChange={(e) => setAutoScroll(e.target.checked)} 
                style={{ accentColor: 'var(--primary)' }}
              />
              {t("Auto Scroll") || "自動滾動"}
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={isPaused} 
                onChange={(e) => setIsPaused(e.target.checked)} 
                style={{ accentColor: 'var(--primary)' }}
              />
              {t("Pause") || "暫停"}
            </label>
          </div>

          <button 
            onClick={handleClearLogs} 
            className="cyber-btn-glow"
            style={clearBtnStyle}
          >
            🗑️ {t("Clear Logs") || "清除日誌"}
          </button>
        </div>

        {/* Console Body */}
        <div style={consoleBodyStyle}>
          {errorMsg && (
            <div style={{ color: '#ff1744', padding: '10px', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,23,68,0.2)', backgroundColor: 'rgba(255,23,68,0.05)' }}>
              ⚠️ {errorMsg}
            </div>
          )}
          <pre 
            ref={consoleRef} 
            style={consoleOutputStyle}
          >
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>
                -- {t("No log messages matching filter.") || "目前沒有符合篩選條件的日誌。"} --
              </div>
            ) : (
              logs.map((entry, idx) => (
                <span key={idx} style={getLogEntryStyle(entry)}>
                  {entry.timestamp && <span style={{ color: '#888', marginRight: '8px' }}>{entry.timestamp}</span>}
                  {entry.level && (
                    <span style={{ 
                      marginRight: '8px', 
                      fontWeight: 'bold', 
                      fontSize: '0.8rem',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(255,255,255,0.05)' 
                    }}>
                      [{entry.level}]
                    </span>
                  )}
                  {entry.logger && <span style={{ color: 'var(--primary)', marginRight: '8px' }}>{entry.logger}:</span>}
                  <span>{entry.message}</span>
                </span>
              ))
            )}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Inline Styles
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(5px)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '2rem',
};

const modalWindowStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '900px',
  height: '80vh',
  backgroundColor: 'rgba(11, 12, 16, 0.95)',
  border: '1px solid var(--primary)',
  boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: '1.8rem',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
  transition: 'color 0.2s',
};

const toolbarStyle: React.CSSProperties = {
  padding: '0.8rem 1.5rem',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  background: 'rgba(255,255,255,0.02)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const clearBtnStyle: React.CSSProperties = {
  background: 'rgba(255,0,60,0.1)',
  border: '1px solid rgba(255,0,60,0.3)',
  color: '#ff003c',
  padding: '0.4rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 'bold',
};

const consoleBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#050508',
};

const consoleOutputStyle: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: '1.2rem',
  overflowY: 'auto',
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace",
  fontSize: '0.85rem',
  lineHeight: '1.5',
  color: '#f0f0f0',
};

export default DiagnosticConsole;
