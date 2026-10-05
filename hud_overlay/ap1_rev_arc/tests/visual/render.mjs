// Reproduce: node hud_overlay/ap1_rev_arc/tests/visual/render.mjs
// Optional PLAYWRIGHT_MODULE_PATH and CHROMIUM_PATH; no project dependency added.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const out = process.env.OUTPUT_DIR || process.env.AP1_VISUAL_OUTPUT || path.join(root, '../docs/assets/ap1-rev-arc');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.otf': 'font/otf' };
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const report = { runtime: 'Chromium fixture, not Windows native/game acceptance', screenshots: [], checks: [], errors: [] };
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, chromiumSandbox: true }); } catch (error) {
  report.errors.push(String(error));
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  server.close(); throw error;
}
const url = `http://127.0.0.1:${server.address().port}/ap1_rev_arc/index.html`;
let stamp = 100;
const sample = { speed_kmh: 188, speed_mph: 117, rpm: 7300, maxRpm: 9000, redlineRpm: 8000, gear: 4, fuel_ratio: .625, isRaceOn: 1 };
const frame = (page, data = {}, meta = {}) => page.evaluate(({ data, meta, stamp }) => window.HUDCore.handleMessage('hud:frame', { data: { ...data, timestamp_ms: stamp }, ...meta }), { data: { ...sample, ...data }, meta, stamp: stamp++ });
const save = async (page, name) => {
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
  report.screenshots.push(name);
};
try {
  for (const [width, height, dpr] of [[1280, 720, 1], [1920, 1080, 1], [2560, 1440, 1], [1280, 720, 2]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.HUDCore?.getActiveStyle()));
    await page.evaluate(() => window.HUDCore.handleMessage('config', { data: { scale: 1, elements: { showGauge: true }, glowIntensity: .8 } }));
    await frame(page);
    assert.equal(await page.locator('#ap1Cluster').getAttribute('data-speed'), '188');
    const bounds = await page.locator('#ap1Cluster').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await save(page, `metric-${width}x${height}-dpr${dpr}.png`);
    report.checks.push({ viewport: [width, height], dpr, bounds, metric: '188 km/h' });
    if (width === 1280 && dpr === 1) {
      await frame(page, {}, { isMetric: false });
      assert.equal(await page.locator('#ap1Cluster').getAttribute('data-speed'), '117');
      await save(page, 'imperial.png');
      await frame(page, { gear: 0, speed_kmh: 24, rpm: 3400 });
      assert.equal(await page.locator('#gearValue').textContent(), 'R');
      await save(page, 'reverse.png');
      await frame(page, { gear: 11, speed_kmh: 0, rpm: 950 });
      assert.equal(await page.locator('#gearValue').textContent(), 'N');
      await save(page, 'neutral.png');
      await frame(page, { rpm: 8500, fuel_ratio: .07 });
      assert.equal(await page.locator('#shiftLamp').textContent(), 'SHIFT');
      await save(page, 'redline.png');
      await frame(page, { speed_kmh: null, rpm: null, gear: null, fuel_ratio: null });
      assert.equal(await page.locator('#signalStatus').textContent(), 'PARTIAL DATA');
      await save(page, 'missing.png');
      await frame(page, { success: false });
      assert.equal(await page.locator('#signalStatus').textContent(), 'DATA ERROR');
      await save(page, 'data-error.png');
      await frame(page, { isRaceOn: 0 });
      assert.equal(await page.locator('#signalStatus').textContent(), 'SESSION PAUSED');
      await save(page, 'paused.png');
      await frame(page, { rpm: 4700, maxRpm: 6000, redlineRpm: 5000 });
      await save(page, 'adaptive-6000rpm.png');
      await frame(page);
      await page.evaluate(() => {
        const packet = { data: { timestamp_ms: 999, speed_kmh: 188, rpm: 7000, maxRpm: 9000, gear: 4 } };
        window.HUDCore.handleMessage('hud:frame', packet);
        window.fixtureReplay = setInterval(() => window.HUDCore.handleMessage('hud:frame', packet), 30);
      });
      await page.waitForTimeout(1800);
      assert.equal(await page.locator('#signalStatus').textContent(), 'SIGNAL LOST');
      await save(page, 'signal-lost.png');
      await page.evaluate(() => clearInterval(window.fixtureReplay));
      await frame(page);
      assert.equal(await page.locator('#ap1Cluster').getAttribute('data-status'), 'LIVE');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await frame(page);
      await save(page, 'resize-1920x1080.png');
      await page.evaluate(() => window.HUDCore.handleMessage('config', { data: { scale: .8, customColor: '#72d8ee', useDefaultColors: false, elements: { showGauge: false } } }));
      assert.equal(await page.locator('#ap1Cluster').isVisible(), false);
      await page.evaluate(() => window.HUDCore.handleMessage('hud:elements', { showGauge: true }));
      await frame(page);
      await save(page, 'custom-color.png');
      // Match the real parent postMessage destroy path, including style cleanup.
      await page.evaluate(() => window.postMessage({ type: 'hud:destroy' }, '*'));
      await page.waitForFunction(() => document.body.children.length === 0);
      await page.waitForTimeout(300);
      report.checks.push('imperial, reverse, neutral, redline, missing, error, paused, 6000 RPM scale, frozen-timestamp disconnect, reconnect, resize, visibility, custom color, destroy');
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.errors.push(String(error));
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
