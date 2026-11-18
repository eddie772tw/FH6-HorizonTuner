// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStatus } from './AppStatus';
import type { TelemetryHealth } from '../features/onboarding/telemetryHealth';

const languages = ['en-us', 'ja-jp', 'zh-tw'] as const;
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map(language => [
    language,
    JSON.parse(readFileSync(new URL('../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

let activeLang: (typeof languages)[number] = 'en-us';
let mockConnected = true;
let mockHealth: TelemetryHealth;
let mockBackendPort = 8001;

vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { language: activeLang },
    t: (text: string, params?: Record<string, string | number>) => {
      let result = dictionaries[activeLang][text] ?? text;
      if (params) {
        Object.entries(params).forEach(([key, val]) => {
          result = result.replace(`{${key}}`, String(val));
        });
      }
      return result;
    },
  }),
}));

vi.mock('../hooks/useTelemetry', () => ({
  useTelemetry: () => ({ isConnected: mockConnected }),
}));

vi.mock('../features/onboarding/useTelemetryHealth', () => ({
  useTelemetryHealth: () => mockHealth,
}));

vi.mock('../services/backend', () => ({
  PREFERRED_BACKEND_PORT: 8001,
  getBackendPort: () => mockBackendPort,
  backendHttpUrl: (path: string) => `http://127.0.0.1:${mockBackendPort}${path}`,
}));

vi.mock('../features/onboarding/DataOutGuide', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/onboarding/DataOutGuide')>();
  return {
    ...actual,
    default: () => null,
  };
});

describe('AppStatus localization & accessibility', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.setItem('fh6-data-out-guide/v1', 'completed');
    mockConnected = true;
    mockBackendPort = 8001;
    mockHealth = {
      state: 'waiting',
      label: 'Waiting for Data Out',
      detail: 'No Data Out packet has reached this app yet.',
      datagramsReceived: 0,
      validFrames: 0,
      hasObservedPacket: false,
      lastPacketAt: null,
      errors: [],
    };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each(languages)('localizes Data Out status tooltip/aria-label and dynamic MCP popover in %s', async (lang) => {
    activeLang = lang;
    mockBackendPort = 8002;
    const dict = dictionaries[lang];
    const onOpenMcp = vi.fn();

    await act(async () => {
      root.render(<AppStatus onOpenMcp={onOpenMcp} />);
    });

    const dataOutBtn = host.querySelector<HTMLButtonElement>('button[title]')!;
    expect(dataOutBtn).not.toBeNull();
    expect(dataOutBtn.getAttribute('aria-label')).toBe(
      `${dict['Open Data Out guide and health details']}. ${dict['Backend connected']}. ${dict['Waiting for Data Out']}`,
    );
    expect(dataOutBtn.getAttribute('title')).toBe(
      `${dict['Backend connected']}. ${dict['Waiting for Data Out']}`,
    );
    if (lang !== 'en-us') {
      expect(dataOutBtn.getAttribute('title')).not.toContain('Waiting for Data Out');
      expect(dataOutBtn.getAttribute('aria-label')).not.toContain('Waiting for Data Out');
    }

    const mcpBtn = host.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')!;
    expect(mcpBtn).not.toBeNull();
    expect(mcpBtn.getAttribute('title')).toBe(dict['MCP Endpoint Notice']);
    expect(mcpBtn.getAttribute('aria-label')).toBe(`${dict['MCP']} :8002 — ${dict['MCP Endpoint Notice']}`);

    const popover = host.querySelector<HTMLDivElement>('.popover[role="status"]')!;
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain(dict['MCP Endpoint Notice']);
    expect(popover.textContent).toContain(dict['Release Build could not use backend port 8001 and selected a dynamic port.']);
    expect(popover.textContent).toContain(`${dict['Current backend port']}: 8002`);

    const closeBtn = popover.querySelector<HTMLButtonElement>('button.btn-close')!;
    expect(closeBtn.getAttribute('aria-label')).toBe(dict['Close']);

    const openSettingsBtn = Array.from(popover.querySelectorAll('button')).find(
      btn => btn.textContent?.trim() === dict['Open MCP Settings'],
    );
    expect(openSettingsBtn).toBeDefined();

    await act(async () => {
      openSettingsBtn!.click();
    });
    expect(onOpenMcp).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.popover[role="status"]')).toBeNull();
  });

  it('localizes all health states in zh-tw and ja-jp without raw English label leakage', async () => {
    const states: Array<[TelemetryHealth['state'], string]> = [
      ['active', 'Data Out receiving'],
      ['stale', 'Data Out not currently receiving'],
      ['invalid', 'Data received, but not usable'],
      ['unavailable', 'Health unavailable'],
      ['waiting', 'Waiting for Data Out'],
    ];

    for (const lang of ['zh-tw', 'ja-jp'] as const) {
      activeLang = lang;
      const dict = dictionaries[lang];
      for (const [state, rawLabel] of states) {
        mockHealth = {
          ...mockHealth,
          state,
          label: rawLabel,
          validFrames: state === 'active' ? 12 : 0,
        };
        await act(async () => {
          root.render(<AppStatus onOpenMcp={vi.fn()} />);
        });
        const dataOutBtn = host.querySelector<HTMLButtonElement>('button')!;
        expect(dataOutBtn.getAttribute('title')).toContain(dict[rawLabel]);
        expect(dataOutBtn.getAttribute('title')).not.toContain(rawLabel);
        expect(dataOutBtn.getAttribute('aria-label')).toContain(dict[rawLabel]);
        expect(dataOutBtn.getAttribute('aria-label')).not.toContain(rawLabel);
      }
    }
  });
});
