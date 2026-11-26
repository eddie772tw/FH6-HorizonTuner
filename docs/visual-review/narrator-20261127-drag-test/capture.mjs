import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/narrator-20261127-drag-test');
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

const samplePoints = Array.from({ length: 24 }, (_, idx) => {
  const time = Number((idx * 0.35).toFixed(2));
  return {
    time,
    SpeedMetersPerSecond: 5 + idx * 2.6,
    CurrentEngineRpm: 3500 + ((idx * 550) % 4200),
    Gear: Math.min(6, 1 + Math.floor(idx / 4)),
    AccelInput: 255,
    BrakeInput: 0,
    TorqueNewtons: 420,
    PowerWatts: 220000,
    TireSlipRatio: [0.02, 0.03, 0.07, 0.09],
  };
});

const comparePoints = samplePoints.map((p) => ({
  ...p,
  SpeedMetersPerSecond: p.SpeedMetersPerSecond * 0.97,
  CurrentEngineRpm: p.CurrentEngineRpm - 150,
  TireSlipRatio: [0.02, 0.02, 0.08, 0.11],
}));

const sampleAnalysis = {
  car_name: 'Supra RZ',
  drivetrain: 'AWD',
  max_gear: 6,
  max_speed_kmh: 242,
  duration: 8.4,
  launch_slip_percent: 8.5,
  launch_recommendation: 'Launch grip is stable across 1st gear acceleration.',
  shifts: [
    { from_gear: 1, to_gear: 2, n_before: 7900, n_after: 5450, rpm_drop: 2450, retention: 0.69, shift_time: 0.18 },
    { from_gear: 2, to_gear: 3, n_before: 7950, n_after: 5820, rpm_drop: 2130, retention: 0.732, shift_time: 0.16 },
  ],
  shift_recommendations: [],
  final_drive_recommendation: 'Final drive ratio aligns with peak power band.',
  path_valid: false,
  max_deviation_meters: 14.2,
  yaw_variance_rad: 0.02,
  stability_diagnostics: [],
};

const compareAnalysis = {
  ...sampleAnalysis,
  car_name: 'GT-R R34',
  drivetrain: 'RWD',
  max_speed_kmh: 236,
  duration: 8.7,
  launch_slip_percent: 11.2,
};

const sampleSessions = [
  { filename: 'run1.json', timestamp: 1700000000, car_name: 'GT-R R34', max_speed_kmh: 236 },
];

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, dragStatus: 'idle', pointsCount: 0, openPopover: true, openDelete: false, selectCompare: false, openDetails: false, tag: 'idle-popover' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 1280, height: 720, dragStatus: 'finished', pointsCount: 600, openPopover: false, openDelete: false, selectCompare: true, openDetails: false, tag: 'finished-compare' },
  { core: 'swiss', mode: 'light', language: 'ja-jp', width: 1280, height: 720, dragStatus: 'idle', pointsCount: 0, openPopover: false, openDelete: true, selectCompare: true, openDetails: false, tag: 'idle-delete' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, dragStatus: 'finished', pointsCount: 600, openPopover: false, openDelete: false, selectCompare: true, openDetails: false, tag: 'finished-compare' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, dragStatus: 'finished', pointsCount: 600, openPopover: false, openDelete: false, selectCompare: true, openDetails: true, tag: 'gearing-assist' },
  { core: 'rhine-lab', mode: 'light', language: 'zh-tw', width: 1280, height: 720, dragStatus: 'idle', pointsCount: 0, openPopover: true, openDelete: false, selectCompare: false, openDetails: false, tag: 'idle-popover' },
  { core: 'rhine-lab', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, dragStatus: 'recording', pointsCount: 420, openPopover: false, openDelete: false, selectCompare: false, openDetails: false, tag: 'recording' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, dragStatus: 'idle', pointsCount: 0, openPopover: true, openDelete: false, selectCompare: false, openDetails: false, tag: 'idle-popover' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, dragStatus: 'finished', pointsCount: 600, openPopover: false, openDelete: false, selectCompare: true, openDetails: false, tag: 'finished-compare' },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

try {
  for (const item of cases) {
    const { core, mode, language, width, height, dragStatus, pointsCount, openPopover, openDelete, selectCompare, openDetails, tag } = item;
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
      } else if (p === '/api/drag/status') {
        data = { status: dragStatus, points_count: pointsCount };
      } else if (p === '/api/drag/sessions') {
        data = sampleSessions;
      } else if (p === '/api/drag/data') {
        data = samplePoints;
      } else if (p === '/api/drag/analysis') {
        data = sampleAnalysis;
      } else if (p === '/api/drag/sessions/run1.json') {
        data = { data: comparePoints, analysis: compareAnalysis };
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
      let text = language === 'en-us' ? key : (dicts[language][key] ?? key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, () => String(v));
        }
      }
      return text;
    };

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4184/');
    await page.keyboard.press('Escape');

    const dragTab = page.getByRole('tab', { name: t('Drag Test'), exact: true });
    await dragTab.waitFor();
    await dragTab.click();

    if (dragStatus === 'recording') {
      await page.getByText(t('RECORDING ({count} pts)', { count: pointsCount })).waitFor();
    } else if (dragStatus === 'finished') {
      await page.getByText(t('Run Summary')).waitFor();
    } else {
      await page.getByText(t('How to perform a Drag Test:')).waitFor();
    }

    if (selectCompare) {
      const select = page.locator('#drag-test-compare-session');
      await select.waitFor();
      await select.selectOption('run1.json');
    }

    if (openDelete) {
      await page.getByRole('button', { name: t('Delete selected session'), exact: true }).click();
      await page.locator('[id$="-delete-confirm-label"]').waitFor();
    }

    if (openPopover) {
      const readyBtn = page.getByRole('button', { name: t('RUN CONDITIONS READY'), exact: true });
      await readyBtn.waitFor();
      if ((await readyBtn.getAttribute('aria-expanded')) !== 'true') {
        await readyBtn.evaluate((el) => el.click());
      }
      await page.getByRole('dialog').waitFor();
    }

    if (dragStatus === 'finished') {
      await page.getByText(t('Metrics')).waitFor();
      if (openDetails) {
        await page.locator('.drag-test-results details').evaluate((el) => {
          el.setAttribute('open', '');
        });
        await page.locator('.drag-test-results details').scrollIntoViewIfNeeded();
      }
    }

    await page.waitForTimeout(200);

    const fileName = `${core}-${mode}-${language}-${width}-${tag}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate(() => {
      const ws = document.querySelector('.drag-test-workspace');
      const alertText = ws?.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
      const statusText = ws?.querySelector('[role="status"]')?.textContent?.trim() ?? null;
      const deletePrompt = ws?.querySelector('[id$="-delete-confirm-label"]')?.textContent?.trim() ?? null;
      const popoverTitle = ws?.querySelector('[id$="-conditions-title"]')?.textContent?.trim() ?? null;
      const thTexts = Array.from(ws?.querySelectorAll('th') ?? []).map((th) => th.textContent?.trim());
      return {
        alertText,
        statusText,
        deletePrompt,
        popoverTitle,
        thTexts,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    results.push({ name: fileName, core, mode, language, width, height, dragStatus, ...metrics, errors });
    await context.close();
  }

  await fs.writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify({
      captureDate: '2026-11-27',
      components: ['frontend/src/features/drag_test/DragTestView.tsx'],
      mockedBackend: true,
      cases: results,
    }, null, 2) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
