/* Opt-in Chromium integration: actual OverlayView, runtime, Launcher and style.
 * HTTP persistence is a controlled fixture; Rust tests cover the real service.
 * Run in the sandboxed Chrome CI job, never add --no-sandbox as a fallback.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const repo = path.resolve(__dirname, '../../../../../../..');
  const frontend = path.join(repo, 'frontend');
  const out = path.resolve(process.env.OUTPUT_DIR || path.join(repo, 'scratch/lfa_center_ring-visual'), 'settings');
  fs.mkdirSync(out, { recursive: true });
  const configPath = path.join(out, 'fixture-hud-config.json');
  const defaults = JSON.parse(fs.readFileSync(path.join(repo, 'backend-rust/resources/defaults.json'), 'utf8'));
  const initial = { ...defaults.DEFAULT_HUD_CONFIG, hudStyle: 'lfa_center_ring',
    fixtureUnknownField: { preserved: true },
    elements: { ...defaults.DEFAULT_HUD_CONFIG.elements, showTeleMaster: false, showMotionEffect: false } };
  fs.writeFileSync(configPath, JSON.stringify(initial));
  const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const saved = [], errors = [], failedResponses = [], samples = [], expansionChecks = [];
  const json = (res, body, status = 200) => {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
  };
  const fixtureApi = {
    name: 'lfa-settings-fixture-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/api/overlay/config') {
          if (req.method !== 'POST') return json(res, readConfig());
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const config = JSON.parse(body);
              fs.writeFileSync(configPath, JSON.stringify(config));
              saved.push(config); json(res, { success: true });
            } catch (error) { json(res, { success: false, error: String(error) }, 400); }
          });
          return;
        }
        if (pathname === '/api/settings') {
          const language = new URL(req.headers.referer || 'http://localhost').searchParams.get('language') || 'en-us';
          return json(res, { ...defaults.DEFAULT_SETTINGS, language });
        }
        if (pathname === '/api/languages') return json(res, [{ code: 'en-us', name: 'English' }]);
        if (pathname.startsWith('/api/languages/')) {
          const language = pathname.split('/').pop();
          return json(res, ['en-us', 'zh-tw', 'ja-jp'].includes(language)
            ? JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8')) : {});
        }
        if (pathname === '/api/audio/devices') return json(res, [{ id: 'default', name: 'System Default Speaker', is_default: true }]);
        if (pathname === '/api/hud/styles') return json(res, { styles: ['lfa_center_ring', 'simple', 'vfd'].map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) });
        if (pathname.startsWith('/api/')) return json(res, { error: 'Unexpected fixture endpoint: ' + pathname }, 404);
        next();
      });
    },
  };
  process.env.FH6_PLATFORM = 'windows';
  process.chdir(frontend);
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'),
    plugins: [fixtureApi], server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'warn' });
  let browser;
  try {
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const settings = await context.newPage();
    const host = await context.newPage();
    for (const page of [settings, host]) {
      page.on('pageerror', error => errors.push(String(error)));
      page.on('response', response => {
        if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failedResponses.push({ url: response.url(), status: response.status() });
      });
    }
    await host.addInitScript(() => {
      class Socket {
        constructor(url) { this.url = url; this.readyState = 1; setTimeout(() => this.onopen?.({}), 30); }
        send() {}
        close() { this.readyState = 3; }
      }
      Socket.OPEN = 1; window.WebSocket = Socket;
    });
    const settingsPath = '/src/features/overlay_control/lfa_center_ring/tests/browser/index.html';
    const manual = settings.getByRole('switch', { name: 'Manually Expand LFA Ring', exact: true });
    const automatic = settings.getByRole('switch', { name: 'Automatically Expand During Races', exact: true });
    const style = settings.getByRole('combobox', { name: 'Speedometer Settings', exact: true });
    const card = settings.getByRole('group', { name: 'LFA Ring Expansion', exact: true });
    async function openSettings() {
      await settings.goto(origin + settingsPath);
      await settings.getByText('Advanced settings', { exact: true }).click();
      await manual.waitFor({ state: 'visible' });
      await settings.waitForFunction(() => !document.querySelector('[role="switch"]')?.disabled);
    }
    async function assertSaved(lfaManualExpand, lfaAutoExpand) {
      await settings.waitForFunction(async expected => {
        const config = await (await fetch('/api/overlay/config')).json();
        return config.lfaManualExpand === expected.manual && config.lfaAutoExpand === expected.auto;
      }, { manual: lfaManualExpand, auto: lfaAutoExpand });
      assert.equal(await manual.isChecked(), lfaManualExpand);
      assert.equal(await automatic.isChecked(), lfaAutoExpand);
    }
    async function assertDelivered(lfaManualExpand, lfaAutoExpand) {
      await host.waitForFunction(expected => {
        const config = document.querySelector('#hud-iframe')?.contentWindow?._currentFullConfig;
        return config?.lfaManualExpand === expected.manual && config?.lfaAutoExpand === expected.auto;
      }, { manual: lfaManualExpand, auto: lfaAutoExpand });
    }
    async function assertExpanded(name, expanded) {
      await host.waitForFunction(expected => {
        const container = document.querySelector('#hud-iframe')?.contentWindow?.document.querySelector('#lfaContainer');
        return container?.dataset.expanded === String(expected) && container?.dataset.expansionSettled === 'true';
      }, expanded, { timeout: 5000 });
      expansionChecks.push({ name, expanded });
    }
    async function capture(name) {
      await card.scrollIntoViewIfNeeded();
      const state = await card.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent, width: bounds.width, viewportWidth: innerWidth,
          switches: [...element.querySelectorAll('[role="switch"]')].map(input => ({
            checked: input.checked, label: input.labels?.[0]?.textContent,
            description: document.getElementById(input.getAttribute('aria-describedby'))?.textContent,
          })) };
      });
      assert.equal(state.switches.length, 2);
      assert(state.width > 0 && state.width <= state.viewportWidth);
      assert(state.switches.every(input => input.label && input.description));
      await card.screenshot({ path: path.join(out, name + '.png') });
      samples.push({ name, ...state });
    }
    await openSettings();
    await assertSaved(false, false);
    await host.goto(origin + '/hud/index.html');
    await assertDelivered(false, false);
    await assertExpanded('initial-collapsed', false);
    await manual.check(); await assertSaved(true, false); await assertDelivered(true, false);
    await assertExpanded('manual-expanded', true);
    await automatic.check(); await assertSaved(true, true); await assertDelivered(true, true);
    await manual.uncheck(); await assertSaved(false, true); await assertDelivered(false, true);
    await assertExpanded('automatic-without-timing', false);
    assert.equal(readConfig().fixtureUnknownField.preserved, true);

    // Browser reload reads the persisted values through the actual runtime.
    await openSettings(); await assertSaved(false, true);
    await host.reload(); await assertDelivered(false, true);
    const telemetry = JSON.parse(fs.readFileSync(path.join(repo, 'hud_overlay/lfa_center_ring/tests/fixtures/udp-parser-samples.json'), 'utf8')).samples[0].parsedJson;
    await host.evaluate(raw => {
      window.settingsAuditRaw = { ...raw, CurrentLap: 1 };
      window.settingsAuditFeed = setInterval(() => {
        window.settingsAuditRaw.TimestampMS += 16;
        window.settingsAuditRaw.CurrentLap += 0.016;
        window.dispatchEvent(new CustomEvent('telemetry', { detail: { ...window.settingsAuditRaw } }));
      }, 16);
    }, telemetry);
    await assertExpanded('automatic-race-expanded', true);
    await manual.check(); await assertSaved(true, true);
    await manual.uncheck(); await assertSaved(false, true);
    await assertExpanded('manual-off-keeps-active-automatic-race', true);
    await automatic.uncheck(); await assertSaved(false, false);
    await assertExpanded('both-off-collapses-during-race', false);
    await automatic.check(); await assertSaved(false, true);
    await assertExpanded('automatic-on-restores-race', true);
    await host.evaluate(() => clearInterval(window.settingsAuditFeed));
    await assertExpanded('stale-replayed-timing-collapses', false);
    // Keyboard changes operate the actual switch and reach the iframe.
    await manual.focus(); await manual.press('Space');
    await assertSaved(true, true); await assertDelivered(true, true);
    await assertExpanded('keyboard-manual-expands-without-signal', true);
    await host.reload(); await assertDelivered(true, true);
    await assertExpanded('persisted-manual-reload-expanded', true);

    for (const theme of ['dark', 'light']) {
      for (const core of ['default', 'modern', 'elegant']) {
        await settings.evaluate(({ theme, core }) => {
          document.documentElement.dataset.bsTheme = theme;
          document.documentElement.dataset.bsCore = core;
        }, { theme, core });
        await capture('settings-' + theme + '-' + core);
      }
    }
    await settings.setViewportSize({ width: 390, height: 844 });
    await capture('settings-narrow');
    await settings.setViewportSize({ width: 1440, height: 1000 });
    await style.selectOption('simple');
    await card.waitFor({ state: 'detached' });
    assert.equal(await settings.getByRole('switch', { name: 'Manually Expand LFA Ring', exact: true }).count(), 0);
    await host.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle()?.containerId === 'simpleContainer');
    await style.selectOption('lfa_center_ring');
    await card.waitFor({ state: 'visible' });
    await assertSaved(true, true); await assertDelivered(true, true);

    // Exercise the real reset button, including cancel before confirmation.
    settings.once('dialog', dialog => dialog.dismiss());
    await settings.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    await assertSaved(true, true);
    settings.once('dialog', dialog => dialog.accept());
    await settings.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    await settings.waitForFunction(async () => {
      const config = await (await fetch('/api/overlay/config')).json();
      return config.hudStyle === 'vfd' && config.lfaManualExpand === false && config.lfaAutoExpand === false;
    });
    await style.selectOption('lfa_center_ring');
    await card.waitFor({ state: 'visible' });
    await assertSaved(false, false); await assertDelivered(false, false);
    await assertExpanded('reset-restores-collapsed', false);
    await openSettings(); await assertSaved(false, false);
    // Long translated help must remain readable in a narrow real settings page.
    for (const language of ['zh-tw', 'ja-jp']) {
      const translation = JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8'));
      await settings.setViewportSize({ width: 390, height: 844 });
      await settings.goto(origin + settingsPath + '?language=' + language);
      const translatedTitle = translation['LFA Ring Expansion'];
      await settings.getByText(translatedTitle, { exact: true }).waitFor({ state: 'attached' });
      await settings.locator('details.hud-advanced-settings > summary').click();
      const translatedCard = settings.getByRole('group', { name: translatedTitle, exact: true });
      await translatedCard.scrollIntoViewIfNeeded();
      assert.equal(await translatedCard.getByRole('switch').count(), 2);
      const glyphs = await translatedCard.evaluate(async (element, language) => {
        const family = language === 'zh-tw' ? 'Noto Sans CJK TC' : 'Noto Sans CJK JP';
        // FontFace.load rejects a missing local face; document.fonts.check alone
        // can return true for an unavailable family that falls back to tofu.
        await new FontFace('LfaCjkAvailabilityProbe', `local("${family}")`).load();
        await document.fonts.ready;
        const fontFamily = getComputedStyle(element).fontFamily;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.font = `400 32px ${fontFamily}`;
        const probes = language === 'zh-tw' ? ['儀', '環', '展'] : ['メ', 'タ', '計'];
        const rasters = probes.map(glyph => {
          context.clearRect(0, 0, 64, 64); context.fillText(glyph, 8, 44);
          const pixels = context.getImageData(0, 0, 64, 64).data;
          return Array.from(pixels).filter((_, index) => index % 4 === 3);
        });
        return { family, fontFamily, probes, nonempty: rasters.every(pixels => pixels.some(alpha => alpha > 0)),
          distinct: new Set(rasters.map(pixels => pixels.join(','))).size === probes.length };
      }, language);
      assert.equal(glyphs.nonempty && glyphs.distinct, true, language + ' missing or identical fallback glyphs');
      const fits = await translatedCard.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1;
      });
      assert.equal(fits, true, language + ' settings overflow');
      await translatedCard.screenshot({ path: path.join(out, 'settings-narrow-' + language + '.png') });
      samples.push({ name: 'settings-narrow-' + language, text: await translatedCard.textContent(), fits, glyphs });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  } catch (error) {
    errors.push(String(error)); throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'settings-audit.json'), JSON.stringify({
      scope: 'Real React HUD settings page and Launcher; controlled HTTP persistence and telemetry sockets',
      errors, failedResponses, samples, expansionChecks, saved,
    }, null, 2));
    await browser?.close(); await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
