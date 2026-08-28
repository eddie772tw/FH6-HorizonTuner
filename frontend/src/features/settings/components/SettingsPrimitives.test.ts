import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsItem, SettingsSection, SettingsSwitch } from './SettingsPrimitives';

describe('settings presentation primitives', () => {
  it('renders a semantic section heading and optional header metadata', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SettingsSection,
        { title: 'Display', headerAside: React.createElement('span', null, 'Active') },
        React.createElement('p', null, 'Content')
      )
    );

    expect(html).toContain('<section');
    expect(html).toContain('<h3');
    expect(html).toContain('Display');
    expect(html).toContain('Active');
  });

  it('connects a setting label to its control', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SettingsItem,
        { label: 'Language', description: 'Choose a language', htmlFor: 'language' },
        React.createElement('select', { id: 'language' })
      )
    );

    expect(html).toContain('for="language"');
    expect(html).toContain('settings-item-description');
    expect(html).toContain('settings-control');
  });

  it('keeps the entire switch row associated with its checkbox', () => {
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
    expect(html).toContain('checked=""');
  });
});
