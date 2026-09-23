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
        // Ignored
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
      className={`btn btn-sm d-flex align-items-center gap-1 ${
        activeCount > 0 ? 'btn-outline-success' : 'btn-outline-secondary'
      }`}
      onClick={onOpen}
      title={t(
        activeCount > 0
          ? `${activeCount} Companion device(s) connected`
          : 'Companion APP: No devices connected. Click to pair.'
      )}
      aria-label={t('Companion App')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
        <path d="M12 18h.01" />
      </svg>
      <span className="fs-8 fw-semibold">{t('Companion')}</span>
      {activeCount > 0 && (
        <span className="badge rounded-pill bg-success fs-9 px-1 py-0">
          {activeCount}
        </span>
      )}
    </button>
  );
}
