import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || [
  path.join(repo, 'frontend/node_modules/playwright-core/index.mjs'),
  path.join(repo, 'node_modules/playwright-core/index.mjs'),
  path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs'),
].find((candidate) => existsSync(candidate));
if (!pwPath) throw new Error('Set FH6_PLAYWRIGHT_MODULE to playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);

const out = path.join(repo, 'docs/visual-review/narrator-20261128-telemetry-dashboard');
await fs.mkdir(out, { recursive: true });

const dicts = Object.fromEntries(
  await Promise.all(
    ['en-us', 'zh-tw', 'ja-jp'].map(async (lang) => [
      lang,
      JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8')),
    ]),
  ),
);

const executablePath = process.env.FH6_CHROMIUM || (
  process.platform === 'win32'
    ? [
        'ms-playwright/chromium-1234/chrome-win64/chrome.exe',
        'ms-playwright/chromium-1223/chrome-win64/chrome.exe',
      ]
        .map((rel) => path.join(process.env.LOCALAPPDATA || '', rel))
        .find((candidate) => existsSync(candidate))
    : '/usr/bin/chromium'
);

const buildPacket = (mode, tick) => {
  const isEv = mode === 'live-ev';
  const progress = Math.min(1, tick / 6);
  return JSON.stringify({
    IsRaceOn: 1,
    TimestampMS: 1000 + tick * 40,
    CarOrdinal: isEv ? 202 : 101,
    CarClass: 4,
    CarPerformanceIndex: 845,
    EngineMaxRpm: 8000,
    EngineIdleRpm: isEv ? 0 : 900,
    CurrentEngineRpm: isEv ? 6400 : 7500,
    AccelerationX: isEv ? -6.2 : 8.4,
    AccelerationY: 0,
    AccelerationZ: isEv ? -4.8 : 5.6,
    VelocityX: 0,
    VelocityY: 0,
    VelocityZ: 54,
    Yaw: 0,
    NormalizedSuspensionTravel: [0.42, 0.48, 0.54, 0.51],
    SuspensionTravelMeters: [0.06, 0.07, 0.08, 0.075],
    TireSlipRatio: [0.16, 0.19, 0.24, 0.22],
    TireSlipAngle: [0.38, 0.44, 0.35, 0.41],
    TireTemp: [194, 198, 189, 192],
    SpeedMetersPerSecond: 42 + progress * 16,
    PowerWatts: isEv ? -45000 : 280000 + progress * 80000,
    TorqueNewtons: isEv ? -120 : 480 + progress * 60,
    Boost: isEv ? 0 : 145000,
    Fuel: 0.78,
    BestLap: 64.215,
    LastLap: 65.84,
    CurrentLap: 28.412,
    AccelInput: isEv ? 0 : Math.round(180 + progress * 55),
    BrakeInput: isEv ? 120 : 24,
    ClutchInput: 0,
    HandBrakeInput: 0,
    Gear: isEv ? 1 : 4,
    SteerInput: isEv ? 52 : -55,
    RacePosition: 2,
  });
};

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, scenario: 'live-ice' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 1280, height: 720, scenario: 'live-ice' },
  { core: 'swiss', mode: 'light', language: 'ja-jp', width: 1280, height: 720, scenario: 'live-ice' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, scenario: 'hud-paused' },
  { core: 'rhine-lab', mode: 'light', language: 'zh-tw', width: 1280, height: 720, scenario: 'hud-paused' },
  { core: 'rhine-lab', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, scenario: 'live-ev', focusSwitch: true },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, scenario: 'live-ice' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, scenario: 'hud-paused' },
];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const results = [];

try {
  for (const item of cases) {
    const { core, mode, language, width, height, scenario, focusSwitch } = item;
    const isPaused = scenario === 'hud-paused';
    const theme = {
      halfmoonCore: core,
      mode,
      primaryColor: '#00f0ff',
      secondaryColor: '#ff003c',
      accentColor: '#7000ff',
      customCSS: '',
    };
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);

    const intervals = [];
    await context.routeWebSocket('**/ws/telemetry', (ws) => {
      let tick = 0;
      const sendNext = () => {
        try {
          ws.send(buildPacket(scenario, tick++));
        } catch {
          // ignore closed socket
        }
      };
      setTimeout(sendNext, 40);
      const timer = setInterval(sendNext, 45);
      intervals.push(timer);
    });
    await context.routeWebSocket('**/ws/overlay', () => {});

    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') {
        data = {
          platform: 'windows',
          capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true },
          telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null },
        };
      } else if (p === '/api/settings') {
        data = { language, theme, auto_check_updates: false };
      } else if (p === '/api/languages') {
        data = Object.keys(dicts).map((code) => ({ code, name: code }));
      } else if (p.startsWith('/api/languages/')) {
        data = dicts[p.split('/').pop()];
      } else if (p === '/api/overlay/config') {
        data = {
          enabled: isPaused,
          pauseTelemetryViewWhenActive: isPaused,
          hudStyle: 'simple',
          selectedMonitorIndex: 0,
        };
      } else if (p === '/api/cars/database') {
        data = {};
      } else if (p === '/api/cars/with_params' || p === '/api/audio/devices' || p === '/api/hud/styles' || p === '/api/analysis/sessions' || p === '/api/road/workflows' || p.endsWith('/routes')) {
        data = [];
      } else if (p === '/api/companion/status') {
        data = { enabled: false, clients: [] };
      }
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const t = (key) => (language === 'en-us' ? key : dicts[language][key] ?? key);
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4185/');

    if (isPaused) {
      await page.locator('.popover[role="dialog"]').waitFor();
      await page.waitForTimeout(250);
    } else {
      await page.getByText(t('Driver Inputs & Engine'), { exact: true }).waitFor();
      await page.waitForTimeout(450);
    }

    if (focusSwitch) {
      const switchLabel = `${t('Toggle chart rendering for this section')}: ${t('Live Telemetry Traces')}`;
      const sw = page.getByRole('switch', { name: switchLabel, exact: true });
      await sw.focus();
      await page.getByRole('tooltip').waitFor();
      await page.waitForTimeout(100);
    }

    const fileName = `${core}-${mode}-${language}-${width}-${scenario}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate(() => {
      const driverCard = document.querySelector('#driver-card-title')?.textContent?.trim() ?? '';
      const steerDir = document.querySelector('.telemetry-steer-gauge__direction')?.textContent?.trim() ?? '';
      const popoverTitle = document.querySelector('.popover[role="dialog"] .popover-header')?.textContent?.trim() ?? null;
      const popoverBody = document.querySelector('.popover[role="dialog"] .popover-body')?.textContent?.trim() ?? null;
      const tooltipText = document.querySelector('[role="tooltip"]')?.textContent?.trim() ?? null;
      const carText = document.querySelector('.telemetry-vehicle-status .text-truncate')?.textContent?.trim() ?? '';
      return {
        driverCard,
        steerDir,
        popoverTitle,
        popoverBody,
        tooltipText,
        carText,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    for (const timer of intervals) clearInterval(timer);
    results.push({ name: fileName, core, mode, language, width, height, scenario, ...metrics, errors });
    await context.close();
  }

  await fs.writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify(
      {
        captureDate: '2026-11-28',
        components: [
          'frontend/src/features/telemetry/TelemetryView.tsx',
          'frontend/src/features/telemetry/components/ArcSteerGauge.tsx',
          'frontend/src/features/telemetry/components/VehicleDynamicsDisplay.tsx',
          'frontend/src/features/telemetry/components/TireRadar.tsx',
        ],
        mockedBackend: true,
        cases: results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
