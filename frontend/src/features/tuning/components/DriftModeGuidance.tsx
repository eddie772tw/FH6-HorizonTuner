import React from 'react';
import { useSettings } from '../../../context/SettingsContext';
import type { CarParams } from '../../../context/CarParamsContext';

export const DriftModeGuidance: React.FC<{ carParams: CarParams | null }> = ({ carParams }) => {
  const { t } = useSettings();
  const drivetrain = carParams?.drivetrain ?? 'RWD';
  const message = drivetrain === 'FWD'
    ? 'FWD Drift is a compatibility fallback for handbrake and weight-transfer testing; the RWD power-oversteer baseline is not applied.'
    : drivetrain === 'AWD'
      ? 'AWD Drift uses a general rear-biased starting prior (85/5, 60/15, 75); validate the center split and active gear with telemetry or track A/B testing.'
      : 'RWD Drift starts with a one-third front ARB, a slightly stiffer rear ARB, spring-derived damping, and rear height +2 clicks; refine the active gear and final drive from limiter and power-band behavior.';
  return <div className="p-2 rounded border bg-body-tertiary fs-8 text-body-secondary" role="note">{t(message)}</div>;
};
