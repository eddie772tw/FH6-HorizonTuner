/* Opt-in browser integration: real settings/runtime/theme providers; isolated HTTP data.
 * Native HUD, game and screen-reader acceptance are separate from this fixture.
 * PLAYWRIGHT_MODULE_PATH may point to a task-local installation. Never disable the sandbox.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const repo = path.resolve(__dirname, '../../../../../..');
  const frontend = path.join(repo, 'frontend');
  const out = path.resolve(process.env.OUTPUT_DIR || path.join(repo, 'scratch/hud-settings-browser'));
  fs.mkdirSync(out, { recursive: true });
  const defaults = JSON.parse(fs.readFileSync(path.join(repo, 'backend-rust/resources/defaults.json'), 'utf8'));
  let config = { ...defaults.DEFAULT_HUD_CONFIG, enabled: true, hudStyle: 'vfd',
    telemetryGRadarOffsetX: -55, telemetryPedalScale: 0.8, telemetryMergedChartsScale: 1.2,
    fixtureUnknown: { preserved: true }, elements: { ...defaults.DEFAULT_HUD_CONFIG.elements, showTeleTires: false } };
  let appSettings = structuredClone(defaults.DEFAULT_SETTINGS);
  let rejectNextSave = false;
  const report = { saves: [], errors: [], unexpectedRequests: [], layouts: [], screenshots: [], metadataReads: 0, checks: [] };
  const json = (res, body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  const parseBody = (req, callback) => { let data = ''; req.on('data', chunk => { data += chunk; }); req.on('end', () => callback(JSON.parse(data))); };
  const fixtureApi = { name: 'hud-settings-fixture', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const name = new URL(req.url, 'http://localhost').pathname;
      if (name === '/api/overlay/config') {
        if (req.method !== 'POST') return json(res, config);
        return parseBody(req, value => setTimeout(() => {
          if (rejectNextSave) { rejectNextSave = false; return json(res, { success: false, error: 'Fixture save rejected' }); }
          config = value; report.saves.push(value); json(res, { success: true });
        }, 30));
      }
      if (name === '/api/settings') {
        if (req.method === 'POST') return parseBody(req, patch => { appSettings = { ...appSettings, ...patch }; json(res, appSettings); });
        const language = new URL(req.headers.referer || 'http://localhost').searchParams.get('language') || 'en-us';
        return json(res, { ...appSettings, language });
      }
      if (name === '/api/cars/database') return json(res, {});
      if (['/api/cars/with_params', '/api/analysis/sessions', '/api/road/engine-observations', '/api/tuning/engine-archive'].includes(name)) return json(res, []);
      if (name === '/api/car_params/default_car') return json(res, { error: 'No vehicle selected in this visual fixture' });
      if (name === '/api/tuning/profile') return json(res, null);
      if (name === '/api/analysis/status') return json(res, { isRecording: false, recordingCount: 0 });
      if (name === '/api/diagnostics/telemetry-pipeline') return json(res, { input: { datagramsReceived: 0, packetsParsed: 0, packetsRejected: {}, lastDatagramAt: null } });
      if (name === '/api/runtime') return json(res, { platform: 'windows', capabilities: { systemMedia: true } });
      if (name === '/api/languages') return json(res, ['en-us', 'zh-tw', 'ja-jp'].map(code => ({ code, name: code })));
      if (name.startsWith('/api/languages/')) return json(res, JSON.parse(fs.readFileSync(path.join(repo, 'lang', name.split('/').pop() + '.json'), 'utf8')));
      if (name === '/api/audio/devices') return json(res, [{ id: 'default', name: 'System Default Speaker', is_default: true }]);
      if (name === '/api/audio/device') return json(res, { success: true });
      if (name === '/api/hud/styles') {
        report.metadataReads++;
        return json(res, { styles: ['vfd', 'simple', 's650_hmi', 'classic_jdm', 'r34_mfd', 'stack_st8100', 'lfa_center_ring', 'audio_head']
          .map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) });
      }
      if (name.startsWith('/api/')) { report.unexpectedRequests.push(name); return json(res, { error: 'Unexpected fixture endpoint: ' + name }, 404); }
      next();
    });
  } };
  process.env.FH6_PLATFORM = 'windows';
  process.chdir(frontend);
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const server = await createServer({ root: frontend, cacheDir: path.join(out, 'vite-cache'), configFile: path.join(frontend, 'vite.config.ts'), plugins: [fixtureApi],
    server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'warn' });
  let browser, page;
  try {
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // Connected transports with no game frames. Do not fake an active Data Out status.
    await context.routeWebSocket(/\/ws\/(telemetry|overlay)$/, () => {});
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.errors.push(String(error)));
    await page.addInitScript(() => {
      localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
      window.fixtureBroadcasts = [];
      const channel = new BroadcastChannel('horizon_tuner_hud_channel');
      channel.onmessage = event => window.fixtureBroadcasts.push(event.data);
    });
    const tab = id => page.locator(`[role=tab][id$="-tab-${id}"]`);
    const panel = id => page.locator(`[role=tabpanel][id$="-panel-${id}"]`);
    const open = async (language = 'en-us') => {
      await page.goto(origin + '/src/features/overlay_control/tests/browser/index.html?shell&language=' + language);
      await page.locator('.app-header .popover .btn-close').click();
      await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click();
      await page.waitForFunction(() => Boolean(window.hudSettingsFixtureTheme) && document.querySelector('.hud-status')?.dataset.state === 'synced');
    };
    const saved = expected => page.waitForFunction(async values => {
      const current = await (await fetch('/api/overlay/config', { cache: 'no-store' })).json();
      return Object.entries(values).every(([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value));
    }, expected);
    const idle = () => page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
    const rangeEnd = async name => { const input = page.getByRole('slider', { name, exact: true }); await input.focus(); await input.press('End'); };
    const expand = async name => {
      const card = page.getByRole('region', { name, exact: true });
      await card.locator('summary').click(); return card;
    };

    await open();
    assert.equal(await page.getByRole('tab').count(), 4);
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Main gauge', 'Telemetry cards', 'General', 'Audio Head']);
    assert.equal(await tab('gauge').getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Close HUD Overlay', exact: true }).isDisabled(), true);
    const beforeTabs = report.saves.length, beforeReads = report.metadataReads;
    await tab('gauge').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await tab('telemetry').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End'); assert.equal(await tab('audio-head').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight'); assert.equal(await tab('gauge').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft'); assert.equal(await tab('audio-head').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    assert.equal(await panel('gauge').evaluate(el => document.activeElement === el), true);
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    for (const id of ['gauge', 'telemetry', 'general', 'audio-head']) {
      assert.equal(await tab(id).getAttribute('aria-controls'), await panel(id).getAttribute('id'));
      assert.equal(await panel(id).getAttribute('aria-labelledby'), await tab(id).getAttribute('id'));
    }
    await page.waitForTimeout(150);
    assert.equal(report.saves.length, beforeTabs); assert.equal(report.metadataReads, beforeReads);
    report.checks.push('Keyboard, ARIA relationships, hidden panels and side-effect-free tab changes');

    await tab('audio-head').click();
    assert.equal(await page.getByRole('checkbox', { name: 'Show Audio Head', exact: true }).isChecked(), false);
    await page.getByRole('combobox', { name: 'Car Audio Head Unit Model', exact: true }).selectOption('8');
    await rangeEnd('Audio Head scale'); await saved({ audioHeadScale: 2, audioHeadDeck: 8 });
    await tab('gauge').click();
    await page.getByRole('slider', { name: 'Main gauge scale', exact: true }).press('Home');
    await saved({ scale: 0.5, audioHeadScale: 2 }); await idle();
    await tab('audio-head').click();
    const audioScaleInput = page.getByRole('spinbutton', { name: 'Audio Head scale', exact: true });
    const beforeAudioDraft = report.saves.length;
    await audioScaleInput.fill('125'); await tab('general').click(); await tab('audio-head').click();
    assert.equal(await audioScaleInput.inputValue(), '125');
    assert.equal(report.saves.length, beforeAudioDraft);
    await audioScaleInput.press('Enter'); await saved({ audioHeadScale: 1.25 }); await idle();
    await audioScaleInput.fill(''); await tab('gauge').click(); await tab('audio-head').click();
    assert.equal(await audioScaleInput.inputValue(), '');
    await audioScaleInput.fill('200'); await audioScaleInput.press('Enter'); await idle();
    const audioAlignment = page.getByRole('combobox', { name: 'Audio Head Alignment', exact: true });
    const audioX = page.getByRole('slider', { name: 'Audio Head X-Offset', exact: true });
    const audioY = page.getByRole('slider', { name: 'Audio Head Y-Offset', exact: true });
    assert.equal(await audioX.isEnabled(), true); assert.equal(await audioY.isEnabled(), true);
    // Changing anchors preserves the other screen axis and clamps the forbidden direction.
    await audioX.press('ArrowRight'); await audioY.press('ArrowLeft'); await idle();
    await audioAlignment.selectOption('right'); await idle();
    assert.equal(await audioX.inputValue(), '0'); assert.equal(await audioY.inputValue(), '-1');
    await saved({ audioHeadEdge: 'right', audioHeadOffset: 0, audioHeadCenterOffset: -1 });
    await audioY.press('ArrowRight'); await idle();
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      await audioAlignment.selectOption(edge); await idle();
      const locked = edge === 'left' || edge === 'right' ? audioX : audioY;
      const inwardPositive = edge === 'left' || edge === 'top';
      assert.equal(await locked.getAttribute(inwardPositive ? 'min' : 'max'), '0');
      await locked.press(inwardPositive ? 'Home' : 'End');
      await locked.press(inwardPositive ? 'ArrowLeft' : 'ArrowRight');
      assert.equal(await locked.inputValue(), '0', edge + ' must reject outward motion past zero');
      await locked.press(inwardPositive ? 'ArrowRight' : 'ArrowLeft'); await idle();
      assert.equal(await locked.inputValue(), inwardPositive ? '1' : '-1');
      await saved({ audioHeadEdge: edge, audioHeadOffset: 1 });
      await locked.press(inwardPositive ? 'Home' : 'End'); await idle();
    }
    // Values survive cross-tab edits and a reload in the original storage format.
    await audioX.press('ArrowLeft'); await idle();
    await tab('general').click(); await tab('audio-head').click();
    assert.equal(await audioX.inputValue(), '-1');
    await open(); await tab('audio-head').click();
    assert.equal(await audioAlignment.inputValue(), 'bottom');
    assert.equal(await audioX.inputValue(), '-1'); assert.equal(await audioY.inputValue(), '0');
    await audioX.press('ArrowRight'); await audioAlignment.selectOption('left'); await idle();
    await page.getByRole('checkbox', { name: 'Show Audio Head', exact: true }).check(); await idle();
    assert.equal(config.audioHeadScale, 2); assert.equal(config.scale, 0.5);
    report.checks.push('Fourth Audio Head tab: hidden configuration, scale drafts, X/Y sliders, four directional bounds and persisted reload');

    await tab('telemetry').click();
    const collapsed = panel('telemetry').locator('details').first();
    await collapsed.locator('summary').focus(); await page.keyboard.press('Tab');
    assert.equal(await collapsed.evaluate(el => el.contains(document.activeElement)), false);
    await collapsed.locator('summary').focus(); await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await collapsed.evaluate(el => el.contains(document.activeElement)), true);
    await collapsed.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await collapsed.getAttribute('open'), null);
    report.checks.push('Collapsed details skip hidden controls and support keyboard expansion');

    await tab('gauge').click();
    await page.getByRole('checkbox', { name: 'Show main gauge', exact: true }).uncheck();
    await page.getByRole('combobox', { name: 'Speedometer Settings', exact: true }).selectOption('s650_hmi');
    await saved({ hudStyle: 's650_hmi' });
    assert.equal(config.elements.showGauge, false);
    await page.getByRole('combobox', { name: /^S650 HMI Mode/ }).selectOption('track');
    await tab('telemetry').click();
    await page.getByRole('checkbox', { name: 'Toggle Master Telemetry HUD Switch', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Tire Slip Radar', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Tire Slip Radar', exact: true }).check();
    await expand('Tires & suspension');
    await rangeEnd('Corner Cards X-Offset');
    await expand('G-Force & Attitude');
    await page.getByRole('combobox', { name: 'G-Force Radar Alignment', exact: true }).selectOption('left');
    await saved({ telemetryGRadarAlignment: 'left', telemetryGRadarOffsetX: 0, telemetryCornerOffsetX: 500 });
    await idle();
    assert.equal(config.elements.showTeleMaster, false); assert.equal(config.elements.showTeleTires, true);
    await expand('Power & pedal charts');
    await page.getByRole('checkbox', { name: 'Merge Power & Pedal Charts', exact: true }).uncheck();
    assert.equal(await page.getByRole('slider', { name: 'Pedal Chart Scale', exact: true }).inputValue(), '0.8');
    await page.getByRole('checkbox', { name: 'Merge Power & Pedal Charts', exact: true }).check();
    assert.equal(await page.getByRole('slider', { name: 'Merged Charts Scale', exact: true }).inputValue(), '1.2');
    await expand('Controller Telemetry Card');
    assert.equal(await page.getByRole('combobox', { name: 'Controller Layout', exact: true }).isEnabled(), true);
    await page.getByRole('combobox', { name: 'Controller Layout', exact: true }).selectOption('dualsense');
    await saved({ gamepadLayout: 'dualsense', s650Theme: 'track' });
    assert.deepEqual(config.fixtureUnknown, { preserved: true });
    report.checks.push('Hidden configuration, cross-tab patches, tire dependency, G alignment and merged-chart values');

    await idle();
    const opacity = page.getByRole('spinbutton', { name: 'Telemetry Opacity', exact: true });
    await opacity.fill('');
    await panel('telemetry').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const scroll = await panel('telemetry').evaluate(el => el.scrollTop);
    const beforeDraft = report.saves.length;
    await tab('general').click(); await tab('telemetry').click();
    assert.equal(await opacity.inputValue(), '');
    assert.equal(await panel('telemetry').evaluate(el => el.scrollTop), scroll);
    assert.equal(await panel('telemetry').locator('details[open]').count(), 4);
    assert.equal(report.saves.length, beforeDraft);
    await opacity.fill('75');
    await tab('general').click(); await tab('telemetry').click();
    assert.equal(await opacity.inputValue(), '75');
    assert.equal(report.saves.length, beforeDraft, 'Changing tabs must not commit a valid numeric draft');
    await opacity.press('Enter'); await saved({ telemetryOpacity: 0.75 });
    report.checks.push('Retained expansion, draft and independent scroll positions');

    await tab('general').click();
    const units = page.getByRole('region', { name: 'HUD Unit Settings', exact: true });
    await units.getByRole('checkbox', { name: 'Follow App Global Units', exact: true }).uncheck();
    await units.getByRole('combobox', { name: 'Speed Unit', exact: true }).selectOption('mph');
    await units.getByRole('combobox', { name: 'Temperature', exact: true }).selectOption('F');
    await idle(); assert.equal(config.units.speed, 'mph'); assert.equal(config.unit, 'mph'); assert.equal(config.units.temperature, 'F');
    rejectNextSave = true;
    await page.getByRole('checkbox', { name: 'Use Default Gauge Colors', exact: true }).uncheck();
    await page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'attention');
    await tab('gauge').click();
    await page.getByRole('button', { name: /^HUD status:/ }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await saved({ useDefaultColors: false }); await page.keyboard.press('Escape');
    await open();
    assert.equal(await tab('gauge').getAttribute('aria-selected'), 'true');
    assert.equal(config.units.temperature, 'F'); assert.equal(config.elements.showGauge, false);
    await tab('telemetry').click(); assert.equal(await panel('telemetry').locator('details[open]').count(), 0);
    report.checks.push('Independent units, retry across tabs, persistence and fresh page defaults');

    await tab('general').click();
    const beforeReset = report.saves.length;
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    assert.equal(report.saves.length, beforeReset);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset HUD Settings', exact: true }).click();
    await saved({ enabled: true, scale: defaults.DEFAULT_HUD_CONFIG.scale, hudStyle: 'vfd', elements: defaults.DEFAULT_HUD_CONFIG.elements });
    await idle();
    assert.equal(config.elements.showGauge, defaults.DEFAULT_HUD_CONFIG.elements.showGauge);
    report.checks.push('Reset cancellation and confirmed defaults preserve enabled');

    // The settings gallery demonstrates the right anchor with X capped at zero.
    await tab('audio-head').click(); await audioAlignment.selectOption('right'); await idle();
    for (const language of ['en-us', 'zh-tw', 'ja-jp']) {
      await open(language);
      const dictionary = JSON.parse(fs.readFileSync(path.join(repo, 'lang', language + '.json'), 'utf8'));
      await page.setViewportSize({ width: 320, height: 720 });
      for (const hudStyle of ['s650_hmi', 'classic_jdm', 'r34_mfd', 'stack_st8100', 'lfa_center_ring', 'vfd']) {
        await panel('gauge').locator('select').first().selectOption(hudStyle);
        await saved({ hudStyle }); await idle();
        if (language === 'en-us' && hudStyle === 'stack_st8100') {
          const threshold = panel('gauge').locator('input[type=text]:enabled').first();
          const original = await threshold.inputValue(), writes = report.saves.length;
          await threshold.fill('95'); await tab('general').click(); await tab('gauge').click();
          assert.equal(await threshold.inputValue(), '95');
          assert.equal(report.saves.length, writes, 'Changing tabs must not commit a threshold draft');
          await threshold.press('Escape'); assert.equal(await threshold.inputValue(), original);
        }
        assert.equal(await panel('gauge').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true,
          `${language} ${hudStyle} specialized settings overflow at 320px`);
      }
      const cores = await page.evaluate(() => window.hudSettingsFixtureTheme.entries);
      for (const { core } of cores) for (const mode of ['light', 'dark']) {
        await page.evaluate(({ mode, core }) => window.hudSettingsFixtureTheme.update({ mode, halfmoonCore: core }), { mode, core });
        await page.waitForFunction(({ mode, core }) => document.documentElement.dataset.bsTheme === mode && document.documentElement.dataset.bsCore === core, { mode, core });
        for (const width of [1280, 320]) {
          await page.setViewportSize({ width, height: 720 });
          for (const id of ['gauge', 'telemetry', 'general', 'audio-head']) {
            await tab(id).click();
            assert.equal(await tab(id).textContent(), dictionary[{ gauge: 'Main gauge', telemetry: 'Telemetry cards', general: 'General', 'audio-head': 'Audio Head' }[id]]);
            // Expand every telemetry card to include its controls in the layout contract.
            if (id === 'telemetry') while (await panel(id).locator('details:not([open]) > summary').count()) await panel(id).locator('details:not([open]) > summary').first().click();
            const state = await panel(id).evaluate(el => ({
              fits: el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth,
              missing: el.textContent.includes('hud.settings.'),
              controlsFit: [...el.querySelectorAll('input,select,button')].filter(node => node.getClientRects().length)
                .every(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
            }));
            assert(state.fits && state.controlsFit && !state.missing, JSON.stringify({ language, core, mode, width, id, state }));
            report.layouts.push({ language, core, mode, width, id });
            if (language === 'zh-tw' && ['default', 'swiss', 'rhine-lab'].includes(core)) {
              await panel(id).evaluate(el => { el.scrollTop = 0; });
              const name = `${core}-${mode}-${width}-${id}.png`; await page.screenshot({ path: path.join(out, name), animations: 'disabled' }); report.screenshots.push(name);
            }
          }
        }
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1920, height: 1080 }); await tab('telemetry').click();
    assert.equal(await page.getByRole('slider').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    report.checks.push('All seven cores, day/night, three locales, narrow/default/wide and reduced motion');
    report.checks.push('Six specialized gauge forms at 320px in all three locales');
    await open('zh-tw');
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const core of ['default', 'swiss', 'rhine-lab']) {
      await page.evaluate(core => window.hudSettingsFixtureTheme.update({ mode: 'light', halfmoonCore: core }), core);
      await page.waitForFunction(core => document.documentElement.dataset.bsCore === core, core);
      for (const workspace of ['live', 'tune', 'hud']) {
        const dictionary = JSON.parse(fs.readFileSync(path.join(repo, 'lang/zh-tw.json'), 'utf8'));
        await page.locator('.workspace-tabs--primary').getByRole('button', { name: dictionary[{ live: 'Live', tune: 'Tune', hud: 'HUD' }[workspace]], exact: true }).click();
        await page.locator(`[data-workspace=${workspace}] .workspace-panel-header, [data-workspace=${workspace}] .telemetry-card-shell`).first().waitFor();
        const name = `${core}-light-1280-reference-${workspace}.png`;
        await page.screenshot({ path: path.join(out, name), animations: 'disabled' }); report.screenshots.push(name);
      }
    }
    report.checks.push('Production AppShell with Live/Tune/HUD reference captures across all three design systems');
    await open('en-us');
    await require(path.join(repo, 'hud_overlay/audio_head/tests/browser/verify.cjs'))({ page, context, origin, out, report });
    assert.deepEqual(report.unexpectedRequests, []);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, layouts: report.layouts.length, screenshots: report.screenshots.length, saves: report.saves.length, errors: report.errors, out }));
  } catch (error) {
    report.errors.push(String(error));
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally { await browser?.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
