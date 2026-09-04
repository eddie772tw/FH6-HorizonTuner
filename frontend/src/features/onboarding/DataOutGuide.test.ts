import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DataOutGuide from './DataOutGuide';
import { SettingsProvider } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import type { TelemetryHealth } from './telemetryHealth';

describe('DataOutGuide component', () => {
  const mockHealth: TelemetryHealth = {
    state: 'active',
    label: 'Data Out receiving',
    detail: 'Telemetry is active',
    datagramsReceived: 10,
    validFrames: 10,
    hasObservedPacket: true,
    lastPacketAt: 12345678,
    errors: [],
  };

  it('renders nothing when open is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(DataOutGuide, {
            health: mockHealth,
            open: false,
            onClose: vi.fn(),
          })
        )
      )
    );
    expect(html).toBe('');
  });

  it('safely handles static SSR rendering when open is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(DataOutGuide, {
            health: mockHealth,
            open: true,
            onClose: vi.fn(),
          })
        )
      )
    );
    // In Node SSR, ModalPortal safely returns null when document is undefined
    expect(html).toBe('');
  });
});
