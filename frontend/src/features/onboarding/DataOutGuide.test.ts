import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DataOutGuide, { localizeTelemetryHealth } from './DataOutGuide';
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

  it('localizes semantic health states and dynamic counts with the zh-tw dictionary', () => {
    const translations = JSON.parse(
      readFileSync(resolve(process.cwd(), '../lang/zh-tw.json'), 'utf8'),
    ) as Record<string, string>;
    const t = (key: string) => translations[key] ?? key;

    expect(localizeTelemetryHealth(mockHealth, t)).toEqual({
      label: '資料輸出接收中',
      detail: '已收到 10 個有效影格。',
    });
    expect(localizeTelemetryHealth({
      ...mockHealth,
      state: 'active',
      errors: ['unsupported_length (2)'],
    }, t).detail).toBe('已收到 10 個有效影格。 回報的解析器問題仍然記錄在案。');
    expect(localizeTelemetryHealth({
      ...mockHealth,
      state: 'invalid',
      validFrames: 0,
      errors: ['unsupported_length (2)'],
    }, t)).toEqual({
      label: '資料已接收，但無法使用',
      detail: '請檢查回報的封包格式問題。',
    });
    expect(localizeTelemetryHealth({
      ...mockHealth,
      state: 'waiting',
      validFrames: 0,
      hasObservedPacket: false,
      errors: [],
    }, t)).toEqual({
      label: '等待資料輸出',
      detail: '目前尚無資料輸出封包到達此應用程式。',
    });
  });
});
