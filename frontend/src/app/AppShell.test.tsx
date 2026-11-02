// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

let mockTranslations: Record<string, string> = {};

vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    t: (text: string) => mockTranslations[text] ?? text
  })
}));
vi.mock('../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: null, followLiveCar: vi.fn(), telemetryCarId: null, selectionSource: null }) }));
vi.mock('../hooks/useTelemetry', () => ({ useTelemetry: () => ({}) }));
vi.mock('@platform/hud', () => ({ HudRuntime: () => null }));
vi.mock('./AppHeader', () => ({
  AppHeader: ({ onOpenSurface }: { onOpenSurface?: (s: string) => void }) => (
    <header data-testid="header">
      <button data-testid="open-companion" onClick={() => onOpenSurface?.('companion')}>Companion</button>
    </header>
  )
}));
vi.mock('../components/DiagnosticConsole', () => ({ default: () => null }));
vi.mock('../features/theme/ThemeView', () => ({ default: () => null }));
vi.mock('../features/settings/components/CompanionSettingsCard', () => ({
  CompanionSettingsCard: () => <div>Companion Settings Content</div>
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockTranslations = {};
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll('.offcanvas, .offcanvas-backdrop').forEach(el => el.remove());
  vi.restoreAllMocks();
});

it('renders a skip-to-content link that bypasses header navigation and focuses main', async () => {
  const DummyWorkspace = () => <div>Workspace Content</div>;
  await act(async () => {
    root.render(
      <AppShell
        variant="full"
        workspaces={{ live: DummyWorkspace }}
      />
    );
  });

  const skipLink = host.querySelector<HTMLAnchorElement>('a.skip-to-content')!;
  expect(skipLink).not.toBeNull();
  expect(skipLink.getAttribute('href')).toBe('#main-content');
  expect(skipLink.classList.contains('visually-hidden-focusable')).toBe(true);
  expect(skipLink.textContent).toBe('Skip to main content');

  const main = host.querySelector<HTMLElement>('main#main-content')!;
  expect(main).not.toBeNull();
  expect(main.getAttribute('tabindex')).toBe('-1');

  // Verify keyboard/click activation shifts focus directly to main
  await act(async () => {
    skipLink.click();
  });
  expect(document.activeElement).toBe(main);
});

it('translates skip-to-content link when a localized string is available', async () => {
  mockTranslations = { 'Skip to main content': '跳至主要內容' };
  const DummyWorkspace = () => <div>Workspace Content</div>;
  await act(async () => {
    root.render(
      <AppShell
        variant="full"
        workspaces={{ live: DummyWorkspace }}
      />
    );
  });

  const skipLink = host.querySelector<HTMLAnchorElement>('a.skip-to-content')!;
  expect(skipLink.textContent).toBe('跳至主要內容');
});

it('renders Companion App dialog title through AppDialog single-pass translation', async () => {
  mockTranslations = { 'Companion App': '隨行應用程式' };
  const DummyWorkspace = () => <div>Workspace Content</div>;
  await act(async () => {
    root.render(
      <AppShell
        variant="full"
        workspaces={{ live: DummyWorkspace }}
      />
    );
  });

  const trigger = host.querySelector<HTMLButtonElement>('[data-testid="open-companion"]')!;
  await act(async () => {
    trigger.click();
  });

  const dialogTitle = document.querySelector('.app-dialog--companion .offcanvas-title');
  expect(dialogTitle?.textContent).toBe('隨行應用程式');
});
