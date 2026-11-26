import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/narrator-20261126-analysis-route-panels');
await fs.mkdir(out, { recursive: true });

const dicts = Object.fromEntries(
  await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async (lang) => [
    lang,
    JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8')),
  ])),
);

const executablePath = process.env.FH6_CHROMIUM || (
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe')
    : '/usr/bin/chromium'
);

const sampleRoutes = [
  {
    route_id: 'tt-1',
    name: 'Goliath Sprint',
    mode: 'time_trial',
    start_x: 120.5,
    start_y: 12.0,
    start_z: -45.2,
    start_radius: 18,
  },
  {
    route_id: 'roam-1',
    name: 'Mountain Pass',
    mode: 'roaming',
    start_x: 10.0,
    start_y: 5.0,
    start_z: 20.0,
    start_radius: 15,
    end_x: 420.0,
    end_y: 35.0,
    end_z: -180.0,
    end_radius: 20,
  },
];

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, routeMode: 'time_trial', showDeleteConfirm: true, tag: 'time-trial-delete' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 1280, height: 720, routeMode: 'roaming', showDeleteConfirm: false, tag: 'roaming' },
  { core: 'swiss', mode: 'light', language: 'ja-jp', width: 1280, height: 720, routeMode: 'time_trial', showDeleteConfirm: true, tag: 'time-trial-delete' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, routeMode: 'roaming', showDeleteConfirm: false, tag: 'roaming' },
  { core: 'rhine-lab', mode: 'light', language: 'zh-tw', width: 1280, height: 720, routeMode: 'time_trial', showDeleteConfirm: true, tag: 'time-trial-delete' },
  { core: 'rhine-lab', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, routeMode: 'roaming', showDeleteConfirm: false, tag: 'roaming' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, routeMode: 'roaming', showDeleteConfirm: false, tag: 'roaming' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, routeMode: 'time_trial', showDeleteConfirm: true, tag: 'time-trial-delete' },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

try {
  for (const item of cases) {
    const { core, mode, language, width, height, routeMode, showDeleteConfirm, tag } = item;
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});

    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') {
        data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      } else if (p === '/api/settings') {
        data = { language, theme, auto_check_updates: false };
      } else if (p === '/api/languages') {
        data = Object.keys(dicts).map((code) => ({ code, name: code }));
      } else if (p.startsWith('/api/languages/')) {
        data = dicts[p.split('/').pop()];
      } else if (p === '/api/overlay/config') {
        data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      } else if (p === '/api/companion/status') {
        data = { enabled: false, active_connections: 0, port: 5300 };
      } else if (p === '/api/analysis/status') {
        data = { is_recording: false, recording_count: 0, manual_mode: false, recording_mode: 'circuit', armed: false, armed_route_id: null };
      } else if (p === '/api/analysis/sessions') {
        data = [];
      } else if (p === '/api/analysis/data') {
        data = { data: [] };
      } else if (p === '/api/analysis/routes') {
        data = sampleRoutes;
      } else {
        data = [];
      }
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const t = (key, params) => {
      let text = language === 'en-us' ? (dicts[language][key] ?? key) : (dicts[language][key] ?? key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    };

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4183/');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: t('Sessions'), exact: true }).click();
    const modeLabel = routeMode === 'time_trial' ? t('Time Trial') : t('Free Roam');
    const modeButton = page.getByRole('button', { name: modeLabel, exact: true });
    await modeButton.waitFor();
    await modeButton.click();

    const headingKey = routeMode === 'time_trial'
      ? 'Time Trial Closed Circuit Gate Configuration'
      : 'Free Roam Point-to-Point Route Configuration';
    const heading = page.locator('h6').filter({ hasText: t(headingKey) });
    await heading.waitFor();

    const routeSelect = page.getByLabel(t('Select Route'));
    await routeSelect.waitFor();
    await routeSelect.selectOption(routeMode === 'time_trial' ? 'tt-1' : 'roam-1');

    if (showDeleteConfirm) {
      const routeName = routeMode === 'time_trial' ? 'Goliath Sprint' : 'Mountain Pass';
      await page.getByRole('button', { name: t('Delete {name}', { name: routeName }), exact: true }).click();
      await page.getByText(t('Are you sure you want to delete route "{name}"?', { name: routeName })).waitFor();
    }

    await heading.evaluate((el) => {
      const card = el.closest('.card') ?? el;
      card.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
    await page.waitForTimeout(150);

    const fileName = `${core}-${mode}-${language}-${width}-${tag}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate((captureLabel) => {
      const h6 = document.querySelector('.sessions-workspace h6');
      const card = h6?.closest('.card');
      const captureAriaLabels = card
        ? Array.from(card.querySelectorAll('button'))
          .filter((b) => b.textContent?.trim() === captureLabel)
          .map((b) => b.getAttribute('aria-label'))
        : [];
      const confirmParagraph = card?.querySelector('[id$="-delete-confirm-label"]')?.textContent?.trim() ?? null;
      const deleteTriggerLabel = card?.querySelector('button[aria-expanded]')?.getAttribute('aria-label') ?? null;
      return {
        heading: h6?.textContent?.trim() ?? '',
        deleteTriggerLabel,
        confirmParagraph,
        captureAriaLabels,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, t('Capture Live'));

    results.push({ name: fileName, core, mode, language, width, height, routeMode, showDeleteConfirm, ...metrics, errors });
    await context.close();
  }

  await fs.writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify({
      captureDate: '2026-11-26',
      components: [
        'frontend/src/features/analysis/AnalysisRouteSection.tsx',
        'frontend/src/features/analysis/RoamingRoutePanel.tsx',
        'frontend/src/features/analysis/TimeTrialRoutePanel.tsx',
        'frontend/src/features/analysis/RouteActionBar.tsx',
      ],
      mockedBackend: true,
      cases: results,
    }, null, 2) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
