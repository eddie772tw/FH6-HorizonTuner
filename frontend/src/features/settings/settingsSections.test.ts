import { describe, expect, it } from 'vitest';
import { projectSettingsSections } from './settingsSections';
describe('current settings sections', () => {
  it('keeps all supported settings without Developer Tuning', () => {
    const sections = projectSettingsSections();
    expect(sections.map(section => section.id)).toEqual(['general', 'telemetry', 'integrations', 'updates', 'storage']);
    expect(sections.flatMap(section => section.items)).toEqual(['language', 'units', 'telemetry', 'recording', 'discord', 'updates', 'storage']);
  });
});
