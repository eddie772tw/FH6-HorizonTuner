export type SettingsSectionId = 'general' | 'telemetry' | 'integrations' | 'updates' | 'storage' | 'developer';

export type SettingsSectionItem =
  | 'language'
  | 'units'
  | 'telemetry'
  | 'recording'
  | 'discord'
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
  { id: 'integrations', title: 'Discord Rich Presence', items: ['discord'] },
  { id: 'updates', title: 'Software Updates (OTA)', items: ['updates'] },
  { id: 'storage', title: 'Data & Storage', items: ['storage'] },
];

export function projectSettingsSections(allowDeveloperTuning: boolean): readonly SettingsSectionProjection[] {
  return allowDeveloperTuning
    ? [...BASE_SECTIONS, { id: 'developer', title: 'Developer', items: ['developerTuning'] }]
    : BASE_SECTIONS;
}

