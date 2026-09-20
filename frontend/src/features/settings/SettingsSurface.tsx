import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import { applyGeneralUnitSystem, inferGeneralUnitSystem, type GeneralUnitSystem } from '../../utils/gameUnitSettings';
import { DiscordPresenceStatusCard } from './components/DiscordPresenceStatusCard';
import { DataStorageOverview } from './components/DataStorageOverview';
import { McpSettingsCard } from './components/McpSettingsCard';
import { SettingsItem, SettingsSection, SettingsSwitch } from './components/SettingsPrimitives';
import { UpdateSettingsCard } from './components/UpdateSettingsCard';
import { UpdatePreferenceRow } from './components/UpdatePreferenceRow';
import { projectSettingsSections } from './settingsSections';

export interface SettingsSurfaceProps {
  allowDeveloperTuning?: boolean;
  onOpenUpdates?: () => void;
}

export const SettingsSurface: React.FC<SettingsSurfaceProps> = ({
  allowDeveloperTuning = true,
  onOpenUpdates,
}) => {
  const { settings, updateSettings, isLoading, t, availableLanguages } = useSettings();
  const sections = projectSettingsSections(allowDeveloperTuning);

  const handleGeneralUnitChange = (system: GeneralUnitSystem) => {
    void updateSettings({ units: applyGeneralUnitSystem(settings.units, system) });
  };

  if (isLoading) {
    return <div className="d-flex justify-content-center align-items-center h-100 text-primary"><h3>{t('Loading Settings...')}</h3></div>;
  }

  const has = (id: typeof sections[number]['id'], item: typeof sections[number]['items'][number]) =>
    sections.find(section => section.id === id)?.items.includes(item) ?? false;

  return (
    <div className="container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto" data-settings-surface>
      <header className="border-bottom pb-3 mb-2 flex-shrink-0">
        <h2 className="text-primary fs-4 fw-bold mb-1" style={{ letterSpacing: '0.5px' }}>{t('System Settings')}</h2>
        <p className="text-body-secondary fs-7 mb-0" style={{ lineHeight: '1.4' }}>
          {t('Adjust display language, UDP telemetry options, and unit conversions for the tuning tool. All changes are saved automatically.')}
        </p>
      </header>

      <div className="flex-grow-1 overflow-auto p-2 d-flex flex-column gap-4">
        {has('general', 'language') && <SettingsSection title={t('General')}>
          <SettingsItem label={t('Language')} description={t('Select application display language.')} htmlFor="settings-language">
            <select id="settings-language" value={settings.language} onChange={event => void updateSettings({ language: event.target.value })} className="form-select form-select-sm">
              {availableLanguages.map(language => <option key={language.code} value={language.code}>{language.name}</option>)}
            </select>
          </SettingsItem>
          <SettingsItem label={t('General Units')} description={t('Controls speed, weight, temperature, pressure, height, force, and torque across the app.')} htmlFor="settings-unit-general">
            <select id="settings-unit-general" value={inferGeneralUnitSystem(settings.units)} onChange={event => handleGeneralUnitChange(event.target.value as GeneralUnitSystem)} className="form-select form-select-sm">
              <option value="metric">{t('Metric')}</option><option value="imperial">{t('Imperial')}</option>
            </select>
          </SettingsItem>
          <SettingsItem label={t('Power Units')} description={t("Matches the game's independent horsepower unit option.")} htmlFor="settings-unit-power">
            <select id="settings-unit-power" value={settings.units.power} onChange={event => void updateSettings({ units: { power: event.target.value as 'kw' | 'hp' | 'ps' } })} className="form-select form-select-sm">
              <option value="hp">{t('Horsepower (hp)')}</option><option value="kw">{t('Kilowatt (kW)')}</option><option value="ps">{t('Metric Horsepower (PS)')}</option>
            </select>
          </SettingsItem>
          <SettingsItem label={t('Spring Units')} description={t("Matches the game's independent spring-rate unit option.")} htmlFor="settings-unit-spring">
            <select id="settings-unit-spring" value={settings.units.springRate} onChange={event => void updateSettings({ units: { springRate: event.target.value as 'kgfmm' | 'lbsin' } })} className="form-select form-select-sm">
              <option value="kgfmm">{t('Metric (kgf/mm)')}</option><option value="lbsin">{t('Imperial (lbs/in)')}</option>
            </select>
          </SettingsItem>
        </SettingsSection>}

        {has('telemetry', 'telemetry') && <SettingsSection title={t('Telemetry')}>
          <SettingsItem label={t('Telemetry Port')} description={t('Port to listen for Forza UDP telemetry packets across all network adapters and loopback (Default: 8000).')} htmlFor="settings-telemetry-port">
            <input id="settings-telemetry-port" type="number" value={settings.telemetry_port || 8000} onChange={event => void updateSettings({ telemetry_port: parseInt(event.target.value) || 8000 })} className="form-control form-control-sm" />
          </SettingsItem>
          <SettingsSwitch id="chk-forward-telemetry" label={t('Telemetry UDP Forwarding')} description={t('Forward raw binary telemetry datagrams to third-party tools (e.g. SimHub or external dashboard).')} checked={!!settings.forward_telemetry_enabled} onChange={event => void updateSettings({ forward_telemetry_enabled: event.target.checked })} />
          {settings.forward_telemetry_enabled && <>
            <SettingsItem label={t('Forward Target Host')} description={t('Target IPv4 address to forward raw UDP packets to.')} htmlFor="settings-forward-host">
              <input id="settings-forward-host" type="text" value={settings.forward_telemetry_host || '127.0.0.1'} onChange={event => void updateSettings({ forward_telemetry_host: event.target.value })} className="form-control form-control-sm" />
            </SettingsItem>
            <SettingsItem label={t('Forward Target Port')} description={t('Target UDP port to forward raw UDP packets to (Default: 5300).')} htmlFor="settings-forward-port">
              <input id="settings-forward-port" type="number" value={settings.forward_telemetry_port ?? 5300} onChange={event => void updateSettings({ forward_telemetry_port: parseInt(event.target.value) || 5300 })} className="form-control form-control-sm" />
            </SettingsItem>
          </>}
          <SettingsSwitch id="chk-dyno-rec" label={t('Dyno Recording')} description={t('Automatically collect and update engine output curves during full throttle acceleration.')} checked={settings.dyno_recording} onChange={event => void updateSettings({ dyno_recording: event.target.checked })} />
          <SettingsSwitch id="chk-race-rec" label={t('Race Recording')} description={t('Record suspension and grip data during races or driving for post-race analysis.')} checked={settings.race_recording} onChange={event => void updateSettings({ race_recording: event.target.checked })} />
        </SettingsSection>}

        {has('integrations', 'discord') && <SettingsSection title={t('Integrations')}>
          <DiscordPresenceStatusCard />
          <McpSettingsCard />
        </SettingsSection>}

        {has('maintenance', 'updates') && <SettingsSection title={t('Maintenance')}>
          {has('maintenance', 'developerTuning') && <>
            <SettingsSwitch id="chk-developer-tuning" label={t('Use Developer Tuning View')} description={t('Switches the tuning wizard to the experimental TuningMath input/output view. The legacy view remains the default.')} checked={settings.developer_tuning_enabled} onChange={event => void updateSettings({ developer_tuning_enabled: event.target.checked })} />
            {settings.developer_tuning_enabled && <div className="alert alert-warning mb-0 py-2" role="status">{t('Experimental mode active: verify all outputs in-game before saving a tune.')}</div>}
          </>}
          {onOpenUpdates ? <UpdatePreferenceRow onOpenUpdates={onOpenUpdates} /> : <UpdateSettingsCard />}
          <DataStorageOverview />
        </SettingsSection>}
      </div>
    </div>
  );
};

