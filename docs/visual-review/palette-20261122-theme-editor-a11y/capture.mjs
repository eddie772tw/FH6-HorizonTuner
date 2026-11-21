import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261122-theme-editor-a11y');
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
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(t => { localStorage.setItem('themeSettings', JSON.stringify(t)); localStorage.setItem('fh6-data-out-guide/v1', 'skipped'); }, theme);
    await context.routeWebSocket('**/ws/**', () => {});
    await context.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map(code => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      else if (p === '/api/analysis/status') data = { is_recording: false, samples_count: 0, manual_mode: false, recording_mode: 'circuit', armed: false, armed_route_id: null };
      else if (['/api/analysis/routes', '/api/analysis/sessions', '/api/cars/with_params', '/api/cars/database', '/api/audio/devices', '/api/hud/styles', '/api/road/workflows'].includes(p)) data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    const t = key => language === 'en-us' ? key : (dicts[language][key] ?? key);

    const menuBtn = page.getByRole('button', { name: t('App Menu'), exact: true });
    await menuBtn.waitFor();
    await menuBtn.click();
    await page.getByRole('menuitem', { name: t('Appearance'), exact: true }).click();

    const dialog = page.getByRole('dialog', { name: t('Theme Customization') });
    await dialog.waitFor();
    const describedById = await dialog.getAttribute('aria-describedby');
    if (describedById !== 'theme-drawer-description') throw Error(`Unexpected dialog aria-describedby: ${describedById}`);

    const hexInput = page.locator('#color-primary-text');
    await hexInput.scrollIntoViewIfNeeded();
    await hexInput.click();
    await hexInput.fill('#12');
    const hexInvalidFile = `${core}-${mode}-${language}-${width}-hex-invalid.png`;
    await page.screenshot({ path: path.join(out, hexInvalidFile) });

    await page.keyboard.press('Escape');
    const reverted = await hexInput.inputValue();
    if (reverted !== '#00f0ff') throw Error(`Expected reverted HEX #00f0ff, got ${reverted}`);
    if ((await dialog.getAttribute('aria-hidden')) !== 'false') throw Error('Escape while dirty closed ThemeView dialog');

    const advancedSummary = dialog.locator('.theme-advanced > summary');
    await advancedSummary.scrollIntoViewIfNeeded();
    await advancedSummary.click();

    const cssEditor = dialog.getByLabel(t('Custom CSS & Style Editor'));
    await cssEditor.scrollIntoViewIfNeeded();
    await cssEditor.fill('.card {\n  border-color: url(https://example.invalid/x);\n');
    if ((await cssEditor.getAttribute('aria-invalid')) !== 'true') throw Error('Expected aria-invalid="true" on invalid CSS');
    await page.waitForTimeout(350);
    const cssInvalidFile = `${core}-${mode}-${language}-${width}-css-invalid.png`;
    await page.screenshot({ path: path.join(out, cssInvalidFile) });

    const bounds = await page.evaluate(() => {
      const body = document.querySelector('.theme-sidebar .offcanvas-body');
      return {
        width: innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        drawerClientWidth: body?.clientWidth ?? 0,
        drawerScrollWidth: body?.scrollWidth ?? 0,
      };
    });

    await dialog.getByRole('button', { name: t('Cancel'), exact: true }).click();
    if (!(await cssEditor.evaluate(el => document.activeElement === el))) throw Error('Cancel did not restore focus to CSS editor');
    await dialog.getByRole('button', { name: t('Insert Starter CSS'), exact: true }).click();
    if (!(await cssEditor.evaluate(el => document.activeElement === el))) throw Error('Insert Starter CSS did not focus CSS editor');
    await dialog.getByRole('button', { name: t('Apply'), exact: true }).click();
    if (!(await cssEditor.evaluate(el => document.activeElement === el))) throw Error('Apply did not restore focus to CSS editor');
    await dialog.getByRole('button', { name: t('Clear Current'), exact: true }).click();
    if (!(await cssEditor.evaluate(el => document.activeElement === el))) throw Error('Clear Current did not restore focus to CSS editor');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    results.push({ core, mode, language, width, hexInvalidFile, cssInvalidFile, bounds, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-22',
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
