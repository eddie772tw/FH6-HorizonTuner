import React, { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
import { useSettings } from '../../../context/SettingsContext';
import { SettingsSection } from './SettingsPrimitives';

interface StorageEntry {
  relative_path: string;
  bytes: number;
}

interface StorageOverview {
  format: string;
  schema_version: number;
  data_root: string;
  total_bytes: number;
  entries: StorageEntry[];
  last_backup: string | null;
  capabilities: Record<string, string>;
}

const formatBytes = (bytes: number) => `${(bytes / 1024).toFixed(bytes < 1024 ? 0 : 1)} KB`;
const STORAGE_CAPABILITY_KEYS: Record<string, string> = {
  available: 'Available',
  not_available: 'Not available',
  not_planned: 'Not planned',
};

export const DataStorageOverview: React.FC = () => {
  const { t } = useSettings();
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const formatCapability = (value?: string) => (value ? (STORAGE_CAPABILITY_KEYS[value] ? t(STORAGE_CAPABILITY_KEYS[value]) : value.replace(/_/g, ' ')) : t('Unavailable'));

  useEffect(() => {
    let active = true;
    backendFetch('/api/settings/storage-overview')
      .then(async response => {
        if (!response.ok) throw new Error('Storage overview request failed');
        return response.json() as Promise<StorageOverview>;
      })
      .then(data => {
        if (active) setOverview(data);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => { active = false; };
  }, []);

  return (
    <SettingsSection title={t("Data & Storage")} className="settings-grid-wide">
      <div className="settings-item-description form-text" role={loadFailed ? 'alert' : undefined}>
        {loadFailed && t('Storage information is unavailable while the local service is offline.')}
        {!loadFailed && !overview && t('Loading local storage information...')}
        {overview && (
          <>
            <div>{t(overview.data_root)} · {formatBytes(overview.total_bytes)} · {overview.format}</div>
            <div>{t('Last settings backup:')} {overview.last_backup ? new Date(overview.last_backup).toLocaleString() : t('No backup created yet')}</div>
            <div>{t('Export:')} {formatCapability(overview.capabilities.settings_export)} · {t('Restore:')} {formatCapability(overview.capabilities.settings_restore)}</div>
            <div>{t('SQLite migration:')} {formatCapability(overview.capabilities.sqlite_migration)}</div>
            <ul className="mb-0 mt-2 ps-3" aria-label={t("Tracked local storage")}>
              {overview.entries.map(entry => <li key={entry.relative_path}>{entry.relative_path} · {formatBytes(entry.bytes)}</li>)}
            </ul>
          </>
        )}
      </div>
    </SettingsSection>
  );
};
