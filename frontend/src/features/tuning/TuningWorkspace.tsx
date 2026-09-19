import { lazy, Suspense } from 'react';
import { useSettings } from '../../context/SettingsContext';

const TuningView = lazy(() => import('./TuningView'));
const TuningViewDev = lazy(() => import('./TuningView_dev'));

/** The feature owns its formal/developer modes and their independent steps. */
export default function TuningWorkspace() {
  const { settings, t } = useSettings();
  return <Suspense fallback={<div role="status">{t('Loading...')}</div>}>
    {settings.developer_tuning_enabled ? <TuningViewDev /> : <TuningView />}
  </Suspense>;
}
