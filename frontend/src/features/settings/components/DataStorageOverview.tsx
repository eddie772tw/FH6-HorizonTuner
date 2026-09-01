import React, { useEffect, useState } from 'react';
import { backendFetch } from '../../../services/backend';
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

export const DataStorageOverview: React.FC = () => {
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

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
    <SettingsSection title="Data & Storage">
      <div className="settings-item-description form-text">
        {loadFailed && 'Storage information is unavailable while the local service is offline.'}
        {!loadFailed && !overview && 'Loading local storage information...'}
        {overview && (
          <>
            <div>{overview.data_root} · {formatBytes(overview.total_bytes)} · {overview.format}</div>
            <div>Last settings backup: {overview.last_backup ? new Date(overview.last_backup).toLocaleString() : 'No backup created yet'}</div>
            <div>Export: {overview.capabilities.settings_export.replace('_', ' ')} · Restore: {overview.capabilities.settings_restore.replace('_', ' ')}</div>
            <div>SQLite migration: {overview.capabilities.sqlite_migration.replace('_', ' ')}</div>
            <ul className="mb-0 mt-2 ps-3" aria-label="Tracked local storage">
              {overview.entries.map(entry => <li key={entry.relative_path}>{entry.relative_path} · {formatBytes(entry.bytes)}</li>)}
            </ul>
          </>
        )}
      </div>
    </SettingsSection>
  );
};
