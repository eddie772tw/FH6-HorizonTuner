// Called by the opt-in HUD settings browser runner. Real launcher + renderer;
// only HTTP/WebSocket surroundings and audio/media samples are fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyAudioHead({ page, context, origin, out, report }) {
  const audioTab = page.getByRole('tab', { name: 'Audio Head', exact: true });
  await audioTab.click();
  const toggle = page.getByRole('checkbox', { name: 'Show Audio Head', exact: true });
  await toggle.check();
  const scale = page.getByRole('spinbutton', { name: 'Audio Head scale', exact: true });
  await scale.fill('100'); await scale.press('Enter');
  const model = page.getByRole('combobox', { name: 'Car Audio Head Unit Model', exact: true });
  const decks = await model.locator('option').evaluateAll(options => options.map(option => ({ id: Number(option.value), name: option.textContent })));
  assert.equal(decks.length, 9);
  const idle = () => page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
  await idle();
  const hud = await context.newPage();
  let socket;
  const failures = [];
  hud.on('pageerror', error => failures.push(String(error)));
  await hud.routeWebSocket(/\/ws\/overlay$/, route => { socket = route; });
  try {
    await hud.goto(origin + '/hud/index.html');
    const renderer = () => hud.frames().find(frame => frame.url().includes('/audio_head/index.html'));
    await hud.locator('#audio-head-iframe').waitFor();
    await hud.waitForFunction(() => document.querySelector('#audio-head-iframe')?.contentWindow?.HUDCore?.getCurrentConfig()?.elements?.showAudioHead === true);
    // Neutral review backdrop only; the actual SVG and Canvas keep their opacity.
    await hud.addStyleTag({ content: 'html { background: rgb(22, 27, 34) !important; }' });
    socket.send(JSON.stringify({ type: 'hud:media', data: { title: 'Night Drive', artist: 'HUD Demo', status: 'playing' } }));
    socket.send(JSON.stringify({ type: 'hud:audio', data: { sequence: 1, has_audio: true, state: 'live', vu_left: 0.62, vu_right: 0.48,
      spectrum: Array.from({ length: 32 }, (_, index) => 0.15 + 0.65 * (1 + Math.sin(index * 0.63)) / 2) } }));
    const gauge = hud.frames().find(frame => /\/vfd\/index.html/.test(frame.url()));
    assert(gauge, 'The main gauge must remain mounted alongside Audio Head');
    const initialAudio = await renderer().locator('#audioHeadContainer').boundingBox();
    await page.getByRole('tab', { name: 'Main gauge', exact: true }).click();
    await page.getByRole('slider', { name: 'Main gauge scale', exact: true }).press('End'); await idle();
    await renderer().waitForFunction(() => HUDCore.getCurrentConfig().scale === 2);
    const afterGauge = await renderer().locator('#audioHeadContainer').boundingBox();
    assert(Math.abs(afterGauge.width - initialAudio.width) < 1, 'Main gauge scale must not resize Audio Head');
    const gaugeScale = await gauge.evaluate(() => window._currentHudScale);
    await audioTab.click(); await scale.fill('150'); await scale.press('Enter'); await idle();
    await renderer().waitForFunction(() => HUDCore.getCurrentConfig().audioHeadScale === 1.5);
    const enlarged = await renderer().locator('#audioHeadContainer').boundingBox();
    assert(Math.abs(enlarged.width / initialAudio.width - 1.5) < 0.01);
    assert.equal(await gauge.evaluate(() => window._currentHudScale), gaugeScale);
    await scale.fill('100'); await scale.press('Enter'); await idle();

    for (const edge of ['left', 'right', 'top', 'bottom']) {
      await page.getByRole('combobox', { name: 'Audio Head Alignment', exact: true }).selectOption(edge); await idle();
      await renderer().waitForFunction(edge => HUDCore.getCurrentConfig().audioHeadEdge === edge, edge);
      const rect = await renderer().locator('#audioHeadContainer').boundingBox();
      const viewport = hud.viewportSize();
      const distance = edge === 'left' ? rect.x : edge === 'right' ? viewport.width - rect.x - rect.width
        : edge === 'top' ? rect.y : viewport.height - rect.y - rect.height;
      assert(Math.abs(distance) < 1, `${edge} alignment should touch the viewport edge`);
      const positive = edge === 'left' || edge === 'top';
      const axis = edge === 'left' || edge === 'right' ? 'X' : 'Y';
      const slider = page.getByRole('slider', { name: `Audio Head ${axis}-Offset`, exact: true });
      await slider.press(positive ? 'ArrowLeft' : 'ArrowRight');
      assert.equal(await slider.inputValue(), '0', 'Outward keyboard input must stop at zero');
      await slider.press(positive ? 'ArrowRight' : 'ArrowLeft'); await idle();
      await renderer().waitForFunction(() => HUDCore.getCurrentConfig().audioHeadOffset === 1);
      const inward = await renderer().locator('#audioHeadContainer').boundingBox();
      const inwardDistance = edge === 'left' ? inward.x : edge === 'right' ? viewport.width - inward.x - inward.width
        : edge === 'top' ? inward.y : viewport.height - inward.y - inward.height;
      assert(inwardDistance > distance, `${edge} slider must move the renderer inward`);
      await slider.press(positive ? 'Home' : 'End'); await idle();
      await renderer().waitForFunction(() => HUDCore.getCurrentConfig().audioHeadOffset === 0);
    }
    await page.getByRole('combobox', { name: 'Audio Head Alignment', exact: true }).selectOption('left'); await idle();
    // Keep the gauge mounted but hide it and telemetry for unobstructed deck captures.
    await page.getByRole('tab', { name: 'Main gauge', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show main gauge', exact: true }).uncheck();
    await page.getByRole('tab', { name: 'Telemetry cards', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Toggle Master Telemetry HUD Switch', exact: true }).uncheck();
    await audioTab.click(); await idle();
    report.audioHeadDecks = [];
    for (const deck of decks) {
      await model.selectOption(String(deck.id)); await idle();
      await renderer().waitForFunction(id => HUDCore.getCurrentConfig().audioHeadDeck === id
        && window.currentMode === id && document.querySelector('#radioFace').complete
        && document.querySelector('#radioFace').naturalWidth > 0, deck.id);
      await renderer().evaluate(() => document.fonts.ready);
      await hud.waitForTimeout(100); // Let actual VU dynamics respond before capturing.
      const filename = `audio-head-${String(deck.id).padStart(2, '0')}.png`;
      await renderer().locator('#audioHeadContainer').screenshot({ path: path.join(out, filename), animations: 'disabled' });
      const rect = await renderer().locator('#audioHeadContainer').boundingBox();
      report.audioHeadDecks.push({ ...deck, filename, width: rect.width, height: rect.height,
        face: await renderer().locator('#radioFace').getAttribute('src') });
      report.screenshots.push(filename);
    }
    await toggle.uncheck(); await idle(); await hud.locator('#audio-head-iframe').waitFor({ state: 'detached' });
    assert.equal(gauge.isDetached(), false);
    await toggle.check(); await idle();
    await hud.waitForFunction(() => document.querySelector('#audio-head-iframe')?.contentWindow?.HUDCore?.getCurrentConfig()?.audioHeadDeck === 8);
    assert.equal(gauge.isDetached(), false);
    report.checks.push('Real launcher: independent sizes, four edges with inward-only sliders, nine live deck selections and audio-only unmount/remount');
    assert.deepEqual(failures, []);
  } finally { await hud.close(); }
};
