import { useSettings } from '../context/SettingsContext';
import { SettingsSection } from '../features/settings/components/SettingsPrimitives';
import { getAppBuildInfo, formatBuildInfoText } from '../services/buildInfoService';
import type { AppVariant } from './workspaceManifest';

const HUD_CREDITS = [
  ['Simple & Advanced HUD Style:', 'Paburrito'],
  ['VFD HUD Style:', 'eddie772tw feat. crosXover'],
  ['Other SIMHUB HUD Style:', 'StoRMiX43, Inori, GhostInTheLeague, FSH Motorsport Studio'],
] as const;

export function AppAbout({ variant }: { variant: AppVariant }) {
  const { t } = useSettings();
  return <div className="d-flex flex-column gap-4">
    <SettingsSection title={`FH6 HorizonTuner${variant === 'lite' ? ' Lite' : ''}`}>
      <p className="text-body-secondary m-0">{formatBuildInfoText(getAppBuildInfo())}</p>
      <div><a href="https://github.com/eddie772tw/FH6-HorizonTuner" target="_blank" rel="noreferrer">{t('Project website')}</a></div>
    </SettingsSection>
    <SettingsSection title={t('HUD credits')}>
      <dl className="m-0">
        {HUD_CREDITS.map(([label, authors]) => <div className="app-about-credit border-bottom pb-3 mb-3" key={label}>
          <dt className="settings-item-label fw-semibold">{t(label)}</dt>
          <dd className="text-body-secondary m-0">{authors}</dd>
        </div>)}
      </dl>
    </SettingsSection>
  </div>;
}
