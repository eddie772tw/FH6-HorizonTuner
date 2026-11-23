import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261120-hud-paused-popover');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async lang => [lang, JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8'))])));
const executablePath = process.env.FH6_CHROMIUM || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe') : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const telemetryPacket = JSON.stringify({
  IsRaceOn: 1, TimestampMS: 1000, CarOrdinal: 101, CarClass: 4, CarPerformanceIndex: 800,
  EngineMaxRpm: 8000, EngineIdleRpm: 900, CurrentEngineRpm: 4200, SpeedMetersPerSecond: 38,
  AccelerationX: 0, AccelerationY: 0, AccelerationZ: 0, VelocityX: 0, VelocityY: 0, VelocityZ: 38, Yaw: 0,
  NormalizedSuspensionTravel: [0.35, 0.35, 0.4, 0.4], TireSlipRatio: [0.02, 0.02, 0.03, 0.03], TireSlipAngle: [0, 0, 0, 0],
});
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
    await context.routeWebSocket('**/ws/telemetry', ws => {
      setTimeout(() => { try { ws.send(telemetryPacket); } catch {} }, 80);
    });
    await context.routeWebSocket('**/ws/overlay', () => {});
    await context.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false };
      else if (p === '/api/languages') data = Object.keys(dicts).map(code => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = { enabled: true, pauseTelemetryViewWhenActive: true, hudStyle: 'simple', selectedMonitorIndex: 0 };
      else if (p === '/api/cars/with_params' || p === '/api/cars/database' || p === '/api/audio/devices' || p === '/api/hud/styles' || p.endsWith('/routes') || p === '/api/analysis/sessions' || p === '/api/road/workflows') data = [];
      else if (p === '/api/companion/status') data = { enabled: false, clients: [] };
      await route.fulfill({ status: 200, json: data });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    const t = key => dicts[language][key] ?? key;
    const trigger = page.getByRole('button', { name: t('RENDER PAUSED (OVERLAY ACTIVE)'), exact: true });
    await trigger.waitFor();
    const dialog = page.locator('.popover[role="dialog"]');
    await dialog.waitFor();
    await page.waitForTimeout(150);

    const openMetrics = await page.evaluate(() => {
      const dlg = document.querySelector('.popover[role="dialog"]');
      const view = document.querySelector('.telemetry-view');
      const r = dlg?.getBoundingClientRect();
      return {
        hasTooltipRole: Boolean(document.querySelector('[role="tooltip"]')),
        popoverRect: r ? { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) } : null,
        viewport: { width: innerWidth, scrollWidth: document.documentElement.scrollWidth },
        telemetryViewOverflow: view ? view.scrollWidth - view.clientWidth : 0,
      };
    });
    if (openMetrics.hasTooltipRole) throw Error('Unexpected role=tooltip on HUD popover');
    if (!openMetrics.popoverRect || openMetrics.popoverRect.left < 0 || openMetrics.popoverRect.right > width) {
      throw Error(`Popover overflowed viewport (${width}px): ${JSON.stringify(openMetrics.popoverRect)}`);
    }
    if (openMetrics.viewport.scrollWidth > width) {
      throw Error(`Page horizontal overflow (${width}px): scrollWidth=${openMetrics.viewport.scrollWidth}`);
    }
    await page.screenshot({ path: path.join(out, `${core}-${mode}-${language}-${width}-open.png`) });

    // Verify modal drawer Escape isolation when opened via keyboard while HUD popover is open
    const unitsBtn = page.getByRole('button', { name: t('Telemetry Units'), exact: true });
    await unitsBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    if (!(await dialog.isVisible())) throw Error('Modal Escape unexpectedly dismissed background HUD popover');

    // Focus Close button inside popover and verify Escape dismisses and restores focus to trigger
    await dialog.locator('button.btn-close').focus();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    if (await trigger.evaluate(el => document.activeElement !== el)) throw Error('Escape did not restore focus to HUD status trigger');
    await page.screenshot({ path: path.join(out, `${core}-${mode}-${language}-${width}-closed-focus.png`) });

    // Re-open via keyboard Enter and dismiss via outside click
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'visible' });
    await page.mouse.click(width - 10, 10);
    await dialog.waitFor({ state: 'hidden' });

    results.push({ core, mode, language, width, ...openMetrics, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({ date: '2026-11-20', cases: results }, null, 2) + '\n');
} finally {
  await browser.close();
}
