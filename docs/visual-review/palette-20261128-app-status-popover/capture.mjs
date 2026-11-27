import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || [
  path.join(repo, 'frontend/node_modules/playwright-core/index.mjs'),
  path.join(repo, 'node_modules/playwright-core/index.mjs'),
].find((candidate) => existsSync(candidate));
if (!pwPath) throw new Error('Set FH6_PLAYWRIGHT_MODULE to playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);

const out = path.join(repo, 'docs/visual-review/palette-20261128-app-status-popover');
await fs.mkdir(out, { recursive: true });
const dicts = Object.fromEntries(await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async (lang) => [
  lang,
  JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8')),
])));

const executablePath = process.env.FH6_CHROMIUM || (
  process.platform === 'win32'
    ? [
      'ms-playwright/chromium-1234/chrome-win64/chrome.exe',
      'ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    ].map((rel) => path.join(process.env.LOCALAPPDATA || '', rel)).find((candidate) => existsSync(candidate))
    : '/usr/bin/chromium'
);

const rhinePalettes = {
  light: { primaryColor: '#080a08', secondaryColor: '#9b7247', accentColor: '#66645c' },
  dark: { primaryColor: '#e0e3dc', secondaryColor: '#c5a16b', accentColor: '#a6b0b1' },
};

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
    const palette = core === 'rhine-lab'
      ? rhinePalettes[mode]
      : { primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff' };
    const theme = { halfmoonCore: core, mode, ...palette, customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });

    await context.addInitScript((tCfg) => {
      localStorage.setItem('themeSettings', JSON.stringify(tCfg));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
      window.__TAURI__ = {};
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => (cmd === 'get_backend_status' ? { state: 'ready', port: 8002, error: null } : null),
        transformCallback: () => 0,
        unregisterCallback: () => {},
      };
    }, theme);

    await context.routeWebSocket('**/ws/**', () => {});
    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') {
        data = { platform: 'windows', capabilities: { hudOverlay: false, audioSpectrum: false, systemMedia: false, localMotecLaunch: false }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      } else if (p === '/api/settings') {
        data = { language, theme, auto_check_updates: false, companion_enabled: false };
      } else if (p === '/api/languages') {
        data = Object.keys(dicts).map((code) => ({ code, name: code }));
      } else if (p.startsWith('/api/languages/')) {
        data = dicts[p.split('/').pop()];
      } else if (p === '/api/diagnostics/telemetry-pipeline') {
        data = { datagrams_received: 120, valid_frames: 120, last_packet_at: Math.floor(Date.now() / 1000), errors: [] };
      } else if (p === '/api/cars/database') {
        data = {};
      } else {
        data = [];
      }
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t = (key) => (language === 'en-us' ? key : (dicts[language][key] ?? key));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4181/');
    const dialog = page.locator('.popover[role="dialog"]');
    await dialog.waitFor();
    await page.waitForFunction(
      (expectedTitle) => document.querySelector('.popover[role="dialog"] strong')?.textContent?.trim() === expectedTitle,
      t('MCP Endpoint Notice'),
    );
    await page.waitForTimeout(150);

    const openChecks = await page.evaluate(() => {
      const dlg = document.querySelector('.popover[role="dialog"]');
      const trigger = document.querySelector('button[aria-controls]');
      const titleId = dlg?.getAttribute('aria-labelledby') ?? '';
      const descId = dlg?.getAttribute('aria-describedby') ?? '';
      const rect = dlg?.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      return {
        hasDialogRole: dlg?.getAttribute('role') === 'dialog',
        hasTriggerHaspopup: trigger?.getAttribute('aria-haspopup') === 'dialog',
        hasTriggerControls: trigger?.getAttribute('aria-controls') === dlg?.id,
        hasLabelledBy: Boolean(titleId && document.getElementById(titleId)?.textContent?.trim()),
        hasDescribedBy: Boolean(descId && document.getElementById(descId)?.textContent?.trim()),
        liveRegionText: document.querySelector('.visually-hidden[role="status"][aria-live="polite"]')?.textContent ?? '',
        left: rect ? Math.round(rect.left) : -1,
        right: rect ? Math.round(rect.right) : -1,
        width: rect ? Math.round(rect.width) : -1,
        viewportWidth: vw,
        withinViewport: rect ? rect.left >= 7 && rect.right <= vw - 7 : false,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    if (!openChecks.hasDialogRole || !openChecks.hasTriggerHaspopup || !openChecks.hasTriggerControls
      || !openChecks.hasLabelledBy || !openChecks.hasDescribedBy || !openChecks.liveRegionText.includes('8002')
      || !openChecks.withinViewport || openChecks.docOverflowX) {
      throw new Error(`Open a11y/layout checks failed for ${core}-${mode}-${width}: ${JSON.stringify(openChecks)}`);
    }

    const openFile = `${core}-${mode}-${language}-${width}-popover-open.png`;
    await page.screenshot({ path: path.join(out, openFile) });

    await dialog.locator('button.btn-close').focus();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.waitForTimeout(100);

    const dismissChecks = await page.evaluate(() => {
      const trigger = document.querySelector('button[title][aria-haspopup="dialog"][aria-expanded="false"].btn-outline-warning');
      return {
        activeIsTrigger: document.activeElement === trigger,
        expandedAfterClose: trigger?.getAttribute('aria-expanded') ?? null,
        focusVisible: trigger ? trigger.matches(':focus-visible') : false,
      };
    });
    if (!dismissChecks.activeIsTrigger || dismissChecks.expandedAfterClose !== 'false') {
      throw new Error(`Dismiss checks failed for ${core}-${mode}-${width}: ${JSON.stringify(dismissChecks)}`);
    }

    const dismissFile = `${core}-${mode}-${language}-${width}-popover-dismissed-focus.png`;
    await page.screenshot({ path: path.join(out, dismissFile) });

    results.push({ core, mode, language, width, openFile, dismissFile, openChecks, dismissChecks, errors });
    await context.close();
  }

  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-28',
    browser: browser.version(),
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + Tauri dynamic port 8002 stub + mock /api/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
  console.log('Captured', results.length * 2, 'screenshots successfully');
} finally {
  await browser.close();
}
