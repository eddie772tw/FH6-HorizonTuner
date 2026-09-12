import React from 'react';
import { DecimalInput } from '../../../components/common/DecimalInput';
import type { CarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';

interface DragGearingSetupProps {
  carParams: CarParams | null;
  updateParam: (field: keyof CarParams, value: any) => void;
}

/** Small, explicit input boundary for measured Drag finish speed. */
export const DragGearingSetup: React.FC<DragGearingSetupProps> = ({ carParams, updateParam }) => (
  <DragGearingSetupContent carParams={carParams} updateParam={updateParam} />
);

const DragGearingSetupContent: React.FC<DragGearingSetupProps> = ({ carParams, updateParam }) => {
  const { t } = useSettings();
  return (
  <div className="p-2 rounded border bg-body-tertiary d-flex flex-column gap-2">
    <label className="text-body-secondary fs-7 fw-semibold mb-0">{t('Measured Drag finish speed (km/h)')}</label>
    <DecimalInput
      value={carParams?.dragFinishSpeedKmh}
      onChange={(value) => updateParam('dragFinishSpeedKmh', value && value > 0 ? value : undefined)}
      precision={1}
      min={1}
      max={1000}
      placeholder={t('Optional')}
    />
    <select
      className="form-select form-select-sm"
      value={carParams?.dragFinishSpeedProvenance ?? ''}
      onChange={(event) => updateParam('dragFinishSpeedProvenance', event.target.value || undefined)}
      aria-label={t('Drag finish speed source')}
    >
      <option value="">{t('Source (unconfirmed)')}</option>
      <option value="manual">{t('Manual record')}</option>
    </select>
    <div className="fs-8 text-body-secondary">{t('Use a recorded finish speed from a repeatable strip test when refining Drag gearing.')}</div>
    <div className="fs-8 text-body-secondary">{t('If the requested finish speed is outside the current gear limits, the wizard will mark Drag gearing unavailable. Clear or adjust the value.')}</div>
  </div>
  );
};
