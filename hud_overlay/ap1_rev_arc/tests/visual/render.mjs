// Reproduce: node hud_overlay/ap1_rev_arc/tests/visual/render.mjs
// Optional PLAYWRIGHT_MODULE_PATH and CHROMIUM_PATH; no project dependency added.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
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
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) }); } catch (error) {
  report.errors.push(String(error));
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  server.close(); throw error;
}
const url = `http://127.0.0.1:${server.address().port}/ap1_rev_arc/index.html`;
let stamp = 100;
const sample = { speed_kmh: 188, speed_mph: 117, rpm: 7300, maxRpm: 9000, redlineRpm: 8000, gear: 4, fuel_ratio: .625, isRaceOn: 1 };
const frame = (page, data = {}, meta = {}) => page.evaluate(({ data, meta, stamp }) => window.HUDCore.handleMessage('hud:frame', { data: { ...data, timestamp_ms: stamp }, ...meta }), { data: { ...sample, ...data }, meta, stamp: stamp++ });
const inspectArcLayout = async page => page.evaluate(async () => {
  const { ARC, arcFrame } = await import('./arc-geometry.js');
  const labels = Array.from(document.querySelectorAll('#rpmTicks text'));
  const labelClearances = labels.map((node, i) => {
    const { point, normal } = arcFrame(i / (labels.length - 1));
    const b = node.getBBox();
    const corners = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]];
    const distances = corners.map(([x,y]) => (x-point.x)*normal.x + (y-point.y)*normal.y);
    return { text: node.textContent, bandGap: Math.min(...distances) - ARC.bandTop, bezelGap: ARC.faceEdge - Math.max(...distances) };
  });
  const container = document.querySelector('#ap1Cluster');
  const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height });
  const cluster = rect(container.getBoundingClientRect());
  const geometricAttributes = ['x','y','width','height','transform','d','points','viewBox','text-anchor','dominant-baseline'];
  const geometry = node => ({
    tag: node.tagName,
    attributes: Object.fromEntries(geometricAttributes.map(key => [key, node.getAttribute(key)])),
  });
  const readouts = Object.fromEntries(['speedDigits','gearValue','fuelSegments','fuelValue','rpmValue','speedUnit'].map(id => {
    const node = document.getElementById(id);
    const b = rect(node.getBoundingClientRect());
    const box = rect(node.getBBox());
    const anchor = new DOMPoint(Number(node.getAttribute('x') || 0), Number(node.getAttribute('y') || 0));
    const screenAnchor = anchor.matrixTransform(node.getScreenCTM());
    const ancestors = [];
    for (let parent = node.parentElement; parent && parent !== container; parent = parent.parentElement) {
      ancestors.push({ tag: parent.tagName, transform: parent.getAttribute('transform'), viewBox: parent.getAttribute('viewBox') });
    }
    const font = getComputedStyle(node);
    return [id, {
      inkRect: b, svgInkRect: box,
      inkNormalized: { x: (b.x-cluster.x)/cluster.width, y: (b.y-cluster.y)/cluster.height, width: b.width/cluster.width, height: b.height/cluster.height },
      anchorNormalized: { x: (screenAnchor.x-cluster.x)/cluster.width, y: (screenAnchor.y-cluster.y)/cluster.height },
      semanticGeometry: { self: geometry(node), descendants: Array.from(node.querySelectorAll('*')).map(geometry), ancestors },
      font: { family: font.fontFamily, size: font.fontSize, weight: font.fontWeight }, localCssTransform: font.transform,
    }];
  }));
  return { labelClearances, readouts, cluster, dpr: devicePixelRatio, zoom: getComputedStyle(container).zoom };

});
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
    if (width === 1280) {
      const normalLayout = await inspectArcLayout(page);
      await page.evaluate(() => window.HUDCore.handleMessage('config', { data: { scale: .7, glowIntensity: .8, elements: { showGauge: true } } }));
      await frame(page);
      const compactLayout = await inspectArcLayout(page);
      // Save both screenshots and all coordinates before any geometry assertion.
      // A failed layout check must leave enough evidence to diagnose the failure.
      await save(page, 'compact-1280x720-dpr' + dpr + '.png');
      const diagnostics = Object.fromEntries(Object.entries(normalLayout.readouts).map(([id, normal]) => {
        const compact = compactLayout.readouts[id];
        return [id, {
          inkNormalizedDelta: Object.fromEntries(['x','y','width','height'].map(key => [key, compact.inkNormalized[key] - normal.inkNormalized[key]])),
          anchorResidualDevicePixels: {
            x: (compact.anchorNormalized.x - normal.anchorNormalized.x) * compactLayout.cluster.width * compactLayout.dpr,
            y: (compact.anchorNormalized.y - normal.anchorNormalized.y) * compactLayout.cluster.height * compactLayout.dpr,
          },
        }];
      }));
      report.checks.push({ arcRevision: 'one shared normal-offset curve', dpr, normalLayout, compactLayout, diagnostics,
        invariant: 'SVG anchors, descendant geometry, font settings and local transforms stay exact; screen anchors and containment allow one device pixel for rendering quantization. Text ink metrics are diagnostic, not anchor invariants.' });
      await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
      // Collect failures so DPR2 captures still run if DPR1 has a layout issue.
      const verify = action => { try { action(); } catch (error) { report.errors.push(String(error)); } };
      for (const layout of [normalLayout, compactLayout]) {
        for (const label of layout.labelClearances) {
          verify(() => assert(label.bandGap > 0 && label.bezelGap > 0, 'RPM label must fit between band and bezel: ' + label.text));
        }
        const budget = 1 / layout.dpr;
        for (const [id, reading] of Object.entries(layout.readouts)) {
          const b = reading.inkRect, c = layout.cluster;
          verify(() => assert(b.x >= c.x - budget && b.y >= c.y - budget && b.x + b.width <= c.x + c.width + budget && b.y + b.height <= c.y + c.height + budget, 'Readout must remain contained at the requested scale: ' + id));
        }
      }
      for (const [id, normal] of Object.entries(normalLayout.readouts)) {
        verify(() => assert.deepEqual(compactLayout.readouts[id].semanticGeometry, normal.semanticGeometry, 'Compact scaling must preserve SVG anchors and local transforms: ' + id));
        verify(() => assert.deepEqual(compactLayout.readouts[id].font, normal.font, 'Compact scaling must not change authored font settings: ' + id));
        verify(() => assert.equal(compactLayout.readouts[id].localCssTransform, normal.localCssTransform, 'Compact scaling must preserve local CSS transforms: ' + id));
        const residual = diagnostics[id].anchorResidualDevicePixels;
        verify(() => assert(Math.abs(residual.x) <= 1 && Math.abs(residual.y) <= 1, 'Screen anchor must follow the container scale within one device pixel: ' + id));
      }
      await page.evaluate(() => window.HUDCore.handleMessage('config', { data: { scale: 1, glowIntensity: .8, elements: { showGauge: true } } }));
      await frame(page);
    }
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
  // Preserve the actual pre-revision browser baseline beside the new captures.
  await copyFile(path.join(root, '../docs/assets/ap1-rev-arc/metric-1280x720.png'), path.join(out, 'before-arc-revision-1280x720.png'));
  await copyFile(path.join(root, '../docs/assets/ap1-rev-arc/detail-metric.png'), path.join(out, 'before-arc-revision-detail.png'));
  const baselineEvidence = JSON.parse(await readFile(path.join(root, '../docs/assets/ap1-rev-arc/review-evidence.json'), 'utf8'));
  report.comparisonBaseline = { head: baselineEvidence.reviewed_head, sourceRun: baselineEvidence.run_id, note: 'Actual historical Chromium captures; compare with this run metric and compact captures. Current PNGs remain marked historical in docs until reviewed.' };
  assert.deepEqual(report.errors, []);
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.errors.push(String(error));
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
