import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { RallyProfile } from '../../../utils/tuningMath';

interface Props {
  value?: RallyProfile;
  onChange: (value: RallyProfile) => void;
}

/** Small Rally-only selector; the persisted car profile remains the contract. */
export const RallyProfileSetup: React.FC<Props> = ({ value = 'mixed-surface', onChange }) => {
  const { t } = useSettings();
  return (
    <div className="p-2 rounded bg-body-tertiary border d-flex flex-column gap-2">
      <label htmlFor="rally-profile" className="text-body-secondary fs-7 fw-semibold">{t('Rally surface profile')}</label>
      <select id="rally-profile" className="form-select form-select-sm" value={value} onChange={event => onChange(event.target.value as RallyProfile)}>
        <option value="mixed-surface">{t('Mixed surface rally')}</option>
        <option value="cross-country">{t('Cross country / rough terrain')}</option>
      </select>
      <div className="small text-body-secondary" role="note">
        {value === 'cross-country'
          ? t('Cross country favors suspension compliance, contact over rough terrain, and shorter gearing. Confirm with telemetry.')
          : t('Mixed surface balances gravel stages with short paved sections using a lower ride-height baseline.')}
      </div>
    </div>
  );
};
