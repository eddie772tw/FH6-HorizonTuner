import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { isWipHudQueryEnabled } from './hudStyleScanner';
import { DEFAULT_HUD_CONFIG, type HudConfig, type HudElements, type MonitorOption } from './hudConfig';
import '../../App.css';
import { backendFetch } from '../../services/backend';
import { HudUnitSettingsSidebar } from './HudUnitSettingsSidebar';
import { OverlayControlRuntimeProvider, useOptionalOverlayControlRuntime } from './OverlayControlRuntimeProvider';
import { HudWorkspace } from './HudWorkspace';
import { useHudController } from './useHudController';
import { useHudMetadata } from './useHudMetadata';
import { HudSetupPanel } from './panels/HudSetupPanel';
import { HudLayoutPanel } from './panels/HudLayoutPanel';
import { HudAdvancedPanel } from './panels/HudAdvancedPanel';
import { HudStatusIndicator } from './HudStatusIndicator';
import { deriveHudDisplayState } from './hudStatus';

interface AudioDeviceOption {
  id: string;
  name: string;
  is_default: boolean;
}

const OverlayViewContent: React.FC = () => {
  const { settings, t } = useSettings();
  const { config, status, error: runtimeError, pendingWrites, publishConfig, refresh,
    replaceConfig, retry, sendHudCommand, updateConfig, native, capabilities } = useHudController();
  const metadata = useHudMetadata(config.hudStyle);
  const [loading, setLoading] = useState(false);
  const [showUnitSettings, setShowUnitSettings] = useState(false);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [hudActionError, setHudActionError] = useState<string | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const monitorMoveGeneration = useRef(0);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [loadingAudioDevices, setLoadingAudioDevices] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pageGeneration = useRef(0);
  const audioReadGeneration = useRef(0);
  const audioWriteGeneration = useRef(0);
  const [showWipHuds, setShowWipHuds] = useState(() => {
    try { return localStorage.getItem('fh6_show_wip_huds') === 'true'; } catch { return false; }
  });
  const wipForced = Boolean(settings.developer_tuning_enabled || isWipHudQueryEnabled());
  const isWipActive = showWipHuds || wipForced;
  const handleToggleShowWipHuds = (checked: boolean) => {
    setShowWipHuds(checked);
    try { localStorage.setItem('fh6_show_wip_huds', checked ? 'true' : 'false'); } catch { /* Optional page preference. */ }
  };

  useEffect(() => {
    mountedRef.current = true;
    pageGeneration.current += 1;
    void fetchMonitors();
    void fetchAudioDevices();
    return () => {
      mountedRef.current = false;
      pageGeneration.current += 1;
      audioReadGeneration.current += 1;
    };
  }, []);

  const fetchAudioDevices = async () => {
    const request = ++audioReadGeneration.current;
    setLoadingAudioDevices(true);
    setAudioError(null);
    try {
      const res = await backendFetch('/api/audio/devices');
      if (!res.ok) throw new Error('Audio devices request failed (HTTP ' + res.status + ').');
      const list = await res.json();
      if (Array.isArray(list) && mountedRef.current && request === audioReadGeneration.current) setAudioDevices(list);
    } catch (error) {
      if (mountedRef.current && request === audioReadGeneration.current) setAudioError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mountedRef.current && request === audioReadGeneration.current) setLoadingAudioDevices(false);
    }
  };

  const handleAudioDeviceChange = async (deviceId: string) => {
    const request = ++audioWriteGeneration.current;
    setAudioError(null);
    void updateConfig({ audioDeviceId: deviceId });
    try {
      const res = await backendFetch('/api/audio/device', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }),
      });
      if (!res.ok) throw new Error('Audio device selection failed (HTTP ' + res.status + ').');
    } catch (error) {
      if (mountedRef.current && request === audioWriteGeneration.current) setAudioError(error instanceof Error ? error.message : String(error));
    }
  };

  const fetchMonitors = async () => {
    const generation = pageGeneration.current;
    const result = await native.getAvailableMonitors();
    if (!mountedRef.current || generation !== pageGeneration.current) return;
    if (result.status === 'success' && result.value) { setMonitors(result.value); setMonitorError(null); }
    else if (result.status === 'error' || result.status === 'degraded') setMonitorError(result.error ?? capabilities.monitorSelection.detail);
  };

  const applyMonitorSelection = async (index: number) => {
    if (!monitors[index]) return;
    const request = ++monitorMoveGeneration.current;
    const generation = pageGeneration.current;
    const result = await native.moveHudToMonitor(monitors[index]);
    if (!mountedRef.current || generation !== pageGeneration.current || request !== monitorMoveGeneration.current) return;
    if (result.status === 'success') setMonitorError(null);
    else if (result.status === 'error' || result.status === 'degraded') setMonitorError(result.error ?? capabilities.monitorSelection.detail);
  };

  const toggleHudWindow = async (enabled: boolean) => {
    if (!native.available) {
      setHudActionError(capabilities.nativeWindow.detail);
      return;
    }
    setLoading(true);
    setHudActionError(null);
    const persistence = updateConfig({ enabled });
    try {
      sendHudCommand({ type: enabled ? 'hud:animate' : 'hud:destroy' });
      const result = await native.toggleHudWindow(enabled);
      if (result.status !== 'success') throw new Error(result.error ?? capabilities.nativeWindow.detail);
      if (enabled) {
        const clickThrough = await native.setHudClickThrough(true);
        if (clickThrough.status !== 'success') throw new Error(clickThrough.error ?? capabilities.clickThrough.detail);
        void applyMonitorSelection(config.selectedMonitorIndex);
      }
      void persistence.then(persisted => {
        if (!persisted && enabled && mountedRef.current) setHudActionError(t('HUD opened, but its settings could not be saved.'));
      });
    } catch (error) {
      console.error('HUD overlay action failed:', error);
      if (mountedRef.current) setHudActionError(t('HUD overlay could not be started. Check the backend log and retry.'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleMonitorChange = (index: number) => {
    void updateConfig({ selectedMonitorIndex: index });
    if (config.enabled) void applyMonitorSelection(index);
  };
  const handleReloadHud = async () => {
    setHudActionError(null);
    publishConfig();
    sendHudCommand({ type: 'hud:reload', hudStyle: config.hudStyle });
    const result = await native.reloadHudWindow();
    if (mountedRef.current && (result.status === 'error' || result.status === 'degraded')) setHudActionError(result.error ?? capabilities.reload.detail);
    void refresh();
    if (mountedRef.current) metadata.refresh();
  };
  const handleResetHudConfig = () => {
    if (!window.confirm(t('Are you sure you want to reset all HUD settings?'))) return;
    void replaceConfig({ ...DEFAULT_HUD_CONFIG, enabled: config.enabled });
    sendHudCommand({ type: 'hud:reload' });
    void refresh();
  };
  const handleElementToggle = (key: keyof HudElements) => {
    const nextVal = !config.elements[key];
    const elements: Partial<HudElements> = { [key]: nextVal };
    if ((key === 'showTeleTiresSlip' || key === 'showTeleTiresTemp') && nextVal) elements.showTeleTires = true;
    void updateConfig({ elements });
  };
  const handleS650CenterInfoToggle = () => {
    void updateConfig(config.s650CenterWidget === 'disable'
      ? { s650CenterWidget: 'drive', elements: { showCenterInfo: true } }
      : { elements: { showCenterInfo: config.elements.showCenterInfo === false } });
  };
  const displayState = deriveHudDisplayState({ status, pendingWrites, nativeBusy: loading,
    metadataLoading: metadata.loading, errors: [hudActionError, monitorError, runtimeError, metadata.error, audioError] });
  const panelProps = {
    config, styles: metadata.styles, t, disabled: status === 'loading',
    onConfigPatch: (patch: Partial<HudConfig>) => { void updateConfig(patch); },
  };

  return (
    <HudWorkspace t={t}
      status={<HudStatusIndicator state={displayState} t={t} issues={[
        { source: 'HUD settings', message: runtimeError, retry: () => { void retry(); } },
        { source: 'HUD window', message: hudActionError },
        { source: 'Select Monitor for HUD Overlay', message: monitorError },
        { source: 'HUD metadata', message: metadata.error, retry: metadata.refresh },
        { source: 'Audio Capture Source', message: audioError },
      ]} />}
      setup={<HudSetupPanel {...panelProps} monitors={monitors} author={metadata.currentAuthor}
        metadataLoading={metadata.loading} includeWip={isWipActive} busy={loading}
        capabilities={capabilities} onToggleHud={enabled => void toggleHudWindow(enabled)}
        onStyleChange={hudStyle => void updateConfig({ hudStyle })} onMonitorChange={handleMonitorChange}
        onReloadHud={() => void handleReloadHud()} onOpenUnitSettings={() => setShowUnitSettings(true)} />}
      layout={<HudLayoutPanel {...panelProps} onElementToggle={handleElementToggle} />}
      advanced={<HudAdvancedPanel {...panelProps} audioDevices={audioDevices} loadingAudioDevices={loadingAudioDevices}
        isWipActive={isWipActive} wipForced={wipForced}
        onAudioDeviceChange={deviceId => void handleAudioDeviceChange(deviceId)} onRefreshAudioDevices={() => void fetchAudioDevices()}
        onShowWipChange={handleToggleShowWipHuds} onElementToggle={handleElementToggle}
        onS650CenterInfoToggle={handleS650CenterInfoToggle} onResetHudConfig={handleResetHudConfig} />}
    >
      <HudUnitSettingsSidebar show={showUnitSettings} followGlobal={config.followAppUnits !== false}
        units={config.units ?? DEFAULT_HUD_CONFIG.units!} globalUnits={settings.units} t={t}
        onFollowGlobalChange={followAppUnits => void updateConfig({ followAppUnits })}
        onUnitsChange={units => void updateConfig({ unit: units.speed, units })} onClose={() => setShowUnitSettings(false)} />
    </HudWorkspace>
  );
};

export const OverlayView: React.FC = () => {
  const runtime = useOptionalOverlayControlRuntime();
  if (runtime) return <OverlayViewContent />;
  return <OverlayControlRuntimeProvider><OverlayViewContent /></OverlayControlRuntimeProvider>;
};

export default OverlayView;
