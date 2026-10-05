/* Opt-in sandboxed Chromium: real OverlayView/runtime, controlled disk-backed
 * HTTP persistence. Rust config contracts cover the real API service separately.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const repo = path.resolve(__dirname, '../../../../../../..');
  const frontend = path.join(repo, 'frontend');
  const out = path.resolve(process.env.OUTPUT_DIR || path.join(repo, 'scratch/stack_st8100-visual'), 'settings');
  fs.mkdirSync(out, { recursive: true });
  const configPath = path.join(out, 'fixture-hud-config.json');
  const defaults = JSON.parse(fs.readFileSync(path.join(repo, 'backend-rust/resources/defaults.json'), 'utf8'));
  fs.writeFileSync(configPath, JSON.stringify({ ...defaults.DEFAULT_HUD_CONFIG, hudStyle: 'simple',
    fixtureUnknownField: { preserved: true }, elements: { ...defaults.DEFAULT_HUD_CONFIG.elements, showTeleMaster: false } }));
  const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const saved = [], errors = [], failedResponses = [], samples = [], checks = [];
  let settings;
  const json = (res, body, status = 200) => {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
  };
  const fixtureApi = {
    name: 'stack-settings-fixture-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/api/overlay/config') {
          if (req.method !== 'POST') return json(res, readConfig());
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try { const config = JSON.parse(body); fs.writeFileSync(configPath, JSON.stringify(config)); saved.push(config); json(res, { success: true }); }
            catch (error) { json(res, { success: false, error: String(error) }, 400); }
          });
          return;
        }
        if (pathname === '/api/settings') {
          const query = new URL(req.headers.referer || 'http://localhost').searchParams;
          return json(res, { ...defaults.DEFAULT_SETTINGS, language: query.get('language') || 'en-us',
            units: { ...defaults.DEFAULT_SETTINGS.units, ...(query.get('imperial') ? defaults.GENERAL_UNIT_PROFILES.imperial : {}) } });
        }
        if (pathname === '/api/languages') return json(res, [{ code: 'en-us', name: 'English' }]);
        if (pathname.startsWith('/api/languages/')) {
          const language = pathname.split('/').pop();
          return json(res, ['en-us', 'zh-tw', 'ja-jp'].includes(language)
            ? JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8')) : {});
        }
        if (pathname === '/api/audio/devices') return json(res, [{ id: 'default', name: 'System Default Speaker', is_default: true }]);
        if (pathname === '/api/hud/styles') return json(res, { styles: ['stack_st8100', 'simple', 'vfd'].map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) });
        if (pathname.startsWith('/api/')) return json(res, { error: 'Unexpected fixture endpoint: ' + pathname }, 404);
        next();
      });
    },
  };
  process.env.FH6_PLATFORM = 'windows';
  process.chdir(frontend);
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), plugins: [fixtureApi],
    server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'warn' });
  let browser;
  try {
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    settings = await context.newPage();
    settings.on('pageerror', error => errors.push(String(error)));
    settings.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failedResponses.push({ url: response.url(), status: response.status() });
    });
    await settings.addInitScript(() => {
      window.fixtureBroadcasts = [];
      const observer = new BroadcastChannel('horizon_tuner_hud_channel');
      observer.onmessage = event => { window.fixtureBroadcasts.push(event.data); };
    });
    const settingsPath = '/src/features/overlay_control/stack_st8100/tests/browser/index.html';
    const style = settings.getByRole('combobox', { name: 'Speedometer Settings', exact: true });
    const card = settings.getByRole('group', { name: 'Stack ST8100 settings', exact: true });
    const input = key => settings.locator('input[id$="-' + key + '"]');
    const savedAs = async expected => {
      await settings.waitForFunction(async expected => {
        const config = await (await fetch('/api/overlay/config')).json();
        return Object.entries(expected).every(([key, value]) => config[key] === value);
      }, expected);
      await settings.waitForFunction(() => !document.querySelector('.hud-status')?.matches('[data-state="saving"],[data-state="loading"]'));
    };
    const open = async (query = '') => {
      await settings.goto(origin + settingsPath + query);
      await settings.locator('details.hud-advanced-settings > summary').click();
      await settings.waitForFunction(() => !document.querySelector('select[id$="-style"]')?.disabled);
    };
    const type = async (key, text, finish = 'Enter') => {
      const field = input(key);
      await field.focus(); await field.press('ControlOrMeta+A'); await field.press('Backspace');
      if (text) await field.pressSequentially(text);
      await field.press(finish);
    };
    const capture = async (name, target = card) => {
      await target.scrollIntoViewIfNeeded();
      const state = await target.evaluate(element => {
        const b = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll('input,select')].map(input => {
          const r = input.getBoundingClientRect();
          return { label: input.labels?.[0]?.textContent, width: r.width, left: r.left, right: r.right };
        });
        return { width: b.width, viewportWidth: innerWidth, fits: b.left >= 0 && b.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1, controls };
      });
      assert(state.fits, name + ' overflows viewport');
      assert(state.controls.every(control => control.label && control.width > 0 && control.left >= 0 && control.right <= state.viewportWidth), name + ' control clipping or missing label');
      await target.screenshot({ path: path.join(out, name + '.png') }); samples.push({ name, ...state });
    };
    await open();
    assert.equal(await card.count(), 0);
    await style.selectOption('stack_st8100'); await card.waitFor({ state: 'visible' });
    await savedAs(defaults.DEFAULT_STACK_ST8100_CONFIG);
    await card.getByRole('combobox', { name: 'LCD upper left', exact: true }).selectOption('current_lap');
    await card.getByRole('combobox', { name: 'LCD upper right', exact: true }).selectOption('boost');
    await card.getByRole('combobox', { name: 'LCD lower left', exact: true }).selectOption('peak_rpm');
    await card.getByRole('combobox', { name: 'LCD lower right', exact: true }).selectOption('tire_max');
    await card.getByRole('combobox', { name: 'Tachometer range', exact: true }).selectOption('0-4-10');
    await card.getByRole('combobox', { name: 'LCD page', exact: true }).selectOption('peaks');
    await savedAs({ stackSt8100Field1: 'current_lap', stackSt8100Field2: 'boost', stackSt8100Field3: 'peak_rpm', stackSt8100Field4: 'tire_max', stackSt8100Dial: '0-4-10', stackSt8100Page: 'peaks' });

    for (const label of ['Low fuel warning', 'High tire temperature warning', 'High boost warning']) await card.getByRole('checkbox', { name: label, exact: true }).check();
    await savedAs({ stackSt8100FuelWarningEnabled: true, stackSt8100TireWarningEnabled: true, stackSt8100BoostWarningEnabled: true });
    const beforeDraft = saved.length;
    await input('stackSt8100BoostWarningBar').focus();
    await input('stackSt8100BoostWarningBar').press('ControlOrMeta+A'); await input('stackSt8100BoostWarningBar').press('Backspace');
    assert.equal(await input('stackSt8100BoostWarningBar').inputValue(), '');
    await input('stackSt8100BoostWarningBar').pressSequentially('2.25');
    assert.equal(readConfig().stackSt8100BoostWarningBar, 1.5);
    assert.equal(saved.length, beforeDraft, 'Draft keystrokes must not POST config');
    await input('stackSt8100BoostWarningBar').press('Enter'); await savedAs({ stackSt8100BoostWarningBar: 2.25 });
    await type('stackSt8100FuelWarningPercent', '12', 'Tab'); await savedAs({ stackSt8100FuelWarningPercent: 12 });
    await type('stackSt8100TireWarningC', '125', 'Enter'); await savedAs({ stackSt8100TireWarningC: 125 });
    await type('stackSt8100ShiftPercent', '95', 'Tab'); await savedAs({ stackSt8100ShiftPercent: 95 });
    const beforeCancel = saved.length;
    await type('stackSt8100BoostWarningBar', '4.2', 'Escape');
    assert.equal(await input('stackSt8100BoostWarningBar').inputValue(), '2.25');
    await input('stackSt8100BoostWarningBar').press('Tab');
    await type('stackSt8100FuelWarningPercent', '', 'Tab');
    await type('stackSt8100FuelWarningPercent', 'invalid', 'Enter');
    assert.equal(saved.length, beforeCancel, 'Cancelled, empty and invalid drafts must not save');
    assert.equal(await input('stackSt8100FuelWarningPercent').inputValue(), '12');
    checks.push('Keyboard decimal drafts, blur/Enter commit, Escape/empty/invalid rollback');

    await card.getByRole('combobox', { name: 'Tire temperature unit', exact: true }).selectOption('f');
    await savedAs({ stackSt8100TemperatureUnit: 'f', stackSt8100TireWarningC: 125 });
    assert.equal(await input('stackSt8100TireWarningC').inputValue(), '257');
    await type('stackSt8100TireWarningC', '248'); await savedAs({ stackSt8100TireWarningC: 120 });
    await open('?imperial=1'); await card.waitFor({ state: 'visible' });
    assert.equal(await input('stackSt8100BoostWarningBar').inputValue(), '32.63');
    const beforeUnedited = saved.length;
    await input('stackSt8100BoostWarningBar').focus(); await input('stackSt8100BoostWarningBar').press('Tab');
    assert.equal(saved.length, beforeUnedited, 'Unedited rounded PSI must retain exact canonical bar');
    assert.equal(readConfig().stackSt8100BoostWarningBar, 2.25);
    await settings.getByRole('button', { name: 'HUD Unit Settings', exact: true }).click();
    await settings.locator('#hud-follow-global-units').uncheck();
    await settings.locator('#hud-boost-unit').selectOption('kpa');
    await settings.getByRole('button', { name: 'Close Unit Settings', exact: true }).click();
    assert.equal(await input('stackSt8100BoostWarningBar').inputValue(), '225');
    await type('stackSt8100BoostWarningBar', '180'); await savedAs({ stackSt8100BoostWarningBar: 1.8 });
    await settings.waitForFunction(() => window.fixtureBroadcasts.some(message => message.type === 'config' && message.data.stackSt8100BoostWarningBar === 1.8 && message.data.effectiveUnits.boostPressure === 'kpa'));
    assert.equal(readConfig().effectiveUnits, undefined);
    assert.equal(readConfig().fixtureUnknownField.preserved, true);
    checks.push('C/F and follow-app PSI/independent kPa preserve canonical C/bar and broadcast effective units');
    await open('?imperial=1'); await card.waitFor({ state: 'visible' });
    assert.equal(await input('stackSt8100BoostWarningBar').inputValue(), '180');
    assert.equal(await input('stackSt8100TireWarningC').inputValue(), '248');
    for (const theme of ['dark', 'light']) for (const core of ['default', 'modern', 'elegant']) {
      await settings.evaluate(({ theme, core }) => { document.documentElement.dataset.bsTheme = theme; document.documentElement.dataset.bsCore = core; }, { theme, core });
      await capture('settings-' + theme + '-' + core);
    }
    await settings.setViewportSize({ width: 390, height: 844 }); await capture('settings-narrow');
    await settings.setViewportSize({ width: 1440, height: 1100 });
    await style.selectOption('simple'); await card.waitFor({ state: 'detached' });
    await style.selectOption('stack_st8100'); await card.waitFor({ state: 'visible' });
    await savedAs({ stackSt8100Page: 'peaks', stackSt8100BoostWarningBar: 1.8 });
    const beforeResetCancel = saved.length;
    settings.once('dialog', dialog => dialog.dismiss());
    await settings.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    assert.equal(saved.length, beforeResetCancel);
    settings.once('dialog', dialog => dialog.accept());
    await settings.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    await card.waitFor({ state: 'detached' }); await savedAs({ hudStyle: 'vfd' });
    assert.equal(readConfig().stackSt8100Page, undefined);
    await style.selectOption('stack_st8100'); await card.waitFor({ state: 'visible' });
    await savedAs(defaults.DEFAULT_STACK_ST8100_CONFIG);
    checks.push('Persisted reload, style round-trip, reset cancellation and confirmed defaults');
    for (const language of ['zh-tw', 'ja-jp']) {
      const translations = JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8'));
      await settings.setViewportSize({ width: 390, height: 844 }); await open('?language=' + language);
      const translated = settings.getByRole('group', { name: translations['Stack ST8100 settings'], exact: true });
      await translated.waitFor({ state: 'visible' });
      const glyphs = await translated.evaluate(async (element, language) => {
        const family = language === 'zh-tw' ? 'Noto Sans CJK TC' : 'Noto Sans CJK JP';
        await new FontFace('StackCjkAvailabilityProbe', `local("${family}")`).load();
        await document.fonts.ready;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = `400 32px ${getComputedStyle(element).fontFamily}`;
        const probes = language === 'zh-tw' ? ['胎', '溫', '轉'] : ['タ', 'イ', 'ヤ'];
        const rasters = probes.map(glyph => { ctx.clearRect(0, 0, 64, 64); ctx.fillText(glyph, 8, 44); return Array.from(ctx.getImageData(0, 0, 64, 64).data).filter((_, index) => index % 4 === 3); });
        return { family, probes, nonempty: rasters.every(pixels => pixels.some(alpha => alpha > 0)), distinct: new Set(rasters.map(pixels => pixels.join(','))).size === probes.length };
      }, language);
      assert(glyphs.nonempty && glyphs.distinct, language + ' missing CJK glyphs');
      await capture('settings-narrow-' + language, translated); samples.at(-1).glyphs = glyphs;
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  } catch (error) {
    errors.push(String(error));
    await settings?.screenshot({ path: path.join(out, 'settings-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'settings-audit.json'), JSON.stringify({
      scope: 'Actual React HUD controls and runtime, controlled disk-backed HTTP fixture; no native/game validation',
      errors, failedResponses, samples, checks, saved,
    }, null, 2));
    await browser?.close(); await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
