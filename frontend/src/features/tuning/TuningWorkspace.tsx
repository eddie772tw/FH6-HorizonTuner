import { lazy, Suspense } from 'react';
import { useSettings } from '../../context/SettingsContext';

const TuningView = lazy(() => import('./TuningView'));

/** The tuning workspace always uses the qualified Rust workflow. */
export default function TuningWorkspace() {
  const { t } = useSettings();
  return <Suspense fallback={<div role="status">{t('Loading...')}</div>}>
    <TuningView />
  </Suspense>;
}
