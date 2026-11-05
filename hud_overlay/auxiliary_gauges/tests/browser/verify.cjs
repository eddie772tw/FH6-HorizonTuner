// Opt-in real settings + launcher integration, with isolated synthetic telemetry.
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyAuxiliaryGauges({ page, context, origin, out, report }) {
  const tab = name => page.getByRole('tab', { name, exact: true });
  const idle = () => page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
  const config = () => page.evaluate(async () => (await fetch('/api/overlay/config')).json());
  await tab('Main gauge').click();
  const mainScale = page.getByRole('slider', { name: 'Main gauge scale', exact: true });
  await mainScale.press('Home');
  for (let step = 0; step < 10; step++) await mainScale.press('ArrowRight');
  await idle(); assert.equal((await config()).scale, 1);
  await tab('Auxiliary Gauges').click();
  const panel = page.getByRole('tabpanel', { name: 'Auxiliary Gauges', exact: true });
  const toggle = panel.getByRole('checkbox', { name: 'Show Auxiliary Gauges', exact: true });
  assert.equal(await toggle.isChecked(), false);
  const edge = panel.getByRole('combobox', { name: 'Auxiliary Gauges Alignment', exact: true });
  const arrangement = panel.getByRole('combobox', { name: 'Gauge Arrangement', exact: true });
  const offset = panel.getByRole('spinbutton', { name: 'Auxiliary Gauges Edge Offset', exact: true });
  const boost = panel.getByRole('group', { name: 'Boost', exact: true });
  const label = boost.getByRole('textbox', { name: 'Value Description', exact: true });
  assert.equal(await offset.isEnabled(), true);
  const saves = report.saves.length;
  await label.fill('Boost draft'); await tab('Audio Head').click(); await tab('Auxiliary Gauges').click();
  assert.equal(await label.inputValue(), 'Boost draft'); assert.equal(report.saves.length, saves);
  await label.press('Enter'); await idle();
  await boost.getByRole('combobox', { name: 'Telemetry Field', exact: true }).selectOption('boost_bar');
  await boost.getByRole('combobox', { name: 'Source Unit', exact: true }).selectOption('bar'); await idle();
  assert.deepEqual((await config()).gaugeValueSources.boost, { field: 'boost_bar', unit: 'bar', label: 'Boost draft' });
  const beforeOffset = report.saves.length;
  await offset.fill('32'); await tab('General').click(); await tab('Auxiliary Gauges').click();
  assert.equal(await offset.inputValue(), '32'); assert.equal(report.saves.length, beforeOffset);
  await offset.press('Enter'); await idle(); assert.equal((await config()).auxGaugeOffset, 32);
  await offset.fill('0'); await offset.press('Enter');
  await arrangement.selectOption('vertical');
  await panel.getByRole('combobox', { name: 'Maximum Gauges Per Column', exact: true }).selectOption('2');
  await idle();
  assert.equal((await config()).elements.showAudioHead, true);
  await toggle.check(); await idle();
  report.checks.push('Auxiliary fifth tab: hidden settings, retained text/numeric drafts, partial source edits, layout and cross-tab persistence');

  const hud = await context.newPage();
  const errors = [];
  hud.on('pageerror', error => errors.push(String(error)));
  await hud.routeWebSocket(/\/ws\/overlay$/, () => {});
  try {
    await hud.goto(origin + '/hud/index.html');
    const renderer = () => hud.frames().find(frame => frame.url().includes('/auxiliary_gauges/index.html'));
    await hud.locator('#auxiliary-gauges-iframe').waitFor();
    await hud.waitForFunction(() => document.querySelector('#auxiliary-gauges-iframe')?.contentWindow?.HUDCore?.getCurrentConfig()?.elements?.showAuxiliaryGauges === true);
    const main = hud.frames().find(frame => /\/vfd\/index.html/.test(frame.url()));
    const audio = hud.frames().find(frame => /\/audio_head\/index.html/.test(frame.url()));
    assert(main && audio, 'Auxiliary gauges must coexist with both existing elements');
    await toggle.uncheck(); await idle(); await hud.locator('#auxiliary-gauges-iframe').waitFor({ state: 'detached' });
    assert.equal(main.isDetached(), false); assert.equal(audio.isDetached(), false);
    await toggle.check(); await idle(); await hud.locator('#auxiliary-gauges-iframe').waitFor();
    await hud.waitForLoadState('networkidle');
    await hud.addStyleTag({ content: 'html { background: rgb(22, 27, 34) !important; }' });
    const faces = panel.getByRole('group', { name: 'Visible Gauge Faces', exact: true }).getByRole('checkbox');
    const allNames = await faces.evaluateAll(inputs => inputs.map(input => input.parentElement.textContent.trim()));
    assert.equal(allNames.length, 5);
    const ids = ['aem', 'greddy', 'blitz', 'defi', 'speedhut'];
    const selectFaces = async selected => {
      for (let index = 0; index < ids.length; index++) await faces.nth(index).uncheck();
      for (const id of selected) await faces.nth(ids.indexOf(id)).check();
      await idle();
      await hud.waitForFunction(selected => JSON.stringify(document.querySelector('#auxiliary-gauges-iframe')?.contentWindow?.HUDCore?.getCurrentConfig()?.auxGaugeFaces) === JSON.stringify(selected), selected);
    };
    // Single face keeps all edge-alignment cases within the viewport.
    await selectFaces(['aem']);
    for (const alignment of ['left', 'right', 'top', 'bottom']) {
      await edge.selectOption(alignment); await idle();
      await renderer().waitForFunction(value => HUDCore.getCurrentConfig().auxGaugeEdge === value, alignment);
      const rect = await renderer().locator('#auxContainer').boundingBox(), viewport = hud.viewportSize();
      const distance = alignment === 'left' ? rect.x : alignment === 'right' ? viewport.width - rect.x - rect.width
        : alignment === 'top' ? rect.y : viewport.height - rect.y - rect.height;
      assert(Math.abs(distance) < 1, `${alignment} alignment should touch viewport edge`);
    }
    await edge.selectOption('right'); await arrangement.selectOption('horizontal'); await idle();
    // Fixed custom oil source avoids capturing different points of the simulated damping curve.
    const oil = panel.getByRole('group', { name: 'Oil Pressure', exact: true });
    await oil.getByRole('combobox', { name: 'Telemetry Field', exact: true }).selectOption('power_kw');
    await oil.getByRole('combobox', { name: 'Source Unit', exact: true }).selectOption('native'); await idle();
    const sample = { is_race_on: true, rpm: 4000, maxRpm: 8000, throttle: 0.5, power_kw: 40,
      boost_bar: 1, tire_temp_f: [194, 194, 194, 194], speed_kmh: 80, gear: 3 };
    const send = () => hud.evaluate(data => window.dispatchEvent(new CustomEvent('hud:frame', { detail: { data } })), sample);
    await renderer().evaluate(() => { window.fixtureGaugeValues = null;
      addEventListener('message', event => { if (event.data.type === 'hud:frame') window.fixtureGaugeValues = event.data.data.gaugeValues; }); });
    await send();
    await renderer().waitForFunction(() => window.fixtureGaugeValues?.oilPressure === 40);
    const values = await renderer().evaluate(() => window.fixtureGaugeValues);
    assert(Math.abs(values.boost - 14.5038) < 0.001);
    assert.equal(values.oilTemperature, 90); assert.equal(values.waterTemperature, 90);
    report.auxiliaryGaugeValues = values;
    // Main/telemetry are already hidden by the Audio Head checks. Hide audio for uncluttered crops.
    await tab('Audio Head').click(); await page.getByRole('checkbox', { name: 'Show Audio Head', exact: true }).uncheck(); await idle();
    await tab('Auxiliary Gauges').click();
    report.auxiliaryFaces = [];
    for (let index = 0; index < ids.length; index++) {
      await selectFaces([ids[index]]); await send();
      await renderer().locator('#auxCanvas').getAttribute('aria-label').then(label => assert(label.startsWith(ids[index] + ':')));
      const file = `auxiliary-${ids[index]}.png`;
      await renderer().locator('#auxContainer').screenshot({ path: path.join(out, file), animations: 'disabled' });
      report.screenshots.push(file); report.auxiliaryFaces.push({ id: ids[index], name: allNames[index], file });
    }
    await selectFaces(ids);
    const horizontal = await renderer().locator('#auxContainer').boundingBox();
    await arrangement.selectOption('vertical'); await idle();
    await renderer().waitForFunction(() => HUDCore.getCurrentConfig().auxGaugeOrientation === 'vertical');
    const vertical = await renderer().locator('#auxContainer').boundingBox();
    assert(vertical.width > horizontal.width && vertical.height < horizontal.height, 'Per-column layout must change the real grid');
    const grouped = 'auxiliary-five-vertical.png';
    await send(); await renderer().locator('#auxContainer').screenshot({ path: path.join(out, grouped), animations: 'disabled' });
    report.screenshots.push(grouped);
    const sourceRegion = panel.getByRole('region', { name: 'Shared Gauge Value Sources', exact: true });
    await sourceRegion.scrollIntoViewIfNeeded();
    const sourceScreenshot = 'auxiliary-shared-sources.png'; await page.screenshot({ path: path.join(out, sourceScreenshot), animations: 'disabled' }); report.screenshots.push(sourceScreenshot);
    await page.reload();
    await page.locator('.app-header .popover .btn-close').click();
    await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click(); await idle();
    assert.equal(await tab('Main gauge').getAttribute('aria-selected'), 'true');
    await tab('Auxiliary Gauges').click(); assert.equal(await toggle.isChecked(), true);
    assert.deepEqual((await config()).auxGaugeFaces, ids);
    assert.deepEqual(errors, []);
    report.checks.push('Real auxiliary launcher: independent lifecycle, four edges, shared telemetry conversions, five original faces, row/column layout and reload');
  } finally { await hud.close(); }
};
