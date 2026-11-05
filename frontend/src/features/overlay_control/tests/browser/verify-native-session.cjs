// Native bridge fixture around the real AppShell, runtime and HTTP persistence.
// This validates startup/reload state transitions, not a physical Tauri window.
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyNativeSession({ browser, origin, out, report }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.routeWebSocket(/\/ws\/(telemetry|overlay)$/, () => {});
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  let visible = false, failToggle = false;
  const commands = [];
  await context.exposeBinding('fixtureNativeInvoke', async (_source, command, args) => {
    commands.push(command);
    if (command === 'get_hud_window_visible') return visible;
    if (command === 'toggle_hud_window') {
      if (failToggle) { failToggle = false; throw new Error('Fixture native launch failure'); }
      visible = args.visible; return;
    }
    if (command === 'get_available_monitors') return [];
    if (command === 'set_hud_click_through') return;
    if (command === 'plugin:updater|check') return null;
    throw new Error('Unexpected native command: ' + command);
  });
  await context.addInitScript(() => {
    localStorage.setItem('fh6-data-out-guide/v1', 'skipped');
    window.__TAURI__ = { core: { invoke: (...args) => window.fixtureNativeInvoke(...args) } };
    window.__TAURI_INTERNALS__ = { invoke: window.__TAURI__.core.invoke };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  const idle = () => page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
  const config = () => page.evaluate(async () => (await fetch('/api/overlay/config')).json());
  const openHud = async () => {
    await page.locator('.app-header .popover .btn-close').click();
    await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click(); await idle();
  };
  try {
    // Mimic a previous process exiting while HUD was enabled. Keep every other setting.
    const old = await (await context.request.get(origin + '/api/overlay/config')).json();
    await context.request.post(origin + '/api/overlay/config', { data: { ...old, enabled: true, pauseTelemetryViewWhenActive: true } });
    await page.goto(origin + '/src/features/overlay_control/tests/browser/index.html?shell&language=en-us');
    await openHud();
    assert.equal((await config()).enabled, false);
    assert.equal((await config()).audioHeadScale, old.audioHeadScale);
    assert.deepEqual((await config()).gaugeValueSources, old.gaugeValueSources);
    const action = page.getByRole('button', { name: 'Launch HUD Overlay', exact: true });
    assert.equal(await action.isEnabled(), true);
    failToggle = true; await action.click();
    await page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'attention');
    assert.equal((await config()).enabled, false); assert.equal(visible, false);
    await action.click(); await idle();
    assert.equal((await config()).enabled, true); assert.equal(visible, true);
    // A React/WebView page reload is not a new native session: keep the real open window.
    await page.reload(); await openHud();
    assert.equal((await config()).enabled, true);
    assert.equal(await page.getByRole('button', { name: 'Close HUD Overlay', exact: true }).isEnabled(), true);
    // A fresh application starts with its pre-created overlay hidden; no unload save is required.
    visible = false; await page.reload(); await openHud();
    assert.equal((await config()).enabled, false);
    assert.equal(await action.isEnabled(), true);
    for (const core of ['default', 'swiss', 'rhine-lab']) for (const mode of ['light', 'dark']) {
      await page.evaluate(({ core, mode }) => window.hudSettingsFixtureTheme.update({ halfmoonCore: core, mode }), { core, mode });
      await page.waitForFunction(({ core, mode }) => document.documentElement.dataset.bsCore === core && document.documentElement.dataset.bsTheme === mode, { core, mode });
      const file = `native-restart-${core}-${mode}.png`;
      await page.screenshot({ path: path.join(out, file), animations: 'disabled' }); report.screenshots.push(file);
    }
    await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'Live', exact: true }).click();
    await page.waitForFunction(() => window.__IS_HUD_PAUSED__ === false);
    const file = 'native-restart-live-unpaused.png';
    await page.screenshot({ path: path.join(out, file), animations: 'disabled' }); report.screenshots.push(file);
    assert(commands.includes('get_hud_window_visible'));
    report.checks.push('Native bridge fixture: saved enabled state reconciles after process restart, visible HUD survives page reload, failed launch stays disabled and Live remains unpaused after restart');
  } finally { await context.close(); }
};
