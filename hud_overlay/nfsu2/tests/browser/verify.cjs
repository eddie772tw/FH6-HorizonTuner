// Opt-in actual AppShell and launcher checks; telemetry and HTTP remain fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function verifyNfsu2({ page, context, origin, out, report, open }) {
  const idle = () => page.waitForFunction(() => document.querySelector('.hud-status')?.dataset.state === 'synced');
  const settings = () => page.evaluate(async () => (await fetch('/api/overlay/config')).json());
  report.nfsu2Layouts = [];
  for (const language of ['en-us', 'zh-tw', 'ja-jp']) {
    await open(language);
    const dictionary = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../lang', language + '.json'), 'utf8'));
    const panel = page.getByRole('tabpanel').first();
    await panel.locator('select').first().selectOption('nfsu2'); await idle();
    const face = page.getByRole('combobox', { name: dictionary['NFSU2 Custom Faceplate'] + ':', exact: true });
    assert.equal(await face.locator('option').count(), 11);
    await page.getByRole('checkbox', { name: dictionary['Show main gauge'], exact: true }).uncheck(); await idle();
    assert.equal(await face.isEnabled(), true);
    await face.selectOption('10'); await idle(); assert.equal((await settings()).nfsu2Face, 10);
    const writes = report.saves.length;
    await page.getByRole('tab').nth(2).click(); await page.getByRole('tab').first().click();
    assert.equal(report.saves.length, writes); assert.equal(await face.inputValue(), '10');
    await face.selectOption('3'); await idle();
    const cores = await page.evaluate(() => window.hudSettingsFixtureTheme.entries);
    for (const { core } of cores) for (const mode of ['light', 'dark']) for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 720 });
      await page.evaluate(({ core, mode }) => window.hudSettingsFixtureTheme.update({ halfmoonCore: core, mode }), { core, mode });
      await page.waitForFunction(({ core, mode }) => document.documentElement.dataset.bsCore === core && document.documentElement.dataset.bsTheme === mode, { core, mode });
      await face.scrollIntoViewIfNeeded();
      if (width === 1280) await panel.evaluate(el => { el.scrollTop = 0; });
      assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
      report.nfsu2Layouts.push({ language, core, mode, width });
      if ((language === 'zh-tw' && ['default', 'swiss', 'rhine-lab'].includes(core) && width === 1280)
        || (core === 'default' && mode === 'dark' && width === 320)) {
        const file = `nfsu2-settings-${language}-${core}-${mode}-${width}.png`;
        await page.screenshot({ path: path.join(out, file), animations: 'disabled' }); report.screenshots.push(file);
      }
    }
  }
  await open(); await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('checkbox', { name: 'Show main gauge', exact: true }).check(); await idle();
  const face = page.getByRole('combobox', { name: 'NFSU2 Custom Faceplate:', exact: true });
  const options = await face.locator('option').evaluateAll(nodes => nodes.map(node => ({ id: node.value, name: node.textContent })));
  await page.getByRole('tab', { name: 'Auxiliary Gauges', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show Auxiliary Gauges', exact: true }).uncheck(); await idle();
  await page.getByRole('tab', { name: 'Main gauge', exact: true }).click();
  const hud = await context.newPage();
  hud.on('pageerror', error => report.errors.push(String(error)));
  await hud.routeWebSocket(/\/ws\/overlay$/, () => {});
  try {
    await hud.goto(origin + '/hud/index.html'); await hud.waitForLoadState('networkidle');
    await hud.addStyleTag({ content: 'html { background: rgb(22,27,34) !important; }' });
    const frame = hud.frames().find(candidate => candidate.url().includes('/nfsu2/index.html'));
    assert(frame, 'The actual launcher must mount NFSU2');
    // Let the existing 1200ms native-style startup sweep finish before sampling.
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
    report.nfsu2Faces = [];
    for (const option of options) {
      await face.selectOption(option.id); await idle();
      await frame.waitForFunction(value => HUDCore.getCurrentConfig().nfsu2Face === Number(value), option.id);
      await hud.evaluate(() => dispatchEvent(new CustomEvent('hud:frame', { detail: { data: {
        is_race_on: true, rpm: 4200, maxRpm: 8000, speed_kmh: 100, gear: 3, boost_bar: 0.5, throttle: 0.5,
      } } })));
      await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = `nfsu2-face-${option.id}.png`;
      await frame.locator('#nfsu2Container').screenshot({ path: path.join(out, file), animations: 'disabled' });
      report.screenshots.push(file); report.nfsu2Faces.push({ ...option, file });
    }
    await page.reload(); await page.locator('.app-header .popover .btn-close').click();
    await page.locator('.workspace-tabs--primary').getByRole('button', { name: 'HUD', exact: true }).click(); await idle();
    assert.equal(await face.inputValue(), options.at(-1).id);
    report.checks.push('NFSU2 selector in Main gauge: all 11 choices, hidden configuration, tab changes without saves, persistence, 84 theme/language/size layouts and actual launcher captures');
  } finally { await hud.close(); }
};
