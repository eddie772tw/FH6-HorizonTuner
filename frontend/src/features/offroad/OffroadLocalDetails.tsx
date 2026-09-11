import { useSettings } from '../../context/SettingsContext';
import type { OffroadSegment } from './offroadTypes';

interface Props { segments?: OffroadSegment[] }
export function OffroadLocalDetails({ segments }: Props) {
  const { t } = useSettings();
  if (!segments || segments.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="small">{t('Matched Route Segments & Dynamics')}</summary>
      <div className="table-responsive">
        <table className="table table-sm mt-2 mb-0">
          <thead><tr><th>{t('Segment')}</th><th>{t('Distance')}</th><th>{t('Normalized Slip Change')}</th></tr></thead>
          <tbody>
            {segments.map(s => (
              <tr key={s.index}>
                <td>#{s.index}</td>
                <td>{s.fromMeters.toFixed(0)}m - {s.toMeters.toFixed(0)}m</td>
                <td>{s.meanNormalizedAngleChange !== null ? s.meanNormalizedAngleChange.toFixed(3) : t('Unknown')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
