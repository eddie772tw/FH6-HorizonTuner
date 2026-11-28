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

const out = path.join(repo, 'docs/visual-review/palette-20261129-analysis-recording-toolbar');
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
    let analysisStatus = {
      isRecording: false,
      recordingCount: 0,
      manualMode: false,
      recordingMode: 'circuit',
      armed: false,
      armedRouteId: null,
      currentSessionId: 'session-demo',
    };

    await context.addInitScript((tCfg) => {
      localStorage.setItem('themeSettings', JSON.stringify(tCfg));
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
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
      } else if (p === '/api/analysis/status') {
        data = analysisStatus;
      } else if (p === '/api/analysis/sessions/current/metadata' || p === '/api/analysis/sessions/session-demo/metadata') {
        data = {
          recording_mode: 'time_trial',
          lap_time_source: 'calculated',
          route_name: 'Goliath Sprint',
          trim_analysis: { head_trim_seconds: 1.2, tail_trim_seconds: 2.4, raw_sample_count: 500, trimmed_sample_count: 480 },
        };
      } else if (p.endsWith('/laps') || p === '/api/analysis/sessions' || p === '/api/analysis/routes' || p === '/api/analysis/data') {
        data = [];
      } else if (p.endsWith('/debrief')) {
        data = null;
      }
      await route.fulfill({ status: 200, json: data });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t = (key) => (language === 'en-us' ? key : (dicts[language][key] ?? key));

    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4183/');
    const sessionsTab = page.locator('nav.workspace-tabs--primary button', { hasText: t('Sessions') });
    await sessionsTab.click();

    const clearTrigger = page.locator(`button[title="${t('Clear recording buffer')}"]`);
    await clearTrigger.waitFor();
    await page.locator(`h3:has-text("${t('Session Analysis & Trimming')}")`).waitFor();
    await page.waitForTimeout(150);

    await clearTrigger.click();
    await page.locator('[role="group"] button.btn-danger').waitFor();
    await page.waitForTimeout(100);

    const confirmChecks = await page.evaluate(({ clearTitle, cancelText, trimHeading }) => {
      const clearBtn = document.querySelector(`button[title="${clearTitle}"]`);
      const confirmGroup = clearBtn?.getAttribute('aria-controls')
        ? document.getElementById(clearBtn.getAttribute('aria-controls'))
        : null;
      const cancelBtn = Array.from(confirmGroup?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === cancelText);
      const modeButtons = Array.from(document.querySelectorAll('[role="group"] button[aria-pressed]'));
      const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent?.trim() === trimHeading);
      const cardHeader = heading?.closest('.card-header');
      return {
        hasDarkSubtle: Boolean(document.querySelector('.analysis-view .bg-dark-subtle')),
        modePressedStates: modeButtons.map((b) => b.getAttribute('aria-pressed')),
        expanded: clearBtn?.getAttribute('aria-expanded'),
        hasConfirmGroup: Boolean(confirmGroup),
        focusOnCancel: document.activeElement === cancelBtn,
        trimHasH3: Boolean(heading),
        trimHeaderWraps: cardHeader?.className.includes('flex-wrap') ?? false,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, { clearTitle: t('Clear recording buffer'), cancelText: t('Cancel'), trimHeading: t('Session Analysis & Trimming') });

    if (confirmChecks.hasDarkSubtle || !confirmChecks.hasConfirmGroup || !confirmChecks.focusOnCancel
      || !confirmChecks.trimHasH3 || !confirmChecks.trimHeaderWraps || confirmChecks.docOverflowX) {
      throw new Error(`Confirm checks failed for ${core}-${mode}-${width}: ${JSON.stringify(confirmChecks)}`);
    }

    const confirmFile = `${core}-${mode}-${language}-${width}-confirm-open.png`;
    await page.screenshot({ path: path.join(out, confirmFile) });

    await page.keyboard.press('Escape');
    await page.locator('[role="group"] button.btn-danger').waitFor({ state: 'detached' });
    await page.waitForTimeout(80);
    const dismissChecks = await page.evaluate((clearTitle) => {
      const clearBtn = document.querySelector(`button[title="${clearTitle}"]`);
      return {
        expandedAfterEscape: clearBtn?.getAttribute('aria-expanded') ?? null,
        focusRestoredToClear: document.activeElement === clearBtn,
        focusVisible: clearBtn ? clearBtn.matches(':focus-visible') : false,
      };
    }, t('Clear recording buffer'));
    if (dismissChecks.expandedAfterEscape !== 'false' || !dismissChecks.focusRestoredToClear) {
      throw new Error(`Dismiss checks failed for ${core}-${mode}-${width}: ${JSON.stringify(dismissChecks)}`);
    }

    analysisStatus = {
      isRecording: true,
      recordingCount: 128,
      manualMode: false,
      recordingMode: 'circuit',
      armed: false,
      armedRouteId: null,
      currentSessionId: 'session-demo',
    };
    await page.locator('.analysis-view .badge.text-bg-danger').waitFor({ timeout: 5000 });
    await page.waitForTimeout(100);

    const recordingChecks = await page.evaluate(({ clearTitle, saveTitle, lockedTitle }) => {
      const saveBtn = document.querySelector(`button[title="${saveTitle}"]`);
      const clearBtn = document.querySelector(`button[title="${clearTitle}"]`);
      const modeGroup = document.querySelector('[role="group"][aria-pressed]')?.parentElement
        ?? document.querySelector('.analysis-view [role="group"]');
      return {
        badgeText: document.querySelector('.analysis-view .badge.text-bg-danger')?.textContent?.trim() ?? '',
        saveBtnWarning: saveBtn?.className.includes('btn-warning') && !saveBtn?.className.includes('btn-outline-warning'),
        clearWrappedTitle: clearBtn?.parentElement?.getAttribute('title') ?? '',
        clearPointerNone: clearBtn ? getComputedStyle(clearBtn).pointerEvents === 'none' : false,
        modeGroupTitle: modeGroup?.getAttribute('title') ?? '',
        expectedLockedTitle: lockedTitle,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, {
      clearTitle: t('Clear recording buffer'),
      saveTitle: t('Save current recording to backend'),
      lockedTitle: t('Auto Recording'),
    });

    if (!recordingChecks.saveBtnWarning || !recordingChecks.clearWrappedTitle
      || !recordingChecks.clearPointerNone || recordingChecks.modeGroupTitle !== recordingChecks.expectedLockedTitle
      || recordingChecks.docOverflowX) {
      throw new Error(`Recording checks failed for ${core}-${mode}-${width}: ${JSON.stringify(recordingChecks)}`);
    }

    const recordingFile = `${core}-${mode}-${language}-${width}-auto-recording.png`;
    await page.screenshot({ path: path.join(out, recordingFile) });

    results.push({ core, mode, language, width, confirmFile, recordingFile, confirmChecks, dismissChecks, recordingChecks, errors });
    await context.close();
  }

  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-29',
    browser: browser.version(),
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/analysis/* routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
  console.log('Captured', results.length * 2, 'screenshots successfully');
} finally {
  await browser.close();
}
