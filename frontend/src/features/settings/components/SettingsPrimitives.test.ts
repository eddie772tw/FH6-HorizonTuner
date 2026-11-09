import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsItem, SettingsSection, SettingsSwitch } from './SettingsPrimitives';

describe('settings presentation primitives', () => {
  it('renders a semantic section heading and links aria-labelledby to h3', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SettingsSection,
        { title: 'Display', headerAside: React.createElement('span', null, 'Active') },
        React.createElement('p', null, 'Content')
      )
    );

    expect(html).toContain('<section');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain('<h3 id="');
    expect(html).toContain('Display');
    expect(html).toContain('Active');
  });

  it('connects a setting label and description id to its control', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SettingsItem,
        { label: 'Language', description: 'Choose a language', htmlFor: 'language' },
        React.createElement('select', { id: 'language' })
      )
    );

    expect(html).toContain('for="language"');
    expect(html).toContain('id="language-description"');
    expect(html).toContain('settings-item-description');
    expect(html).toContain('settings-control');
  });

  it('provides accessible switch role, aria-checked, and aria-describedby', () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingsSwitch, {
        id: 'recording',
        label: 'Recording',
        description: 'Capture telemetry',
        checked: true,
        onChange: () => undefined,
      })
    );

    expect(html).toContain('for="recording"');
    expect(html).toContain('id="recording"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-describedby="recording-description"');
    expect(html).toContain('id="recording-description"');
    expect(html).toContain('cursor:pointer');
  });

  it('applies not-allowed cursor and opacity when switch is disabled', () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingsSwitch, {
        id: 'disabled-opt',
        label: 'Disabled Option',
        checked: false,
        disabled: true,
        onChange: () => undefined,
      })
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('opacity-75');
    expect(html).toContain('cursor:not-allowed');
  });
});
