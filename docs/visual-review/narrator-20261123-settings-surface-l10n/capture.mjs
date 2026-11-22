import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/narrator-20261123-settings-surface-l10n');
await fs.mkdir(out, { recursive: true });

const dicts = Object.fromEntries(
  await Promise.all(['en-us', 'zh-tw', 'ja-jp'].map(async (lang) => [
    lang,
    JSON.parse(await fs.readFile(path.join(repo, 'lang', `${lang}.json`), 'utf8')),
  ])),
);

const langNames = {
  'en-us': 'English (US)',
  'zh-tw': '繁體中文',
  'ja-jp': '日本語',
};

const executablePath = process.env.FH6_CHROMIUM || (
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe')
    : '/usr/bin/chromium'
);

const cases = [
  { core: 'default', mode: 'light', language: 'en-us', width: 1280, height: 720, focus: 'top', tag: 'general-telemetry' },
  { core: 'default', mode: 'dark', language: 'en-us', width: 1280, height: 720, focus: 'bottom', tag: 'discord-storage' },
  { core: 'swiss', mode: 'light', language: 'zh-tw', width: 1280, height: 720, focus: 'top', tag: 'general-telemetry' },
  { core: 'swiss', mode: 'dark', language: 'ja-jp', width: 1280, height: 720, focus: 'bottom', tag: 'discord-storage' },
  { core: 'rhine-lab', mode: 'light', language: 'ja-jp', width: 1280, height: 720, focus: 'top', tag: 'general-telemetry' },
  { core: 'rhine-lab', mode: 'dark', language: 'zh-tw', width: 1280, height: 720, focus: 'bottom', tag: 'discord-storage' },
  { core: 'default', mode: 'dark', language: 'zh-tw', width: 320, height: 800, focus: 'top', tag: 'general-telemetry' },
  { core: 'default', mode: 'dark', language: 'ja-jp', width: 320, height: 800, focus: 'bottom', tag: 'discord-storage' },
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
        data = {
          platform: 'windows',
          capabilities: { hudOverlay: true, audioSpectrum: true, systemMedia: true, localMotecLaunch: true },
          telemetry: { port: 8000, listenAddresses: ['127.0.0.1'], error: null },
        };
      } else if (p === '/api/settings') {
        data = {
          language,
          theme,
          telemetry_port: 8000,
          auto_check_updates: true,
          dyno_recording: true,
          race_recording: true,
          forward_telemetry_enabled: false,
        };
      } else if (p === '/api/languages') {
        data = Object.keys(dicts).map((code) => ({ code, name: langNames[code] || code }));
      } else if (p.startsWith('/api/languages/')) {
        data = dicts[p.split('/').pop()];
      } else if (p === '/api/overlay/config') {
        data = { enabled: false, hudStyle: 'simple', selectedMonitorIndex: 0 };
      } else if (p === '/api/cars/database') {
        data = { '42': '2020 Nissan GT-R NISMO' };
      } else if (p === '/api/cars/with_params') {
        data = [{ id: '42', name: '2020 Nissan GT-R NISMO' }];
      } else if (p === '/api/diagnostics/discord-presence') {
        data = {
          configured: true,
          state: 'waiting_for_telemetry',
          lastError: 'IPC pipe busy (retry scheduled)',
          lastTelemetryAt: null,
          lastAttemptAt: 1732300000,
          connectionAttempts: 3,
          updatesSent: 12,
          reconnects: 1,
        };
      } else if (p === '/api/settings/storage-overview') {
        data = {
          format: 'fh6-settings/v2',
          schema_version: 2,
          data_root: 'Application data directory',
          total_bytes: 18432,
          entries: [
            { relative_path: 'settings.json', bytes: 2048 },
            { relative_path: 'telemetry.db', bytes: 16384 },
          ],
          last_backup: null,
          capabilities: {
            settings_backup_recovery: 'available',
            settings_export: 'not_available',
            settings_restore: 'not_available',
            sqlite_migration: 'not_planned',
          },
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
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4183/');
    await page.keyboard.press('Escape');

    // Open App Menu -> Settings dialog
    await page.getByRole('button', { name: t('App Menu'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Settings'), exact: true }).click();

    const dialog = page.locator('.app-dialog--settings');
    await dialog.waitFor();
    await dialog.locator('[data-settings-surface]').waitFor();
    await page.waitForTimeout(200);

    // Wait for async Discord and Storage sections to resolve
    await dialog.locator('ul[aria-label]').waitFor();

    if (focus === 'bottom') {
      await dialog.locator('.settings-section').last().evaluate((el) => {
        el.scrollIntoView({ block: 'end', inline: 'nearest' });
      });
    } else {
      await dialog.locator('.surface-intro').evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    }
    await page.waitForTimeout(150);

    const fileName = `${core}-${mode}-${language}-${width}-${tag}.png`;
    await page.screenshot({ path: path.join(out, fileName) });

    const metrics = await page.evaluate(() => {
      const d = document.querySelector('.app-dialog--settings');
      const body = d?.querySelector('.modal-body, .offcanvas-body');
      const unitSelect = d?.querySelector('#settings-unit-general');
      const unitOptions = [...(unitSelect?.querySelectorAll('option') ?? [])].map((o) => o.textContent?.trim() ?? '');
      const sectionTitles = [...(d?.querySelectorAll('.settings-section-title') ?? [])].map((h) => h.textContent?.trim() ?? '');
      const statusBadges = [...(d?.querySelectorAll('[role="status"][aria-live="polite"]') ?? [])].map((b) => b.textContent?.trim() ?? '');
      const introText = d?.querySelector('.surface-intro')?.textContent?.trim() ?? '';
      return {
        introText,
        unitOptions,
        sectionTitles,
        statusBadges,
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
      captureDate: '2026-11-23',
      components: [
        'frontend/src/features/settings/SettingsSurface.tsx',
        'frontend/src/features/settings/components/DiscordPresenceStatusCard.tsx',
        'frontend/src/features/settings/components/UpdateSettingsCard.tsx',
        'frontend/src/features/settings/components/DataStorageOverview.tsx',
        'frontend/src/features/analysis/AnalysisSessionVisuals.tsx',
      ],
      mockedBackend: true,
      reducedMotion: 'reduce',
      cases: results,
    }, null, 2) + '\n',
  );
  console.log('Captured', results.length, 'screenshots successfully');
} finally {
  await browser.close();
}
