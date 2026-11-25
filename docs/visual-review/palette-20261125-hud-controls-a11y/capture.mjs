import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261125-hud-controls-a11y');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async lang => [lang, JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8'))])));
const executablePath = process.env.FH6_CHROMIUM || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe') : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const cases = [
  ['default', 'light', 'en-us', 1280],
  ['default', 'dark', 'zh-tw', 320],
  ['swiss', 'light', 'zh-tw', 1280],
  ['swiss', 'dark', 'ja-jp', 1280],
  ['rhine-lab', 'light', 'ja-jp', 1280],
  ['rhine-lab', 'dark', 'en-us', 1280],
];
const results = [];

try {
  for (const [core, mode, language, width] of cases) {
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    let overlayConfig = {
      enabled: false,
      hudStyle: 'simple',
      selectedMonitorIndex: 0,
      followAppUnits: true,
      glowIntensity: 1,
      scale: 1,
      useDefaultColors: true,
      elements: { showGauge: true, showMotionEffect: true },
    };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(t => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});
    await context.route('**/hud/**', async route => {
      await route.fulfill({ status: 200, json: { author: 'Author', description: 'No description provided.' } });
    });
    await context.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/api/overlay/config' && route.request().method() === 'POST') {
        try { overlayConfig = { ...overlayConfig, ...JSON.parse(route.request().postData() || '{}') }; } catch { /* ignore */ }
        await route.fulfill({ status: 200, json: overlayConfig });
        return;
      }
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map(code => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = overlayConfig;
      else if (p === '/api/hud/styles') data = { styles: [{ id: 'simple', source: 'builtin', urlPrefix: '/hud' }] };
      else if (p === '/api/analysis/status') data = { is_recording: false, samples_count: 0, manual_mode: false, recording_mode: 'circuit', armed: false, armed_route_id: null };
      else if (['/api/analysis/routes', '/api/analysis/sessions', '/api/cars/with_params', '/api/cars/database', '/api/audio/devices', '/api/road/workflows'].includes(p)) data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    const t = key => language === 'en-us' ? key : (dicts[language][key] ?? key);

    await page.getByRole('navigation', { name: t('Workspaces') }).getByRole('button', { name: t('HUD'), exact: true }).click();
    const mainTab = page.getByRole('tab', { name: t('Main gauge'), exact: true });
    await mainTab.waitFor();

    const mainSwitch = page.getByRole('switch', { name: t('Show main gauge') });
    await mainSwitch.waitFor();
    const switchOk = await mainSwitch.evaluate(el => {
      const label = el.closest('label');
      return Boolean(el.id && label?.getAttribute('for') === el.id && el.getAttribute('aria-checked') === 'true');
    });
    if (!switchOk) throw Error('HudSwitch missing explicit for/id or aria-checked');

    const slider = page.getByRole('slider', { name: t('Glow Intensity'), exact: true });
    if ((await slider.getAttribute('aria-valuetext')) !== '100%') throw Error('Expected slider aria-valuetext=100%');

    const numInput = page.getByRole('spinbutton', { name: `${t('Glow Intensity')} (%)` });
    const rangeWrap = numInput.locator('xpath=ancestor::div[contains(@class,"hud-range")]');
    await numInput.click();
    await numInput.fill('350');
    if ((await numInput.getAttribute('aria-invalid')) !== 'true') throw Error('Expected aria-invalid="true" on Glow Intensity 350');
    const hintId = await numInput.getAttribute('aria-describedby');
    const hintText = hintId ? await page.locator(`#${hintId}`).textContent() : '';
    if (hintText !== '0% – 200%') throw Error(`Unexpected range hint: ${hintText}`);
    await rangeWrap.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const rangeInvalidFile = `${core}-${mode}-${language}-${width}-range-invalid.png`;
    await page.screenshot({ path: path.join(out, rangeInvalidFile) });

    await page.keyboard.press('Escape');
    if ((await numInput.inputValue()) !== '100' || (await numInput.getAttribute('aria-invalid')) !== 'false') {
      throw Error('Escape did not revert Glow Intensity draft');
    }

    await page.getByRole('tab', { name: t('General'), exact: true }).click();
    const followSwitch = page.getByRole('switch', { name: t('Follow App Global Units') });
    await followSwitch.waitFor();
    const unitsOk = await followSwitch.evaluate((el, expectedLegend) => {
      const descId = el.getAttribute('aria-describedby');
      const desc = descId ? document.getElementById(descId)?.textContent ?? '' : '';
      const fieldset = el.closest('.hud-settings-section')?.querySelector('fieldset');
      const legend = fieldset?.querySelector('legend.visually-hidden')?.textContent ?? '';
      return Boolean(
        desc.length > 0 &&
        el.getAttribute('aria-checked') === 'true' &&
        fieldset &&
        fieldset.getAttribute('aria-describedby') === descId &&
        getComputedStyle(fieldset).opacity === '0.65' &&
        legend === expectedLegend
      );
    }, t('HUD Unit Settings'));
    if (!unitsOk) throw Error('HudUnitSettings switch/fieldset semantics check failed');

    await followSwitch.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    }));
    const hudUnitsFile = `${core}-${mode}-${language}-${width}-hud-units.png`;
    await page.screenshot({ path: path.join(out, hudUnitsFile) });

    results.push({ core, mode, language, width, rangeInvalidFile, hudUnitsFile, bounds, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-25',
    browser: browser.version(),
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** and /hud/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
