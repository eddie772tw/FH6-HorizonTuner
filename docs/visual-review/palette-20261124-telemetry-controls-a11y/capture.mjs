import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const pwPath = process.env.FH6_PLAYWRIGHT_MODULE || path.join(repo, 'frontend/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(pwPath).href);
const out = path.join(repo, 'docs/visual-review/palette-20261124-telemetry-controls-a11y');
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

    const tracesTitle = t('Live Telemetry Traces');
    const switchName = `${t('Toggle chart rendering for this section')}: ${tracesTitle}`;
    const traceSwitch = page.getByRole('switch', { name: switchName, exact: true });
    await traceSwitch.waitFor();

    const relBtn = page.getByRole('button', { name: t('Relative'), exact: true });
    if ((await relBtn.getAttribute('aria-pressed')) !== 'true') throw Error('Expected Relative aria-pressed="true"');

    await traceSwitch.scrollIntoViewIfNeeded();
    await traceSwitch.focus();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();

    const tooltipBounds = await page.evaluate(() => {
      const tip = document.querySelector('[role="tooltip"]');
      const card = tip?.closest('.telemetry-card-shell');
      const tipR = tip?.getBoundingClientRect();
      const cardR = card?.getBoundingClientRect();
      return {
        width: innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        tipText: tip?.textContent ?? '',
        clippedLeft: tipR && cardR ? tipR.left < cardR.left - 1 : true,
        clippedRight: tipR && cardR ? tipR.right > cardR.right + 1 : true,
        tipRect: tipR ? { left: Math.round(tipR.left), right: Math.round(tipR.right), width: Math.round(tipR.width) } : null,
        cardRect: cardR ? { left: Math.round(cardR.left), right: Math.round(cardR.right), width: Math.round(cardR.width) } : null,
      };
    });
    if (tooltipBounds.clippedLeft || tooltipBounds.clippedRight) {
      throw Error(`Tooltip clipped in ${core}/${mode}/${language}/${width}: ${JSON.stringify(tooltipBounds)}`);
    }

    const tooltipFile = `${core}-${mode}-${language}-${width}-render-switch-tooltip.png`;
    await page.screenshot({ path: path.join(out, tooltipFile) });

    // Hover onto tooltip to confirm WCAG 1.4.13 Hoverable, then Escape dismisses only tooltip
    const box = await tooltip.boundingBox();
    if (!box) throw Error('Missing tooltip boundingBox');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await tooltip.waitFor();
    await page.keyboard.press('Escape');
    await tooltip.waitFor({ state: 'hidden' });
    if (!(await traceSwitch.evaluate(el => document.activeElement === el))) throw Error('Escape moved focus off RenderSwitch');

    // Verify expanded card dialog Escape containment
    const expandBtn = page.getByRole('button', { name: `${t('Expand card')}: ${tracesTitle}`, exact: true });
    await expandBtn.click();
    const expandedDialog = page.locator('.telemetry-card-shell--expanded[role="dialog"]');
    await expandedDialog.waitFor();
    const modalSwitch = expandedDialog.getByRole('switch', { name: switchName, exact: true });
    await modalSwitch.focus();
    await page.getByRole('tooltip').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('tooltip').waitFor({ state: 'hidden' });
    if (!(await expandedDialog.isVisible())) throw Error('First Escape inside expanded card closed the dialog instead of tooltip');
    await page.keyboard.press('Escape');
    await expandedDialog.waitFor({ state: 'hidden' });

    // Unit settings drawer verification
    const unitsBtn = page.getByRole('button', { name: t('Telemetry Units'), exact: true });
    const drawer = page.locator('#telemetry-units-dialog');
    if ((await drawer.getAttribute('aria-hidden')) !== 'true') throw Error('Expected drawer aria-hidden="true" while closed');
    await unitsBtn.click();
    if ((await unitsBtn.getAttribute('aria-expanded')) !== 'true') throw Error('Expected aria-expanded="true" on Telemetry Units');
    if ((await drawer.getAttribute('aria-describedby')) !== 'telemetry-units-description') throw Error('Missing drawer aria-describedby');
    const drawerMetrics = await drawer.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        inert: el.hasAttribute('inert'),
        docScrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
      };
    });
    if (drawerMetrics.inert) throw Error('Expected open drawer not to be inert');
    if (drawerMetrics.transitionProperty.split(',').some(p => p.trim() === 'transform')) {
      throw Error(`Expected no transform transition under reduced motion, got ${drawerMetrics.transitionProperty} (${drawerMetrics.transitionDuration})`);
    }
    const followSwitch = drawer.getByRole('switch', { name: t('Follow App Global Units'), exact: true });
    if ((await followSwitch.getAttribute('aria-checked')) !== 'true') throw Error('Expected Follow App Global Units aria-checked="true"');

    const drawerFile = `${core}-${mode}-${language}-${width}-unit-settings-drawer.png`;
    await page.screenshot({ path: path.join(out, drawerFile) });

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('telemetry-units-dialog')?.getAttribute('aria-hidden') === 'true');
    if (!(await unitsBtn.evaluate(el => document.activeElement === el))) throw Error('Escape did not restore focus to Telemetry Units');

    results.push({ core, mode, language, width, tooltipFile, drawerFile, tooltipBounds, drawerMetrics, errors });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
    date: '2026-11-24',
    viewport: '1280x720 and 320x800',
    reducedMotion: 'reduce',
    dpr: 1,
    source: 'frontend/dist via vite preview + mock /api/** routes + real lang/*.json dictionaries',
    cases: results,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
