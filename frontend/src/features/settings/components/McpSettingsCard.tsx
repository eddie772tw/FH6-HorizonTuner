import React, { useState, useEffect } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import { backendFetch } from '../../../services/backend';

interface McpStatus {
  enabled: boolean;
  allow_live: boolean;
  max_downsample: number;
  active_sse_clients: number;
  total_requests_served: number;
  sse_endpoint: string;
  stdio_command: string;
}

export const McpSettingsCard: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();
  const { addToast } = useToast();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [isCopied, setIsCopied] = useState<string | null>(null);

  const mcpEnabled = settings.mcp_enabled !== false;
  const allowLive = settings.mcp_allow_live !== false;
  const maxDownsample = settings.mcp_max_downsample || 500;

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const data = await backendFetch<McpStatus>('/api/mcp/status');
        if (isMounted && data) {
          setStatus(data);
        }
      } catch {
        // Ignored if backend status endpoint is unreachable
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const copyToClipboard = async (text: string, labelKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(labelKey);
      addToast({
        type: 'success',
        title: t('Copied to Clipboard'),
        message: t('Configuration copied successfully.'),
        duration: 3000,
      });
      setTimeout(() => setIsCopied(null), 2000);
    } catch {
      addToast({
        type: 'danger',
        title: t('Copy Failed'),
        message: t('Unable to copy text to clipboard.'),
        duration: 4000,
      });
    }
  };

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        'fh6-horizon-tuner': {
          command: 'python',
          args: ['-u', 'backend/mcp/server.py'],
        },
      },
    },
    null,
    2
  );

  const cursorCommandSnippet = 'uv run --no-project --python .venv\\Scripts\\python.exe backend/mcp/server.py';
  const sseUrl = `http://127.0.0.1:${settings.telemetry_port || 8000}/mcp/sse`;

  return (
    <div className="card glass-panel p-4 d-flex flex-column gap-3">
      <div className="d-flex justify-content-between align-items-center border-bottom pb-2">
        <div className="d-flex align-items-center gap-2">
          <h5 className="text-primary fs-6 fw-bold m-0">
            {t('Model Context Protocol (MCP) Server')}
          </h5>
          <span
            className={`badge ${
              mcpEnabled ? 'bg-success text-dark' : 'bg-secondary text-white'
            } fs-8 fw-semibold`}
          >
            {mcpEnabled ? t('ACTIVE') : t('DISABLED')}
          </span>
        </div>
        {status && mcpEnabled && (
          <div className="fs-7 text-secondary">
            {t('Active SSE Clients')}: <span className="text-info fw-bold">{status.active_sse_clients}</span> |{' '}
            {t('Total Requests')}: <span className="text-info fw-bold">{status.total_requests_served}</span>
          </div>
        )}
      </div>

      <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
        <div>
          <label htmlFor="chk-mcp-enabled" className="form-label fw-bold mb-0 fs-6">
            {t('Enable MCP Server')}
          </label>
          <div className="form-text fs-7">
            {t('Allow AI assistants (Claude, Cursor, Cline) to read telemetry, session data, and car physics via MCP.')}
          </div>
        </div>
        <input
          type="checkbox"
          className="form-check-input ms-auto fs-5"
          id="chk-mcp-enabled"
          checked={mcpEnabled}
          onChange={(e) => updateSettings({ mcp_enabled: e.target.checked })}
        />
      </div>

      {mcpEnabled && (
        <>
          <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
            <div>
              <label htmlFor="chk-mcp-live" className="form-label fw-bold mb-0 fs-6">
                {t('Expose Real-Time 60Hz Telemetry')}
              </label>
              <div className="form-text fs-7">
                {t('When enabled, AI agents can query live UDP telemetry snapshot frames. When disabled, only recorded files and SQLite database are accessible.')}
              </div>
            </div>
            <input
              type="checkbox"
              className="form-check-input ms-auto fs-5"
              id="chk-mcp-live"
              checked={allowLive}
              onChange={(e) => updateSettings({ mcp_allow_live: e.target.checked })}
            />
          </div>

          <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
            <div>
              <label htmlFor="select-mcp-downsample" className="form-label fw-bold mb-0 fs-6">
                {t('Max Time-Series Samples Limit')}
              </label>
              <div className="form-text fs-7">
                {t('Caps the number of data samples returned in capture and session queries to prevent AI context window token overflow.')}
              </div>
            </div>
            <select
              id="select-mcp-downsample"
              value={maxDownsample}
              onChange={(e) => updateSettings({ mcp_max_downsample: parseInt(e.target.value) || 500 })}
              className="form-select form-select-sm"
              style={{ width: '170px' }}
            >
              <option value="200">{t('200 samples (Fastest)')}</option>
              <option value="500">{t('500 samples (Recommended)')}</option>
              <option value="1000">{t('1,000 samples (Detailed)')}</option>
              <option value="2000">{t('2,000 samples (High Density)')}</option>
            </select>
          </div>

          {/* Quick Copy Section */}
          <div className="d-flex flex-column gap-2 pt-1">
            <span className="fs-7 fw-bold text-primary">{t('Quick Client Configuration')}</span>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                onClick={() => copyToClipboard(claudeConfigSnippet, 'claude')}
              >
                <span>{isCopied === 'claude' ? t('Copied!') : t('Copy Claude Desktop JSON')}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-info d-flex align-items-center gap-1"
                onClick={() => copyToClipboard(cursorCommandSnippet, 'cursor')}
              >
                <span>{isCopied === 'cursor' ? t('Copied!') : t('Copy Cursor CLI Command')}</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                onClick={() => copyToClipboard(sseUrl, 'sse')}
              >
                <span>{isCopied === 'sse' ? t('Copied!') : t('Copy SSE Endpoint URL')}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
