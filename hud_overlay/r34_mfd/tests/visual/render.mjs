// Actual production HTML/SVG/Canvas through sandboxed Chrome; no substitute image generator.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { serve, baseConfig, rawSample } from './server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out = process.env.OUTPUT_DIR || '/tmp/hud-r34-mfd-preview'; await mkdir(out, { recursive: true });
const { server, origin } = await serve(); let browser;
const report = { runtime: 'Actual HUD in sandboxed Chrome; synthetic telemetry; not native Windows or game acceptance', checks: [], screenshots: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  for (const [width, height, dpr] of [[1280, 720, 1], [1920, 1080, 1], [1280, 720, 2]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr }); const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin + '/r34_mfd/index.html'); await page.waitForFunction(() => Boolean(window.R34Hud));
    const configure = patch => page.evaluate(config => window.HUDCore.handleMessage('config', { data: config }), { ...baseConfig, ...patch });
    const frame = patch => page.evaluate(data => { data.TimestampMS = (window.fixtureTimestamp = (window.fixtureTimestamp || 1000) + 100); window.HUDCore.handleMessage('hud:frame', { data, redlineRpm: 8000 }); window.R34Hud.render(performance.now()); }, { ...rawSample, ...patch });
    const save = async name => {
      const filename = `${name}-${width}x${height}-dpr${dpr}.png`; await page.screenshot({ path: path.join(out, filename), omitBackground: true }); report.screenshots.push(filename);
      const bounds = await page.locator('#r34Container').boundingBox(); assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
      report.checks.push({ name, viewport: [width, height], dpr, bounds });
    };
    const inspectCanvas = async id => {
      const geometry = await page.locator('#' + id).evaluate(canvas => {
        const r = canvas.getBoundingClientRect();
        return { pixelWidth: canvas.width, pixelHeight: canvas.height, width: r.width, height: r.height,
          logicalWidth: canvas.clientWidth, logicalHeight: canvas.clientHeight, dpr: devicePixelRatio };
      });
      assert(geometry.width > 0 && geometry.height > 0, id + ' must be visible for backing check');
      assert(Math.abs(geometry.pixelWidth - geometry.width * geometry.dpr) <= 1 && Math.abs(geometry.pixelHeight - geometry.height * geometry.dpr) <= 1, id + ' backing must follow physical display density');
      assert(Math.abs(geometry.width / geometry.height - geometry.logicalWidth / geometry.logicalHeight) < .01, id + ' logical aspect must survive HUD scaling');
      report.checks.push({ canvas: id, ...geometry }); return geometry;
    };
    await configure({}); await save('waiting');
    await inspectCanvas('r34History');
    for (const mode of ['single', 'twin', 'multi', 'g', 'lap']) {
      await configure({ r34MfdMode: mode });
      for (let sample = 0; sample < 80; sample++) await frame({ Boost: (1 + Math.sin(sample / 12) * .4) * 14.5038, LapNumber: mode === 'lap' ? Math.floor(sample / 20) + 3 : 3 });
      await frame({ LapNumber: mode === 'lap' ? 6 : 3 }); await save(mode);
      assert.equal(await page.locator('[data-mode]:not([hidden])').getAttribute('data-mode'), mode);
      if (mode === 'single' || mode === 'g') await inspectCanvas(mode === 'g' ? 'r34G' : 'r34History');
      if (mode === 'single' || mode === 'twin') {
        const labels = await page.locator('[data-mode="' + mode + '"] .r34-dial').evaluateAll(dials => dials.flatMap(dial => {
          const bounds = dial.querySelector('svg').getBoundingClientRect();
          const tolerance = 1 / devicePixelRatio;
          return [...dial.querySelectorAll('text')].map(text => {
            const b = text.getBoundingClientRect();
            return { text: text.textContent, contained: b.left >= bounds.left - tolerance && b.right <= bounds.right + tolerance && b.top >= bounds.top - tolerance && b.bottom <= bounds.bottom + tolerance };
          });
        }));
        assert(labels.every(label => label.contained), mode + ' gauge labels must fit their own dial viewport');
        report.checks.push({ mode, dialLabels: labels });
      }
    }
    const gMarker = async () => page.locator('#r34G').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0, xTotal = 0, yTotal = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 150 && pixels[i + 1] < 120 && pixels[i + 2] < 120 && pixels[i + 3] > 200) {
        const index = i / 4; count++; xTotal += index % canvas.width; yTotal += Math.floor(index / canvas.width);
      }
      return { visible: count > 0, x: xTotal / count / canvas.width, y: yTotal / count / canvas.height, resolution: Math.min(canvas.width, canvas.height) };
    });
    for (const mode of ['single', 'g']) {
      await configure({ r34MfdMode: mode, scale: 1 }); await frame({});
      const full = await inspectCanvas(mode === 'g' ? 'r34G' : 'r34History');
      const fullMarker = mode === 'g' ? await gMarker() : null;
      await configure({ r34MfdMode: mode, scale: .7 }); await frame({});
      const compact = await inspectCanvas(mode === 'g' ? 'r34G' : 'r34History');
      assert(compact.pixelWidth < full.pixelWidth && compact.pixelHeight < full.pixelHeight, 'Compact HUD must resize backing');
      if (mode === 'g') {
        const compactMarker = await gMarker();
        assert(fullMarker.visible && compactMarker.visible && fullMarker.x < .5 && fullMarker.y > .5, 'Positive raw X is inverted left; positive forward Z stays below');
        const quantization = 2 / Math.min(fullMarker.resolution, compactMarker.resolution);
        assert(Math.abs(compactMarker.x - fullMarker.x) <= quantization && Math.abs(compactMarker.y - fullMarker.y) <= quantization, 'Visible G marker direction and normalized placement must survive backing resize');
        report.checks.push({ gMarker: { full: fullMarker, compact: compactMarker } });
      }
    }
    if (dpr === 1 && width === 1280) {
      await configure({ r34MfdMode: 'g' }); await frame({});
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
      await page.waitForFunction(() => { const c = document.getElementById('r34G'), r = c.getBoundingClientRect(); return devicePixelRatio === 2 && Math.abs(c.width - r.width * devicePixelRatio) <= 1; });
      await inspectCanvas('r34G');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await page.waitForFunction(() => { const c = document.getElementById('r34G'), r = c.getBoundingClientRect(); return devicePixelRatio === 1 && Math.abs(c.width - r.width) <= 1; });
      await inspectCanvas('r34G');
      await save('dpr-return-to-one');
      await cdp.detach(); report.checks.push('Live DPR 1→2→1 preserves both upward and downward canvas backing changes');
    }
    await configure({ r34MfdMode: 'lap' }); await frame({ CarOrdinal: 3434, LapNumber: 0, CurrentRaceTime: 0 });
    assert.equal(await page.locator('#r34LapNumber').textContent(), '1');
    await frame({ CarOrdinal: 3434, LapNumber: 1, CurrentRaceTime: 83, LastLap: 82.5 });
    assert.equal(await page.locator('#r34LapNumber').textContent(), '2');
    assert.equal(await page.locator('#r34LapList li:first-child span:first-child').textContent(), '1');
    await save('first-completed-lap');
    await configure({ r34MfdMode: 'single', r34Lighting: 'day' }); await frame({}); await save('day');
    await configure({ r34MfdMode: 'single', effectiveUnits: { speed: 'mph', boostPressure: 'psi' } }); await frame({ Boost: -7.2519, Gear: 0 }); await save('imperial-vacuum');
    assert.equal(await page.locator('#r34Single-value').textContent(), '-7.3'); assert.equal(await page.locator('#r34Gear').textContent(), 'R');
    await configure({ r34MfdMode: 'single', effectiveUnits: { speed: 'kmh', boostPressure: 'kpa' } }); await frame({ Boost: 43.5114, CurrentEngineRpm: 12000, SpeedMetersPerSecond: 100 }); await save('over-scale-kpa');
    assert.equal(await page.locator('#r34Single-value').textContent(), '300'); assert.match(await page.locator('#r34DigitalSpeed').textContent(), /360.*OVER SCALE/);
    await configure({}); await frame({ Boost: null, CurrentEngineRpm: null, SpeedMetersPerSecond: null, Fuel: null, Gear: null }); await save('missing');
    assert.equal(await page.locator('#r34Single-value').textContent(), 'N/A');
    await frame({ IsRaceOn: 0 }); await save('paused'); assert.equal(await page.locator('#r34Status').textContent(), 'PAUSED');
    await frame({}); await page.waitForTimeout(1700); await save('stale'); assert.equal(await page.locator('#r34Single-value').textContent(), 'N/A');
    await configure({ r34ShowCluster: false, r34MfdMode: 'multi', scale: .7, useDefaultColors: false, customColor: '#70c9df' }); await frame({}); await save('compact-mfd-only-custom');
    assert.equal(await page.locator('#r34Cluster').isVisible(), false);
    await configure({}); await frame({ CarOrdinal: 999, Boost: 0, Gear: 11 }); assert.equal(await page.locator('#r34Single-peak').textContent(), '0.00'); await save('new-car-neutral');
    await page.evaluate(() => window.HUDCore.handleMessage('hud:elements', { showGauge: false })); assert.equal(await page.locator('#r34Container').isVisible(), false);
    await configure({}); await frame({}); assert.equal(await page.locator('#r34Container').isVisible(), true);
    await page.evaluate(() => window.HUDCore.handleMessage('hud:elements', { showGauge: true }));
    assert.equal(await page.locator('#r34Container').evaluate(node => getComputedStyle(node).display), 'flex');
    assert.equal(await page.locator('.r34-bezel-keys button').count(), 0);
    await configure({ r34MfdMode: 'twin' }); await frame({ CurrentEngineRpm: 6800 });
    assert.equal(await page.locator('#r34TwinR-value').textContent(), '6.8');
    await page.reload(); await page.waitForFunction(() => Boolean(window.R34Hud)); await configure({}); assert.equal(await page.locator('#r34Status').textContent(), 'WAITING');
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) { report.errors.push(String(error)); throw error; }
finally { await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n'); await browser?.close(); server.close(); }
