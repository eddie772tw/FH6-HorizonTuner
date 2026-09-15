/** Temporary typed adapter removed when the shared workspace shell lands. */
export type LegacyTab = 'telemetry' | 'tuning' | 'overlay' | 'settings';
export type LegacyNavigationTarget =
  | { tab: 'telemetry'; view: 'live' | 'analysis' | 'drag' }
  | { tab: 'tuning'; step: number }
  | { tab: 'overlay' }
  | { tab: 'settings' };
