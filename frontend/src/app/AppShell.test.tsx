// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ t: (text: string) => text }) }));
vi.mock('../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: null, followLiveCar: vi.fn(), telemetryCarId: null, selectionSource: null }) }));
vi.mock('../hooks/useTelemetry', () => ({ useTelemetry: () => ({}) }));
vi.mock('@platform/hud', () => ({ HudRuntime: () => null }));
vi.mock('./AppHeader', () => ({ AppHeader: () => <header data-testid="header" /> }));
vi.mock('../components/DiagnosticConsole', () => ({ default: () => null }));
vi.mock('../features/theme/ThemeView', () => ({ default: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
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
