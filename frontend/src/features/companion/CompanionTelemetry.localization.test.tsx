// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../../context/SettingsContext';
import { ToastProvider } from '../../context/ToastContext';
import { backendFetch } from '../../services/backend';
import CompanionTelemetry from './CompanionTelemetry';

vi.mock('../../services/backend', () => ({ backendFetch: vi.fn() }));
vi.mock('../telemetry/TelemetryView', () => ({
  default: ({ focusedCard }: { focusedCard: string }) => <div data-testid="mock-telemetry-view" data-card={focusedCard} />,
}));

const languages = ['en-us', 'ja-jp', 'zh-tw'];
const dictionaries: Record<string, Record<string, string>> = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(readFileSync(new URL('../../../../lang/' + language + '.json', import.meta.url), 'utf8')),
  ]),
);

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(backendFetch).mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each(languages)(
  'renders localized tab names and accessible full-title labels in %s and switches cards',
  async (language) => {
    const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    vi.mocked(backendFetch).mockImplementation(async (path) => {
      if (path === '/api/languages') return response(languages.map((code) => ({ code, name: code })));
      if (path === '/api/settings') return response({ language });
      if (path.startsWith('/api/languages/')) return response(dictionaries[path.slice('/api/languages/'.length)]);
      throw new Error('Unexpected request: ' + path);
    });

    await act(async () => {
      root.render(
        <ToastProvider>
          <SettingsProvider>
            <CompanionTelemetry />
          </SettingsProvider>
        </ToastProvider>,
      );
    });

    const dict = dictionaries[language];
    const tablist = host.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute('aria-label')).toBe(dict['companion.telemetry_cards']);

    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
    expect(tabs).toHaveLength(5);

    const expectedShortLabels = [
      dict['companion.cards.driver'],
      dict['companion.cards.traces'],
      dict['companion.cards.dynamics'],
      dict['companion.cards.tires'],
      dict['companion.cards.suspension'],
    ];
    const expectedFullTitles = [
      dict['Driver Inputs & Engine'],
      dict['Live Telemetry Traces'],
      dict['Vehicle Dynamics Overview'],
      dict['Tire Grip & Status'],
      dict['Suspension Travel'],
    ];

    expect(tabs.map((tab) => tab.textContent)).toEqual(expectedShortLabels);
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(expectedFullTitles);

    // Initial selected tab is driver
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');

    // Click on traces tab
    await act(async () => {
      tabs[1].click();
    });

    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.companion-telemetry')!.getAttribute('data-card')).toBe('traces');
  },
);
