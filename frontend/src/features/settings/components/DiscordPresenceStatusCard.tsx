import React, { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
import { useSettings } from '../../../context/SettingsContext';

interface DiscordPresenceStatus {
  configured: boolean;
  state: string;
  lastError: string | null;
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
        : status.state === 'error'
          ? t('Discord unavailable')
          : t('Waiting for Discord');

  return (
    <div className="settings-section d-flex flex-column gap-3">
      <h5 className="text-primary fs-6 fw-bold border-bottom pb-2 m-0">
        {t('Discord Rich Presence')}
      </h5>
      <div className="settings-row d-flex justify-content-between align-items-center border-bottom pb-3">
        <div>
          <div className="form-check-label fw-bold fs-6">{t('Presence Status')}</div>
          <div className="form-text fs-7">
            {t('Shows your current FH6 car and race status in Discord when Discord Desktop is running.')}
          </div>
        </div>
        <span className="badge text-bg-secondary">{stateLabel}</span>
      </div>
      {status && (
        <div className="d-flex justify-content-end gap-3 text-body-secondary fs-7">
          <span>{t('Updates')}: {status.updatesSent}</span>
          <span>{t('Reconnects')}: {status.reconnects}</span>
        </div>
      )}
    </div>
  );
};
