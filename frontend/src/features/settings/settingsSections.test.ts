import { describe, expect, it } from 'vitest';
import { projectSettingsSections } from './settingsSections';

describe('settings section projection', () => {
  it('keeps all four sections and Developer Tuning for Full', () => {
    const sections = projectSettingsSections(true);
    expect(sections.map(section => section.id)).toEqual(['general', 'telemetry', 'integrations', 'maintenance']);
    expect(sections.at(-1)?.items).toContain('developerTuning');
  });

  it('filters only Developer Tuning for Lite', () => {
    const sections = projectSettingsSections(false);
    expect(sections).toHaveLength(4);
    expect(sections.flatMap(section => section.items)).not.toContain('developerTuning');
    expect(sections.flatMap(section => section.items)).toEqual([
      'language', 'units', 'telemetry', 'recording', 'discord', 'mcp', 'updates', 'storage',
    ]);
  });
});

