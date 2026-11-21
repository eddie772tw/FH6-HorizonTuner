import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/narrator-20261122-companion-settings-controls');
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

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, focus: 'usb', tag: 'usb-lan' },
  { core: 'swiss', mode: 'light', language: 'zh-tw', width: 1280, height: 720, focus: 'usb', tag: 'usb-lan' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, focus: 'usb', tag: 'usb-lan' },
  { core: 'rhine-lab', mode: 'light', language: 'ja-jp', width: 1280, height: 720, focus: 'steps', tag: 'steps-preview' },
  { core: 'rhine-lab', mode: 'dark', language: 'en-us', width: 1280, height: 720, focus: 'steps', tag: 'steps-preview' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, focus: 'usb', tag: 'usb-lan' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, focus: 'lan', tag: 'lan' },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

try {
  for (const item of cases) {
    const { core, mode, language, width, height, focus, tag } = item;
    const theme = { halfmoonCore: core, mode, primaryColor: '#00f0ff', secondaryColor: '#ff003c', accentColor: '#7000ff', customCSS: '' };
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => {
      localStorage.setItem('themeSettings', JSON.stringify(t));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    }, theme);
    await context.routeWebSocket('**/ws/**', () => {});

    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (p === '/api/runtime') {
        data = { platform: 'windows', capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true }, telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null } };
      } else if (p === '/api/settings') {
        data = { language, theme, auto_check_updates: false, companion_enabled: true, companion_usb_enabled: true };
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
      } else if (p === '/api/companion/status') {
        data = { enabled: true, active_connections: 1, port: 8001 };
      } else if (p === '/api/companion/usb/devices') {
        data = {
          devices: [
            { serial: 'PIXEL-01', state: 'device', model: 'Pixel Tablet' },
            { serial: 'GALAXY-02', state: 'unauthorized', model: 'Galaxy Tab S9' },
            { serial: 'DEV-03', state: 'offline' },
          ],
        };
      } else if (p === '/api/companion/lan/pairing') {
        data = {
          token: '842195',
          host_name: 'FH6-RIG',
          lan_ips: ['192.168.1.24'],
          port: 8001,
          expires_in_secs: 300,
        };
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

    // Open App Menu -> Companion App dialog
    await page.getByRole('button', { name: t('App Menu'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Companion App'), exact: true }).click();

    const dialog = page.locator('.app-dialog--companion');
    await dialog.waitFor();

    // Scan USB devices and select unauthorized device to show localized state & guidance
    await dialog.getByRole('button', { name: t('Refresh devices'), exact: true }).click();
    const usbSelect = dialog.locator('select.form-select');
    await usbSelect.waitFor();
    await usbSelect.selectOption('GALAXY-02');

    // Generate LAN pairing code to show parameterized countdown & QR code
    await dialog.getByRole('button', { name: t('Generate pairing code'), exact: true }).click();
    await dialog.locator('.companion-lan-token').waitFor();

    // Scroll to the target section within dialog body
    if (focus === 'steps') {
      await dialog.locator('.companion-settings-steps').evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    } else if (focus === 'lan') {
      await dialog.locator('.companion-lan-controls').evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    } else {
      await dialog.locator('.settings-section-header').evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    }
    await page.waitForTimeout(150);

    const fileName = `${core}-${mode}-${language}-${width}-${tag}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate(() => {
      const d = document.querySelector('.app-dialog--companion');
      const body = d?.querySelector('.offcanvas-body');
      const select = d?.querySelector('select.form-select');
      const options = [...(select?.querySelectorAll('option') ?? [])].map((o) => o.textContent?.trim() ?? '');
      const lanBadge = d?.querySelector('.companion-lan-pairing-heading .badge')?.textContent?.trim() ?? '';
      const tokenEl = d?.querySelector('.companion-lan-token');
      const sectionHeading = d?.querySelector('.settings-section-header h3, .settings-section-header h4, .settings-section-header .settings-section-title')?.textContent?.trim() ?? '';
      const headerBadge = d?.querySelector('.settings-section-header .badge')?.textContent?.trim() ?? '';
      return {
        sectionHeading,
        headerBadge,
        usbOptions: options,
        lanCountdownBadge: lanBadge,
        pairingTokenAriaLabel: tokenEl?.getAttribute('aria-label') ?? '',
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        dialogBodyOverflowX: body ? body.scrollWidth > body.clientWidth + 1 : false,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    results.push({ name: fileName, core, mode, language, width, height, focus, ...metrics, errors });
    await context.close();
  }

  await fs.writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify({
      captureDate: '2026-11-22',
      components: [
        'frontend/src/features/settings/components/CompanionSettingsCard.tsx',
        'frontend/src/features/settings/components/CompanionUsbControls.tsx',
        'frontend/src/features/settings/components/CompanionLanControls.tsx',
      ],
      mockedBackend: true,
      cases: results,
    }, null, 2) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
