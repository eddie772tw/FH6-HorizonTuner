import type { S650CenterWidget, S650HmiTheme } from './s650/config';
import type { ClassicJdmAuxGauge, ClassicJdmDefiTheme, ClassicJdmTachStyle } from './classic_jdm/config';
import type { HudDisplayUnits } from './HudUnitSettingsSidebar';

export interface HudElements {
  showTeleMaster?: boolean;
  showGauge: boolean;
  showCenterInfo: boolean;
  showRPM: boolean;
  showSpeed: boolean;
  showGear: boolean;
  showPowerTorque: boolean;
  showBoost: boolean;
  showWheelLockup: boolean;
  showMotionEffect: boolean;
  showTeleSuspension: boolean;
  showTeleTires: boolean;
  showTeleTiresSlip: boolean;
  showTeleTiresTemp: boolean;
  showTeleAttitude: boolean;
  showTeleEngine: boolean;
  showTelePedals: boolean;
  showTeleCenterAnchor: boolean;
  showTeleGridLines: boolean;
}

export interface MonitorOption {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  is_primary: boolean;
}

export interface HudConfig {
  enabled: boolean;
  hudStyle: string;
  s650Theme?: S650HmiTheme;
  s650CenterWidget?: S650CenterWidget;
  /** S650-only outer container Y offset; positive values move down. */
  s650HmiOffsetY?: number;
  classicJdmTachStyle?: ClassicJdmTachStyle;
  classicJdmShowTriple?: boolean;
  classicJdmAux1?: ClassicJdmAuxGauge;
  classicJdmAux2?: ClassicJdmAuxGauge;
  classicJdmDefiTheme?: ClassicJdmDefiTheme;
  audioDeviceId?: string;
  selectedMonitorIndex: number;
  scale: number;
  unit: 'kmh' | 'mph';
  followAppUnits?: boolean;
  units?: HudDisplayUnits;
  elements: HudElements;
  soundEnabled: boolean;
  telemetryOpacity?: number;
  telemetryGRadarScale?: number;
  telemetryGRadarAlignment?: 'center' | 'left' | 'right';
  telemetryGRadarOffsetX?: number;
  telemetryGRadarOffsetY?: number;
  telemetryCornersScale?: number;
  telemetryPedalScale?: number;
  telemetryPowerTorqueScale?: number;
  telemetryMergedChartsScale?: number;
  telemetryCardFontScale?: number;
  telemetrySideBySideCharts?: boolean;
  telemetryPedalPosition?: 'top' | 'bottom';
  telemetryPowerTorquePosition?: 'top' | 'bottom';
  telemetryMergedChartsPosition?: 'top' | 'bottom';
  telemetryCornerOffsetY?: number;
  telemetryCornerOffsetX?: number;
  telemetryPedalOffsetX?: number;
  telemetryPowerTorqueOffsetX?: number;
  telemetryMergedChartsOffsetX?: number;
  vfdVuOffset?: number;
  vfdAudioOffset?: number;
  glowIntensity?: number;
  customColor?: string;
  useDefaultColors?: boolean;
  pauseTelemetryViewWhenActive?: boolean;
  enableSmoothing?: boolean;
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: false,
  hudStyle: 'vfd',
  s650Theme: 'heritage67',
  s650CenterWidget: 'drive',
  s650HmiOffsetY: 60,
  classicJdmTachStyle: 'trd',
  classicJdmShowTriple: true,
  classicJdmAux1: 'tire_temp_4w',
  classicJdmAux2: 'tire_temp_rear',
  classicJdmDefiTheme: 'amber',
  audioDeviceId: 'default',
  selectedMonitorIndex: 0,
  scale: 1.0,
  unit: 'kmh',
  followAppUnits: true,
  enableSmoothing: true,
  units: { speed: 'kmh', boostPressure: 'bar', torque: 'nm', power: 'hp' },
  telemetryOpacity: 0.65,
  telemetryGRadarScale: 1.0,
  telemetryGRadarAlignment: 'center',
  telemetryGRadarOffsetX: 0,
  telemetryGRadarOffsetY: 0,
  telemetryCornersScale: 1.0,
  telemetryPedalScale: 1.0,
  telemetryPowerTorqueScale: 1.0,
  telemetryMergedChartsScale: 1.0,
  telemetryCardFontScale: 1.0,
  telemetrySideBySideCharts: true,
  telemetryPedalPosition: 'bottom',
  telemetryPowerTorquePosition: 'top',
  telemetryMergedChartsPosition: 'bottom',
  telemetryCornerOffsetY: 0,
  telemetryCornerOffsetX: 0,
  telemetryPedalOffsetX: 0,
  telemetryPowerTorqueOffsetX: 0,
  telemetryMergedChartsOffsetX: 0,
  vfdVuOffset: 0,
  vfdAudioOffset: 0,
  glowIntensity: 1.0,
  customColor: '#00f0ff',
  useDefaultColors: true,
  pauseTelemetryViewWhenActive: true,
  elements: {
    showTeleMaster: true,
    showGauge: true,
    showCenterInfo: true,
    showRPM: true,
    showSpeed: true,
    showGear: true,
    showPowerTorque: true,
    showBoost: true,
    showWheelLockup: true,
    showMotionEffect: true,
    showTeleSuspension: true,
    showTeleTires: true,
    showTeleTiresSlip: true,
    showTeleTiresTemp: true,
    showTeleAttitude: true,
    showTeleEngine: true,
    showTelePedals: true,
    showTeleCenterAnchor: false,
    showTeleGridLines: false,
  },
  soundEnabled: false,
};
