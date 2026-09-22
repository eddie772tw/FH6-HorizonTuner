import { describe, expect, it } from 'vitest';
import { projectSettingsSections } from './settingsSections';

describe('SettingsSurface information architecture', () => {
  it('projects the four named sections for Full', () => {
    const sections = projectSettingsSections(true);
    expect(sections.map(section => section.id)).toEqual(['general', 'telemetry', 'integrations', 'maintenance']);
    expect(sections.find(section => section.id === 'maintenance')?.items).toContain('developerTuning');
  });

  it('keeps every non Developer setting visible in Lite', () => {
    const items = projectSettingsSections(false).flatMap(section => section.items);
    expect(items).not.toContain('developerTuning');
    expect(items).toEqual(['language', 'units', 'telemetry', 'recording', 'discord', 'mcp', 'companion', 'updates', 'storage']);
  });
});
