import React, { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
import { useSettings } from '../../../context/SettingsContext';
import { SettingsItem } from './SettingsPrimitives';

interface DiscordPresenceStatus {
  configured: boolean;
  state: string;
  lastError: string | null;
  lastTelemetryAt: number | null;
  lastAttemptAt: number | null;
  connectionAttempts: number;
  updatesSent: number;
  reconnects: number;
}

export const DiscordPresenceStatusCard: React.FC = () => {
  const { t } = useSettings();
  const [status, setStatus] = useState<DiscordPresenceStatus | null>(null);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        const response = await backendFetch('/api/diagnostics/discord-presence');
        if (!response.ok) return;
        const data = await response.json() as DiscordPresenceStatus;
        if (!disposed) setStatus(data);
      } catch {
        if (!disposed) setStatus(null);
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const stateLabel = !status
    ? t('Unavailable')
    : status.state === 'connected'
      ? t('Connected')
      : status.state === 'missing_application_id'
        ? t('Application ID not configured')
        : status.state === 'waiting_for_telemetry'
          ? t('Waiting for telemetry')
          : status.state === 'connecting'
            ? t('Connecting to Discord')
            : status.state === 'error'
              ? t('Discord unavailable')
              : t('Waiting for Discord');

  return (
    <div className="d-flex flex-column gap-2">
      <SettingsItem label={t('Presence Status')} description={t('Shows your current FH6 car and race status in Discord when Discord Desktop is running.')}>
        <span className="badge text-bg-secondary">{stateLabel}</span>
      </SettingsItem>
      {status && (
        <div className="d-flex justify-content-end flex-wrap gap-3 text-body-secondary fs-7">
          <span>{t('Updates')}: {status.updatesSent}</span>
          <span>{t('Attempts')}: {status.connectionAttempts}</span>
          <span>{t('Reconnects')}: {status.reconnects}</span>
        </div>
      )}
      {status?.lastError && (
        <div className="form-text fs-7 text-warning">
          {t('Last IPC error')}: <code>{status.lastError}</code>
        </div>
      )}
    </div>
  );
};
