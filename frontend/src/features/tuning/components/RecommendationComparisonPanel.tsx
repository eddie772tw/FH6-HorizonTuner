import React from 'react';
import { useSettings } from '../../../context/SettingsContext';

export interface RecommendationComparisonPanelProps {
  recommendations: Record<string, number | string>;
  currentSettings: Record<string, number | string>;
  capabilityStatus: Record<string, 'unlocked' | 'locked' | 'unknown'>;
}

export const RecommendationComparisonPanel: React.FC<RecommendationComparisonPanelProps> = ({
  recommendations,
  currentSettings,
  capabilityStatus,
}) => {
  const { t } = useSettings();
  const allKeys = Array.from(new Set([...Object.keys(recommendations), ...Object.keys(currentSettings)]));

  return (
    <div className="glass-panel p-4 popover bs-popover-bottom position-absolute" style={{ top: 'calc(100% + 8px)', zIndex: 1050 }}>
      <h5 className="mb-3" style={{ color: 'var(--text-primary)' }}>{t("Recommendation vs Current")}</h5>
      <table className="table table-borderless table-sm mb-0">
        <thead>
          <tr>
            <th style={{ color: 'var(--text-secondary)' }}>{t("Parameter")}</th>
            <th style={{ color: 'var(--text-secondary)' }}>{t("Recommended")}</th>
            <th style={{ color: 'var(--text-secondary)' }}>{t("Current")}</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map(key => {
            const status = capabilityStatus[key] || 'unknown';
            const isLockedOrUnknown = status === 'locked' || status === 'unknown';
            
            return (
              <tr key={key}>
                <td style={{ color: 'var(--text-primary)' }}>{key}</td>
                <td style={{ color: 'var(--text-primary)' }}>
                  {isLockedOrUnknown ? (
                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t("Locked / Unknown")}</span>
                  ) : (
                    recommendations[key] ?? '-'
                  )}
                </td>
                <td style={{ color: 'var(--text-primary)' }}>
                  {isLockedOrUnknown ? (
                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t("Locked / Unknown")}</span>
                  ) : (
                    currentSettings[key] ?? '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
