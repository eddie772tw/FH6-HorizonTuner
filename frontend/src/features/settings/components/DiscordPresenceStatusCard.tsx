import React, { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
import { useSettings } from '../../../context/SettingsContext';
import { SettingsItem, SettingsSection } from './SettingsPrimitives';

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
  const { settings, t } = useSettings();
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
              : status.state === 'unavailable'
                ? t('Unavailable')
                : t('Waiting for Discord');

  if (status?.configured !== true) return null;
  return (
    <SettingsSection title={t('Discord Rich Presence')}>
    <div className="d-flex flex-column gap-2">
      <SettingsItem label={t('Presence Status')} description={t('Shows your current FH6 car and race status in Discord when Discord Desktop is running.')}>
        <span className="badge text-bg-secondary" role="status" aria-live="polite">{stateLabel}</span>
      </SettingsItem>
      {settings?.tuning_diagnostics_enabled && (
        <div className="d-flex justify-content-end flex-wrap gap-3 text-body-secondary fs-7">
          <span>{t('Updates: {count}', { count: status.updatesSent })}</span>
          <span>{t('Attempts: {count}', { count: status.connectionAttempts })}</span>
          <span>{t('Reconnects: {count}', { count: status.reconnects })}</span>
        </div>
      )}
      {settings?.tuning_diagnostics_enabled && status.lastError && (
        <div className="form-text fs-7 text-warning" role="alert">
          {t('Last IPC error')}: <code>{status.lastError}</code>
        </div>
      )}
    </div>
    </SettingsSection>
  );
};
