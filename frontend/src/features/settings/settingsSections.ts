export type SettingsSectionId = 'general' | 'telemetry' | 'integrations' | 'maintenance';

export type SettingsSectionItem =
  | 'language'
  | 'units'
  | 'telemetry'
  | 'recording'
  | 'discord'
  | 'mcp'
  | 'developerTuning'
  | 'updates'
  | 'storage';

export interface SettingsSectionProjection {
  readonly id: SettingsSectionId;
  readonly title: string;
  readonly items: readonly SettingsSectionItem[];
}

const BASE_SECTIONS: readonly SettingsSectionProjection[] = [
  { id: 'general', title: 'General', items: ['language', 'units'] },
  { id: 'telemetry', title: 'Telemetry', items: ['telemetry', 'recording'] },
  { id: 'integrations', title: 'Integrations', items: ['discord', 'mcp'] },
  { id: 'maintenance', title: 'Maintenance', items: ['updates', 'storage'] },
];

export function projectSettingsSections(allowDeveloperTuning: boolean): readonly SettingsSectionProjection[] {
  return BASE_SECTIONS.map(section => section.id === 'maintenance' && allowDeveloperTuning
    ? { ...section, items: ['developerTuning', ...section.items] }
    : section);
}

