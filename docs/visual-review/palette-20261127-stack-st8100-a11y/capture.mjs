import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261127-stack-st8100-a11y');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async (lang) => [
  lang,
  JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8')),
])));
const executablePath = process.env.FH6_CHROMIUM || (
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe')
    : '/usr/bin/chromium'
);

const cases = [
  ['default', 'light', 'en-us', 1280],
  ['default', 'dark', 'zh-tw', 320],
  ['swiss', 'light', 'zh-tw', 1280],
  ['swiss', 'dark', 'ja-jp', 1280],
  ['rhine-lab', 'light', 'ja-jp', 1280],
  ['rhine-lab', 'dark', 'en-us', 1280],
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

try {
  for (const [core, mode, language, width] of cases) {
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    let overlayConfig = {
      enabled: false,
      hudStyle: 'stack_st8100',
      selectedMonitorIndex: 0,
      followAppUnits: true,
      glowIntensity: 1,
      scale: 1,
      useDefaultColors: true,
      elements: { showGauge: true, showMotionEffect: true },
      stackSt8100Field1: 'speed',
      stackSt8100Field2: 'gear',
      stackSt8100Field3: 'race_time',
      stackSt8100Field4: 'tire_avg',
      stackSt8100Page: 'live',
      stackSt8100TemperatureUnit: 'c',
      stackSt8100Dial: 'auto',
      stackSt8100Face: 'black',
      stackSt8100ShiftEnabled: true,
      stackSt8100ShiftPercent: 90,
      stackSt8100Alarms: [
        { enabled: true, metric: 'tire_max', direction: 'high', threshold: 120 },
        { enabled: false, metric: 'boost', direction: 'high', threshold: 1.5 },
        { enabled: false, metric: 'rpm', direction: 'high', threshold: 7000 },
      ],
    };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});
    await context.route('**/hud/**', async (route) => {
      await route.fulfill({ status: 200, json: { author: 'Author', description: 'No description provided.' } });
    });
    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/api/overlay/config' && route.request().method() === 'POST') {
        try { overlayConfig = { ...overlayConfig, ...JSON.parse(route.request().postData() || '{}') }; } catch { /* ignore */ }
        await route.fulfill({ status: 200, json: overlayConfig });
        return;
      }
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map((code) => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = overlayConfig;
      else if (p === '/api/hud/styles') data = { styles: [{ id: 'simple', source: 'builtin', urlPrefix: '/hud' }, { id: 'stack_st8100', source: 'builtin', urlPrefix: '/hud' }] };
      else if (p === '/api/analysis/status') data = { is_recording: false, samples_count: 0, manual_mode: false, recording_mode: 'circuit', armed: false, armed_route_id: null };
      else if (['/api/analysis/routes', '/api/analysis/sessions', '/api/cars/with_params', '/api/cars/database', '/api/audio/devices', '/api/road/workflows'].includes(p)) data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t = (key) => (language === 'en-us' ? key : (dicts[language][key] ?? key));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    await page.getByRole('navigation', { name: t('Workspaces') }).getByRole('button', { name: t('HUD'), exact: true }).click();
    await page.getByRole('tab', { name: t('Main gauge'), exact: true }).waitFor();

    const card = page.locator('[role="group"]').filter({ has: page.locator('select[id$="-alarm-1-metric"]') });
    await card.waitFor();

    const cardChecks = await card.evaluate((el) => {
      const switches = Array.from(el.querySelectorAll('input[role="switch"]'));
      const switchLabels = switches.map((sw) => el.querySelector(`label[for="${sw.id}"]`)?.textContent?.trim() ?? '');
      const uniqueSwitchLabels = new Set(switchLabels).size === switches.length;
      const lcdFieldset = Array.from(el.querySelectorAll('fieldset')).find((fs) => Boolean(fs.getAttribute('aria-describedby')));
      const lcdNote = lcdFieldset ? document.getElementById(lcdFieldset.getAttribute('aria-describedby') ?? '')?.textContent ?? '' : '';
      const metricSelects = Array.from(el.querySelectorAll('select[id$="-metric"]'));
      const resetNotes = metricSelects.map((s) => document.getElementById(s.getAttribute('aria-describedby') ?? '')?.textContent ?? '');
      return {
        switchCount: switches.length,
        switchLabels,
        uniqueSwitchLabels,
        allCursorPointer: switches.every((sw) => getComputedStyle(sw).cursor === 'pointer'),
        lcdNoteLinked: lcdNote.length > 0,
        metricResetLinked: metricSelects.length === 3 && resetNotes.every((txt) => txt.length > 0),
      };
    });
    if (cardChecks.switchCount !== 4 || !cardChecks.uniqueSwitchLabels || !cardChecks.allCursorPointer || !cardChecks.lcdNoteLinked || !cardChecks.metricResetLinked) {
      throw new Error(`Card a11y checks failed for ${core}-${mode}: ${JSON.stringify(cardChecks)}`);
    }

    // State 1: Shift light out-of-range validation and Escape revert
    const shiftInput = card.locator('input[id$="-stackSt8100ShiftPercent"]');
    await shiftInput.fill('150');
    const shiftInvalid = await shiftInput.evaluate((el) => {
      const hint = document.getElementById(el.getAttribute('aria-describedby') ?? '');
      return {
        ariaInvalid: el.getAttribute('aria-invalid'),
        hasDangerClass: el.className.includes('border-danger text-danger-emphasis'),
        hintVisible: hint ? !hint.classList.contains('visually-hidden') : false,
        hintText: hint?.textContent ?? '',
      };
    });
    if (shiftInvalid.ariaInvalid !== 'true' || !shiftInvalid.hasDangerClass || !shiftInvalid.hintVisible || !shiftInvalid.hintText.includes('50–100')) {
      throw new Error(`Shift validation checks failed for ${core}-${mode}: ${JSON.stringify(shiftInvalid)}`);
    }
    await shiftInput.locator('xpath=ancestor::fieldset[1]').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(150);
    const shiftBounds = await page.evaluate(() => ({ width: innerWidth, docScrollWidth: document.documentElement.scrollWidth }));
    if (shiftBounds.docScrollWidth > shiftBounds.width + 1) {
      throw new Error(`Horizontal overflow on shift-invalid for ${core}-${mode}-${width}: ${JSON.stringify(shiftBounds)}`);
    }
    const shiftFile = `${core}-${mode}-${language}-${width}-shift-invalid.png`;
    await page.screenshot({ path: path.join(out, shiftFile) });

    await shiftInput.press('Escape');
    const shiftReverted = await shiftInput.evaluate((el) => ({ value: el.value, ariaInvalid: el.getAttribute('aria-invalid') }));
    if (shiftReverted.value !== '90' || shiftReverted.ariaInvalid !== 'false') {
      throw new Error(`Escape revert failed for ${core}-${mode}: ${JSON.stringify(shiftReverted)}`);
    }

    // State 2: Alarm 1 out-of-range validation & 1280/320 responsive stacking
    const alarm1Input = card.locator('input[id$="-alarm-1-threshold"]');
    await alarm1Input.fill('9999');
    const alarmCheck = await alarm1Input.evaluate((el, expectedWidth) => {
      const hint = document.getElementById(el.getAttribute('aria-describedby') ?? '');
      const fieldset = el.closest('fieldset');
      const dirRect = fieldset?.querySelector('select[id$="-direction"]')?.getBoundingClientRect();
      const inputRect = el.getBoundingClientRect();
      return {
        ariaInvalid: el.getAttribute('aria-invalid'),
        hintVisible: hint ? !hint.classList.contains('visually-hidden') : false,
        hintText: hint?.textContent ?? '',
        stackedVerticallyOn320: expectedWidth === 320 ? Boolean(dirRect && inputRect.top > dirRect.bottom - 1) : null,
        sideBySideOn1280: expectedWidth === 1280 ? Boolean(dirRect && inputRect.left > dirRect.right - 1) : null,
      };
    }, width);
    if (alarmCheck.ariaInvalid !== 'true' || !alarmCheck.hintVisible || !alarmCheck.hintText.includes('-100–800')) {
      throw new Error(`Alarm validation checks failed for ${core}-${mode}: ${JSON.stringify(alarmCheck)}`);
    }
    if ((width === 320 && !alarmCheck.stackedVerticallyOn320) || (width === 1280 && !alarmCheck.sideBySideOn1280)) {
      throw new Error(`Responsive column check failed for ${core}-${mode}-${width}: ${JSON.stringify(alarmCheck)}`);
    }

    await alarm1Input.locator('xpath=ancestor::fieldset[1]').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(150);
    const alarmBounds = await page.evaluate(() => ({ width: innerWidth, docScrollWidth: document.documentElement.scrollWidth }));
    if (alarmBounds.docScrollWidth > alarmBounds.width + 1) {
      throw new Error(`Horizontal overflow on alarms-layout for ${core}-${mode}-${width}: ${JSON.stringify(alarmBounds)}`);
    }
    const alarmFile = `${core}-${mode}-${language}-${width}-alarms-layout.png`;
    await page.screenshot({ path: path.join(out, alarmFile) });

    results.push({ core, mode, language, width, shiftFile, alarmFile, cardChecks, shiftInvalid, shiftReverted, shiftBounds, alarmCheck, alarmBounds, errors });
    await context.close();
  }

  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-27',
    browser: browser.version(),
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** and /hud/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
  console.log('Captured', results.length * 2, 'screenshots successfully');
} finally {
  await browser.close();
}
