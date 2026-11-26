import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import { applyGeneralUnitSystem, inferGeneralUnitSystem, type GeneralUnitSystem } from '../../utils/gameUnitSettings';
import { DiscordPresenceStatusCard } from './components/DiscordPresenceStatusCard';
import { DataStorageOverview } from './components/DataStorageOverview';
import { SettingsItem, SettingsSection, SettingsSwitch } from './components/SettingsPrimitives';
import { UpdateSettingsCard } from './components/UpdateSettingsCard';
import { projectSettingsSections } from './settingsSections';
import { getRuntimeCapabilities } from '../../services/runtimeCapabilities';
import { useOptionalTuneSession } from '../tuning/TuneSessionProvider';
import type { AppVariant } from '../../app/workspaceManifest';
import { McpSettingsCard } from './components/McpSettingsCard';
import type { DeveloperOptions } from '../auto-tune/useDeveloperOptions';

export const SettingsSurface: React.FC<{ developer?: DeveloperOptions; variant?: AppVariant; companionSupported?: boolean }> = ({ developer, variant = 'full', companionSupported = false }) => {
  const { settings, updateSettings, isLoading, t, availableLanguages } = useSettings();
  const sections = projectSettingsSections();
  const evCollecting = useOptionalTuneSession()?.evMeasurement.phase === 'collecting';

  const handleGeneralUnitChange = (system: GeneralUnitSystem) => {
    void updateSettings({ units: applyGeneralUnitSystem(settings.units, system) });
  };

  if (isLoading) {
    return <div className="d-flex justify-content-center align-items-center h-100 text-primary"><h3>{t('Loading Settings...')}</h3></div>;
  }

  const has = (id: typeof sections[number]['id'], item: typeof sections[number]['items'][number]) =>
    sections.find(section => section.id === id)?.items.includes(item) ?? false;

  return (
    <div className="settings-surface settings-surface-grid" data-settings-surface>
      <p className="settings-grid-wide text-body-secondary mb-0 surface-intro">
        {t('Adjust display language, UDP telemetry options, and unit conversions for the tuning tool. All changes are saved automatically.')}
      </p>
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

        <SettingsSection title={t('Developer options')}>
          {developer?.available && <>
            <SettingsSwitch id="settings-developer-options" label={t('Automated tuning')}
              description={t('Show the experimental automated tuning tab. Turning this off stops runs started from the tab. MCP remains available.')}
              checked={developer.enabled} disabled={developer.busy} onChange={e => void developer.setEnabled(e.target.checked)} />
            {developer.error && <p role="alert">{developer.error}</p>}
          </>}
          {variant === 'full' && <>
            <SettingsSwitch id="settings-tuning-diagnostics" label={t('Show tuning diagnostics')}
              checked={settings.tuning_diagnostics_enabled === true} onChange={e => void updateSettings({ tuning_diagnostics_enabled: e.target.checked })} />
            <SettingsSwitch id="settings-ev-experimental" label={t('Experimental EV gearing')}
              description={evCollecting ? t('Pause EV collection before turning off experimental gearing.') : undefined}
              checked={settings.ev_experimental_enabled === true} disabled={evCollecting} onChange={e => void updateSettings({ ev_experimental_enabled: e.target.checked })} />
            <SettingsSwitch id="settings-cvt-evidence" label={t('CVT evidence tools')}
              checked={settings.cvt_evidence_enabled === true} onChange={e => void updateSettings({ cvt_evidence_enabled: e.target.checked })} />
            <SettingsSwitch id="settings-motec-native" label={t('Experimental MoTeC native export')}
              checked={settings.motec_native_enabled === true} onChange={e => void updateSettings({ motec_native_enabled: e.target.checked })} />
          </>}
          {getRuntimeCapabilities().hudOverlay && <SettingsSwitch id="settings-wip-hud" label={t('Show WIP Gauges')}
            checked={settings.wip_hud_enabled === true} onChange={e => void updateSettings({ wip_hud_enabled: e.target.checked })} />}
          {companionSupported && <SettingsSwitch id="settings-companion" label={t('Enable Companion APP')}
            description={t('Turning off Companion disconnects devices and keeps their pairing.')}
            checked={settings.companion_enabled === true} onChange={e => void updateSettings({ companion_enabled: e.target.checked })} />}
          <details>
            <summary>{t('Automatic Dyno collection (legacy)')}</summary>
            <SettingsSwitch id="chk-dyno-rec" label={t('Dyno Recording')} checked={settings.dyno_recording}
              onChange={e => void updateSettings({ dyno_recording: e.target.checked })} />
            {settings.dyno_recording && <>
              <SettingsItem label={t('Test Gear')} htmlFor="settings-dyno-test-gear">
                <select id="settings-dyno-test-gear" className="form-select form-select-sm" value={settings.dyno_test_gear}
                  onChange={e => void updateSettings({ dyno_test_gear: Number(e.target.value) })}>
                  <option value={0}>{t('Any Gear')}</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(gear => <option key={gear} value={gear}>{gear}</option>)}
                </select>
              </SettingsItem>
              <SettingsSwitch id="settings-dyno-slip" label={t('Filter Wheel Slip')} checked={settings.dyno_filter_slip}
                onChange={e => void updateSettings({ dyno_filter_slip: e.target.checked })} />
              <SettingsSwitch id="settings-dyno-transients" label={t('Filter Transients')} checked={settings.dyno_filter_transients}
                onChange={e => void updateSettings({ dyno_filter_transients: e.target.checked })} />
            </>}
          </details>
          <McpOptions />
        </SettingsSection>

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
          <SettingsSwitch id="chk-race-rec" label={t('Automatically record races')} description={t('Record suspension and grip data during races or driving for post-race analysis.')} checked={settings.race_recording} onChange={event => void updateSettings({ race_recording: event.target.checked })} />
        </SettingsSection>}

        {has('integrations', 'discord') && <DiscordPresenceStatusCard />}

        {has('updates', 'updates') && <UpdateSettingsCard />}

        {has('storage', 'storage') && <DataStorageOverview />}
    </div>
  );
};


function McpOptions() {
  const { t } = useSettings();
  const [open, setOpen] = React.useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('MCP')}</summary>
    {open && <McpSettingsCard />}
  </details>;
}
