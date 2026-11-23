import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261121-route-delete-confirm');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async lang => [lang, JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8'))])));
const executablePath = process.env.FH6_CHROMIUM || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe') : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const seedRoutes = () => [
  { route_id: 'tt-goliath', name: 'Goliath Sprint', mode: 'time_trial', start_x: 124.5, start_y: 12.0, start_z: -88.2, start_radius: 15 },
  { route_id: 'rm-pass', name: 'Mountain Pass Run', mode: 'roaming', start_x: 42.1, start_y: 5.5, start_z: 19.8, start_radius: 15, end_x: 410.4, end_y: 28.0, end_z: -230.6, end_radius: 18 },
];

const cases = [
  ['default', 'light', 'en-us', 1280, 'time_trial'],
  ['default', 'dark', 'zh-tw', 320, 'roaming'],
  ['swiss', 'light', 'zh-tw', 1280, 'time_trial'],
  ['swiss', 'dark', 'ja-jp', 1280, 'roaming'],
  ['rhine-lab', 'light', 'ja-jp', 1280, 'time_trial'],
  ['rhine-lab', 'dark', 'en-us', 1280, 'roaming'],
];
const results = [];

try {
  for (const [core, mode, language, width, panelMode] of cases) {
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(t => { localStorage.setItem('themeSettings', JSON.stringify(t)); localStorage.setItem('fh6-data-out-guide/v1', 'skipped'); }, theme);
    await context.routeWebSocket('**/ws/**', () => {});
    let routes = seedRoutes();
    await context.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      const m = route.request().method();
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map(code => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      else if (p === '/api/analysis/routes' && m === 'GET') data = routes;
      else if (p.startsWith('/api/analysis/routes/') && m === 'DELETE') {
        const id = decodeURIComponent(p.split('/').pop() || '');
        routes = routes.filter(r => r.route_id !== id);
        data = { success: true };
      } else if (p === '/api/analysis/status') data = { is_recording: false, samples_count: 0, manual_mode: false, recording_mode: 'circuit', armed: false, armed_route_id: null };
      else if (p === '/api/analysis/sessions' || p === '/api/cars/with_params' || p === '/api/cars/database' || p === '/api/audio/devices' || p === '/api/hud/styles' || p === '/api/road/workflows') data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const nativeDialogs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', async d => { nativeDialogs.push(d.message()); await d.dismiss(); });

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    await page.keyboard.press('Escape');
    const t = key => dicts[language][key] ?? key;
    await page.getByRole('button', { name: t('Sessions'), exact: true }).click();
    await page.getByRole('button', { name: t(panelMode === 'time_trial' ? 'Time Trial' : 'Free Roam'), exact: true }).click();

    const target = panelMode === 'time_trial' ? { id: 'tt-goliath', name: 'Goliath Sprint' } : { id: 'rm-pass', name: 'Mountain Pass Run' };
    const select = page.getByLabel(t('Select Route'));
    await select.waitFor();
    await select.selectOption(target.id);

    const trigger = page.getByRole('button', { name: `${t('Delete')} ${target.name}`, exact: true });
    await trigger.click();
    const group = page.locator('[role="group"]').filter({ hasText: t('Are you sure you want to delete this route?') });
    await group.waitFor();
    const cancelBtn = group.getByRole('button', { name: t('Cancel'), exact: true });
    if (await cancelBtn.evaluate(el => document.activeElement !== el)) throw Error('Cancel button did not receive initial focus');
    const confirmFile = `${core}-${mode}-${language}-${width}-${panelMode}-confirm.png`;
    await page.screenshot({ path: path.join(out, confirmFile) });
    const confirmBounds = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));

    await page.keyboard.press('Escape');
    if (await trigger.evaluate(el => document.activeElement !== el)) throw Error('Escape did not restore focus to Delete trigger');

    await trigger.click();
    await group.getByRole('button', { name: t('Delete'), exact: true }).click();
    await page.getByRole('status').filter({ hasText: t('Route deleted.') }).waitFor();
    if (await select.evaluate(el => document.activeElement !== el)) throw Error('Delete completion did not restore focus to Select Route');
    const deletedFile = `${core}-${mode}-${language}-${width}-${panelMode}-deleted.png`;
    await page.screenshot({ path: path.join(out, deletedFile) });

    if (nativeDialogs.length > 0) throw Error(`Unexpected native dialog: ${nativeDialogs.join(', ')}`);
    results.push({ core, mode, language, width, panelMode, confirmFile, deletedFile, confirmBounds, nativeDialogs, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-21',
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
