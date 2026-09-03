import React, { useState, useEffect } from 'react';
import { useSettings } from '../../../context/SettingsContext';
import { backendFetch, backendHttpUrl } from '../../../services/backend';
import { SettingsItem, SettingsSection, SettingsSwitch } from './SettingsPrimitives';

interface McpStatus {
  enabled: boolean;
  allow_live: boolean;
  max_downsample: number;
  total_requests_served: number;
  transport: string;
  mcp_endpoint: string;
}

export const McpSettingsCard: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();
  const [status, setStatus] = useState<McpStatus | null>(null);

  const mcpEnabled = settings.mcp_enabled !== false;
  const allowLive = settings.mcp_allow_live !== false;
  const maxDownsample = settings.mcp_max_downsample || 500;

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const response = await backendFetch('/api/mcp/status');
        if (!response.ok) return;
        const data = (await response.json()) as McpStatus;
        if (isMounted) {
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

  const mcpUrl = backendHttpUrl('/mcp');

  return (
    <SettingsSection
      title={t('Model Context Protocol (MCP) Server')}
      headerAside={(
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span
            className={`badge ${
              mcpEnabled ? 'text-bg-success' : 'text-bg-secondary'
            } fs-8 fw-semibold`}
          >
            {mcpEnabled ? t('ACTIVE') : t('DISABLED')}
          </span>
          {status && mcpEnabled && (
            <span className="fs-7 text-secondary">
              {t('Total Requests')}: <span className="text-info fw-bold">{status.total_requests_served}</span>
            </span>
          )}
        </div>
      )}
    >
      <SettingsSwitch
        id="chk-mcp-enabled"
        label={t('Enable MCP Server')}
        description={t('Allow AI assistants (Claude, Cursor, Cline) to read telemetry, session data, and car physics via MCP.')}
        checked={mcpEnabled}
        onChange={(event) => updateSettings({ mcp_enabled: event.target.checked })}
      />

      {mcpEnabled && (
        <>
          <SettingsSwitch
            id="chk-mcp-live"
            label={t('Expose Real-Time 60Hz Telemetry')}
            description={t('When enabled, AI agents can query live UDP telemetry snapshot frames. When disabled, only recorded files and SQLite database are accessible.')}
            checked={allowLive}
            onChange={(event) => updateSettings({ mcp_allow_live: event.target.checked })}
          />

          <SettingsItem
            label={t('Max Time-Series Samples Limit')}
            description={t('Caps the number of data samples returned in capture and session queries to prevent AI context window token overflow.')}
            htmlFor="select-mcp-downsample"
          >
            <select
              id="select-mcp-downsample"
              value={maxDownsample}
              onChange={(e) => updateSettings({ mcp_max_downsample: parseInt(e.target.value) || 500 })}
              className="form-select form-select-sm"
            >
              <option value="200">{t('200 samples (Fastest)')}</option>
              <option value="500">{t('500 samples (Recommended)')}</option>
              <option value="1000">{t('1,000 samples (Detailed)')}</option>
              <option value="2000">{t('2,000 samples (High Density)')}</option>
            </select>
          </SettingsItem>

          {/* Connection details and standard initialization guidance */}
          <div className="d-flex flex-column gap-2 pt-1">
            <div className="settings-endpoint p-3">
              <div className="fs-7 fw-bold text-primary">{t('Current MCP Endpoint')}</div>
              <code className="d-block fs-7 text-body mt-1 user-select-all">{mcpUrl}</code>
              <div className="fs-8 text-secondary mt-1">
                {t('This is the endpoint used for the current backend connection. Release Builds may select a dynamic local port.')}
              </div>
            </div>
            <div className="settings-endpoint p-3">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="fs-7 fw-bold text-primary">{t('Standard MCP Initialization')}</span>
                <span className="badge text-bg-info fs-8">{t('INITIALIZATION')}</span>
              </div>
              <p className="fs-8 text-body-secondary mt-2 mb-0">
                {t('Compatible Agents receive server capabilities and configuration guidance automatically during the MCP initialize handshake.')}
              </p>
              <p className="fs-8 text-body-secondary mt-2 mb-0">
                {t('No client-side JSON or CLI copy step is required after the Agent has connected to this endpoint. Clients without standard MCP initialization still need a one-time endpoint entry.')}
              </p>
            </div>
          </div>
        </>
      )}
    </SettingsSection>
  );
};
