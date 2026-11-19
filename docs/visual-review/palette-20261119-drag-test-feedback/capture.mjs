import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261119-drag-test-feedback');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async lang => [lang, JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8'))])));
const executablePath = process.env.FH6_CHROMIUM || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe') : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const sample = [{ time: 0, SpeedMetersPerSecond: 10, CurrentEngineRpm: 3000, Gear: 1, AccelInput: 255, BrakeInput: 0, TorqueNewtons: 300, PowerWatts: 100000, TireSlipRatio: [0.02, 0.02, 0.04, 0.04] }, { time: 2.5, SpeedMetersPerSecond: 45, CurrentEngineRpm: 6800, Gear: 3, AccelInput: 255, BrakeInput: 0, TorqueNewtons: 340, PowerWatts: 220000, TireSlipRatio: [0.01, 0.01, 0.03, 0.03] }];
const analysis = { car_name: 'Nissan GT-R', drivetrain: 'AWD', max_gear: 6, max_speed_kmh: 220, duration: 8.5, launch_slip_percent: 5, launch_recommendation: 'Launch grip is balanced.', shifts: [], shift_recommendations: [], final_drive_recommendation: 'Final drive matches top speed target.', path_valid: true, max_deviation_meters: 0.2, yaw_variance_rad: 0.01, stability_diagnostics: [] };
const results = [];

try {
  for (const [core, mode, language, width] of [['default', 'light', 'en-us', 1280], ['default', 'dark', 'zh-tw', 320], ['swiss', 'light', 'zh-tw', 1280], ['swiss', 'dark', 'ja-jp', 1280], ['rhine-lab', 'light', 'ja-jp', 1280], ['rhine-lab', 'dark', 'en-us', 1280]]) {
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript(t => { localStorage.setItem('themeSettings', JSON.stringify(t)); localStorage.setItem('fh6-data-out-guide/v1', 'skipped'); }, theme);
    await context.routeWebSocket('**/ws/**', () => {});
    let deleted = false;
    await context.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      const m = route.request().method();
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map(code => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      else if (p === '/api/drag/status') data = { status: 'finished', points_count: 120 };
      else if (p === '/api/drag/sessions') data = deleted ? [] : [{ filename: 'run1.json', timestamp: 1700000000, car_name: 'Nissan GT-R', max_speed_kmh: 220 }];
      else if (p === '/api/drag/sessions/save' && m === 'POST') data = { message: 'Saved' };
      else if (p === '/api/drag/sessions/run1.json' && m === 'DELETE') { deleted = true; data = { message: 'Deleted' }; }
      else if (p === '/api/drag/data') data = sample;
      else if (p === '/api/drag/analysis') data = analysis;
      else if (p === '/api/drag/sessions/run1.json') data = { data: sample, analysis };
      else if (p === '/api/cars/with_params' || p === '/api/cars/database' || p === '/api/audio/devices' || p === '/api/hud/styles' || p.endsWith('/routes') || p === '/api/analysis/sessions' || p === '/api/road/workflows') data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    await page.keyboard.press('Escape');
    const t = key => dicts[language][key] ?? key;
    const liveNav = page.getByRole('button', { name: t('Live'), exact: true });
    if (await liveNav.isVisible()) await liveNav.click();
    await page.getByRole('tab', { name: t('Drag Test'), exact: true }).click();
    const select = page.locator('#drag-test-compare-session');
    await select.waitFor();
    await select.selectOption('run1.json');
    const trigger = () => page.getByRole('button', { name: t('Delete selected session'), exact: true });
    await trigger().click();
    await page.getByRole('button', { name: t('Cancel'), exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, `${core}-${mode}-${language}-${width}-confirm.png`) });
    await page.keyboard.press('Escape');
    if (await trigger().evaluate(el => document.activeElement !== el)) throw Error('Escape did not restore focus');
    await page.getByRole('button', { name: t('Save Test'), exact: true }).click();
    await page.getByRole('status').filter({ hasText: t('Drag session saved successfully') }).waitFor();
    await page.screenshot({ path: path.join(out, `${core}-${mode}-${language}-${width}-saved-toast.png`) });
    await trigger().click();
    await page.getByRole('group').getByRole('button', { name: t('Delete'), exact: true }).click();
    await page.getByRole('status').filter({ hasText: t('Session deleted.') }).waitFor();
    const bounds = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    results.push({ core, mode, language, width, bounds, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({ date: '2026-11-19', cases: results }, null, 2) + '\n');
} finally {
  await browser.close();
}
