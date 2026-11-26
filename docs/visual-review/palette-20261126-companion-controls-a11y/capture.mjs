import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261126-companion-controls-a11y');
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
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 800 : 720 }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});

    let pairingTtl = 300;
    let holdScan = false;
    let releaseScan = null;

    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/api/companion/usb/devices' && holdScan) {
        await new Promise((resolve) => { releaseScan = resolve; });
      }
      let data = {};
      if (p === '/api/runtime') data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      else if (p === '/api/settings') data = { language, theme, auto_check_updates: false, companion_enabled: true, companion_usb_enabled: true };
      else if (p === '/api/languages') data = Object.keys(dicts).map((code) => ({ code, name: code }));
      else if (p.startsWith('/api/languages/')) data = dicts[p.split('/').pop()];
      else if (p === '/api/overlay/config') data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      else if (p === '/api/companion/status') data = { enabled: true, active_connections: 1, port: 8001 };
      else if (p === '/api/companion/usb/devices') data = { devices: [{ serial: 'PIXEL-01', state: 'device', model: 'Pixel Tablet' }, { serial: 'GALAXY-02', state: 'unauthorized', model: 'Galaxy Tab S9' }, { serial: 'DEV-03', state: 'offline' }] };
      else if (p === '/api/companion/lan/pairing') data = { token: '842195', host_name: 'FH6-RIG', lan_ips: ['192.168.1.24'], port: 8001, expires_in_secs: pairingTtl };
      else if (p === '/api/cars/database') data = {};
      else data = [];
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t = (key) => (language === 'en-us' ? key : (dicts[language][key] ?? key));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4179/');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: t('App Menu'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Companion App'), exact: true }).click();

    const dialog = page.locator('.app-dialog--companion');
    await dialog.waitFor();

    const refreshBtn = dialog.getByRole('button', { name: t('Refresh devices'), exact: true });
    await refreshBtn.click();
    const usbSelect = dialog.getByLabel(t('USB device'), { exact: true });
    await usbSelect.waitFor();
    await usbSelect.selectOption('GALAXY-02');

    await dialog.getByRole('button', { name: t('Generate pairing code'), exact: true }).click();
    await dialog.locator('.companion-lan-token').waitFor();

    const activeChecks = await dialog.evaluate((el) => {
      const pairingBox = el.querySelector('.companion-lan-pairing');
      const timer = el.querySelector('[role="timer"]');
      const hiddenLive = el.querySelector('.companion-lan-controls > .visually-hidden[role="status"]');
      const select = el.querySelector('select.form-select');
      const descId = select?.getAttribute('aria-describedby') ?? '';
      const notice = descId ? document.getElementById(descId) : null;
      const body = el.querySelector('.offcanvas-body');
      return {
        pairingHasRole: pairingBox?.hasAttribute('role') ?? null,
        timerLive: timer?.getAttribute('aria-live') ?? null,
        hiddenLiveText: hiddenLive?.textContent ?? '',
        hasLabelFor: Boolean(select?.id && el.querySelector(`label[for="${select.id}"]`)),
        noticeClass: notice?.className ?? '',
        dialogBodyOverflowX: body ? body.scrollWidth > body.clientWidth + 1 : false,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    if (activeChecks.pairingHasRole !== false || activeChecks.timerLive !== 'off' || !activeChecks.hiddenLiveText.includes('842195') || !activeChecks.hasLabelFor || !activeChecks.noticeClass.includes('text-warning-emphasis')) {
      throw new Error(`Active a11y checks failed for ${core}-${mode}: ${JSON.stringify(activeChecks)}`);
    }

    await dialog.locator('.companion-settings-intro').evaluate((el) => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
    await page.waitForTimeout(150);
    const activeFile = `${core}-${mode}-${language}-${width}-usb-lan-active.png`;
    await page.screenshot({ path: path.join(out, activeFile) });

    // State 2: Expired LAN pairing notice + scanning USB spinner & disabled Stop ADB tooltip wrapper
    pairingTtl = 1;
    await dialog.getByRole('button', { name: t('Generate pairing code'), exact: true }).click();
    await dialog.locator('.companion-lan-controls p.text-warning-emphasis[role="status"]').waitFor({ timeout: 5000 });

    holdScan = true;
    await refreshBtn.click();
    await dialog.locator('button[aria-busy="true"] .spinner-border[aria-hidden="true"]').waitFor();
    const busyChecks = await dialog.evaluate((el) => {
      const stopBtn = el.querySelector('button.btn-outline-danger');
      const scanBtn = el.querySelector('button[aria-busy="true"]');
      return {
        scanBusy: scanBtn?.getAttribute('aria-busy') ?? null,
        stopDisabled: stopBtn instanceof HTMLButtonElement ? stopBtn.disabled : false,
        stopWrapperTitle: stopBtn?.parentElement?.getAttribute('title') ?? '',
        stopWrapperCursor: stopBtn?.parentElement ? getComputedStyle(stopBtn.parentElement).cursor : '',
      };
    });
    if (busyChecks.scanBusy !== 'true' || !busyChecks.stopDisabled || !busyChecks.stopWrapperTitle) {
      throw new Error(`Busy a11y checks failed for ${core}-${mode}: ${JSON.stringify(busyChecks)}`);
    }

    await dialog.locator(width === 320 ? '.companion-lan-controls' : '.companion-settings-intro').evaluate((el, isNarrow) => el.scrollIntoView({ block: isNarrow ? 'end' : 'start', inline: 'nearest' }), width === 320);
    await page.waitForTimeout(150);
    const busyFile = `${core}-${mode}-${language}-${width}-async-busy-expired.png`;
    await page.screenshot({ path: path.join(out, busyFile) });

    holdScan = false;
    releaseScan?.();
    await page.waitForTimeout(50);

    results.push({ core, mode, language, width, activeFile, busyFile, activeChecks, busyChecks, errors });
    await context.close();
  }

  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-26',
    browser: browser.version(),
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
  console.log('Captured', results.length * 2, 'screenshots successfully');
} finally {
  await browser.close();
}
