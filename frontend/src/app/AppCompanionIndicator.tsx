import { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { backendFetch } from '../services/backend';

interface CompanionStatus {
  active_connections: number;
  paired_devices_count: number;
}

export function AppCompanionIndicator({ onOpen }: { onOpen: () => void }) {
  const { t } = useSettings();
  const [status, setStatus] = useState<CompanionStatus | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await backendFetch('/api/companion/status');
        if (res.ok && isMounted) {
          const data = (await res.json()) as CompanionStatus;
          setStatus(data);
        }
      } catch {
        if (isMounted) setStatus(null);
      }
    };

    void fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const activeCount = status?.active_connections || 0;

  return (
    <button
      type="button"
      className="dropdown-item d-flex align-items-center justify-content-between gap-3"
      onClick={onOpen}
      title={
        !status ? t('Companion status unavailable') : activeCount > 0
          ? t('{activeCount} Companion device(s) connected', { activeCount })
          : t('Companion APP: No devices connected. Click to pair.')
      }
      aria-label={t('Companion App')}
    >
      <span>{t('Companion App')}</span>
      {activeCount > 0 && (
        <span className="badge rounded-pill bg-success fs-9 px-1 py-0">
          {activeCount}
        </span>
      )}
    </button>
  );
}
