import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/narrator-20261125-step1-goal-setup');
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

const makeProfile = ({
  drivetrain,
  emptyCore = true,
  isElectric = false,
  roadAwdRearPercent = undefined,
}) => ({
  weight: emptyCore ? 0 : 1350,
  ...(emptyCore ? {} : { weight_distribution: 54 }),
  drivetrain,
  induction: 'NA',
  maxHp: emptyCore ? 0 : 520,
  maxTorque: emptyCore ? 0 : 600,
  maxHpRpm: 7200,
  maxTorqueRpm: 4800,
  aeroEfficiency: 0.5,
  isElectric,
  ...(roadAwdRearPercent !== undefined ? { roadAwdRearPercent } : {}),
  dyno_curve: {},
  adjustability: {
    gears: 6,
    gearbox: 'Full',
    suspension: 'Race',
    arb: 'Adjustable',
    aero: 'Fixed',
    brakes: 'Adjustable',
    diff: 'Adjustable',
  },
});

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, goal: 'Drift', drivetrain: 'RWD', emptyCore: true, isElectric: false, tag: 'drift-empty' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 1280, height: 720, goal: 'Road', drivetrain: 'AWD', emptyCore: true, isElectric: false, roadAwdRearPercent: 65, tag: 'road-awd' },
  { core: 'swiss', mode: 'light', language: 'ja-jp', width: 1280, height: 720, goal: 'Drift', drivetrain: 'RWD', emptyCore: true, isElectric: false, tag: 'drift-empty' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, goal: 'Rally', drivetrain: 'AWD', emptyCore: false, isElectric: true, tag: 'rally-ev' },
  { core: 'rhine-lab', mode: 'light', language: 'zh-tw', width: 1280, height: 720, goal: 'Drift', drivetrain: 'RWD', emptyCore: false, isElectric: false, tag: 'drift-auto' },
  { core: 'rhine-lab', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, goal: 'Road', drivetrain: 'AWD', emptyCore: false, isElectric: false, roadAwdRearPercent: 65, tag: 'road-awd' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, goal: 'Drift', drivetrain: 'RWD', emptyCore: true, isElectric: false, tag: 'drift-empty' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, goal: 'Rally', drivetrain: 'AWD', emptyCore: false, isElectric: true, tag: 'rally-ev' },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

try {
  for (const item of cases) {
    const { core, mode, language, width, height, goal, drivetrain, emptyCore, isElectric, roadAwdRearPercent, tag } = item;
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
      localStorage.setItem('tuning-workflow-state', JSON.stringify({ step: 1, goal: 'Road', season: 'Summer', reviewHistory: false }));
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});

    const carProfile = makeProfile({ drivetrain, emptyCore, isElectric, roadAwdRearPercent });
    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      const method = route.request().method();
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
      } else if (p === '/api/cars/database') {
        data = { '42': '2020 Nissan GT-R NISMO' };
      } else if (p === '/api/cars/with_params') {
        data = [{ id: '42', name: '2020 Nissan GT-R NISMO' }];
      } else if (p.startsWith('/api/car_params/')) {
        data = method === 'POST' ? JSON.parse(route.request().postData() || '{}') : carProfile;
      } else if (p === '/api/tuning/profile') {
        data = JSON.parse(route.request().postData() || '{}');
      } else if (p === '/api/tuning/workflow') {
        const body = JSON.parse(route.request().postData() || '{}');
        data = {
          schemaVersion: 'tuning-workflow-result/v2',
          chassis: {
            arb: { front: 26.4, rear: 29.8 },
            springs: { front: 142.5, rear: 128.0, heightF: 12.2, heightR: 12.8 },
            damping: { reboundF: 10.4, reboundR: 9.6, bumpF: 6.4, bumpR: 5.9 },
            diff: { accelF: 35, decelF: 10, accelR: 70, decelR: 25, centerRear: 65 },
          },
          alignment: null,
          gearing: null,
          recommendation: null,
          tireEvidence: null,
          evidenceProvenance: null,
          readiness: { mechanical: !emptyCore, engineInputs: !emptyCore, measuredEngine: false, gearingAvailable: false },
          baselinePreview: {
            schemaVersion: 'tuning-baseline-preview/v1',
            modelVersion: 'fh6-v2',
            goal: body.goal || goal,
            stiffness: 'neutral',
            balance: 'neutral',
            missingInputs: [],
            canApply: true,
            affectedFields: [],
            fields: [],
          },
        };
      } else if (p === '/api/companion/status') {
        data = { enabled: false, active_connections: 0, port: 5300 };
      } else {
        data = [];
      }
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const t = (key) => (language === 'en-us' ? key : dicts[language][key] ?? key);
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4182/');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: t('Tune'), exact: true }).click();
    const vehicleSelect = page.locator('#tune-saved-vehicle');
    await vehicleSelect.waitFor();
    await vehicleSelect.selectOption('42');

    const goalSelect = page.locator('#tuning-draft-goal');
    await goalSelect.waitFor();
    if (goal !== 'Road') {
      await goalSelect.selectOption(goal);
    }

    const step1Heading = page.locator('h3.workspace-section-heading').filter({
      hasText: t('Step 1: Define tuning goals & check parameters'),
    });
    await step1Heading.waitFor();
    await step1Heading.evaluate((el) => {
      const section = el.closest('.workspace-section') ?? el;
      section.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
    await page.waitForTimeout(150);

    const fileName = `${core}-${mode}-${language}-${width}-${tag}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate(() => {
      const h3 = document.querySelector('h3.workspace-section-heading');
      const placeholders = {
        weight: document.querySelector('#step1-weight')?.getAttribute('placeholder') ?? null,
        weightDistribution: document.querySelector('#step1-weight_distribution')?.getAttribute('placeholder') ?? null,
        maxHp: document.querySelector('#step1-maxHp')?.getAttribute('placeholder') ?? null,
        maxTorque: document.querySelector('#step1-maxTorque')?.getAttribute('placeholder') ?? null,
      };
      const naOption = document.querySelector('#step1-induction option[value="NA"]')?.textContent?.trim() ?? null;
      return {
        heading: h3?.textContent?.trim() ?? '',
        placeholders,
        naOption,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    results.push({ name: fileName, core, mode, language, width, height, goal, drivetrain, emptyCore, isElectric, ...metrics, errors });
    await context.close();
  }

  await fs.writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify({
      captureDate: '2026-11-25',
      component: 'frontend/src/features/tuning/components/Step1GoalSetup.tsx',
      mockedBackend: true,
      cases: results,
    }, null, 2) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
