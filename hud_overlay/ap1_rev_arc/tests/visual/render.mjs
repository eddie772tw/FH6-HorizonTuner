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
const { inspectLabels, assertLabels } = require('./label-checks.cjs');
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
const sample = { speed_kmh: 188, speed_mph: 117, rpm: 7300, maxRpm: 9000, redlineRpm: 8000, gear: 4, Boost: 17.40456, isRaceOn: 1 };
const frame = (page, data = {}, meta = {}) => page.evaluate(({ data, meta, stamp }) => window.HUDCore.handleMessage('hud:frame', { data: { ...data, timestamp_ms: stamp }, ...meta }), { data: { ...sample, ...data }, meta, stamp: stamp++ });
const boostPaint = async page => page.evaluate(() => {
  const selectors = { bar: '#boostSegments .is-lit', value: '#boostValue', tick: '#boostTicks text', marker: '#boostTicks path' };
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [key, null];
    const style = getComputedStyle(node);
    return [key, { fill: style.fill, stroke: style.stroke, color: style.color, opacity: style.opacity, fillOpacity: style.fillOpacity, filter: style.filter, textShadow: style.textShadow }];
  }));
});
const inspectArcLayout = async page => page.evaluate(async () => {
  const { ARC, arcFrame } = await import('./arc-geometry.js');
  const labels = Array.from(document.querySelectorAll('#rpmTicks text'));
  const labelClearances = labels.map(node => {
    const { point, normal } = arcFrame(Number(node.dataset.ratio));
    const b = node.getBBox();
    const corners = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]];
    const distances = corners.map(([x,y]) => (x-point.x)*normal.x + (y-point.y)*normal.y);
    return { text: node.textContent, ratio: Number(node.dataset.ratio), bandGap: -Math.max(...distances), side: 'inward/below strip' };
  });
  const container = document.querySelector('#ap1Cluster');
  const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height });
  const cluster = rect(container.getBoundingClientRect());
  const geometricAttributes = ['x','y','width','height','transform','d','points','viewBox','text-anchor','dominant-baseline'];
  const geometry = node => ({
    tag: node.tagName,
    attributes: Object.fromEntries(geometricAttributes.map(key => [key, node.getAttribute(key)])),
  });
  const readouts = Object.fromEntries(['speedDigits','gearValue','boostSegments','boostValue','boostTicks','boostModeLabel','vacModeLabel','speedUnit','speedUnitMph'].map(id => {
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
const inspectRpm = async page => page.evaluate(async () => {
  const { ARC, arcFrame } = await import('./arc-geometry.js');
  const rect = node => { const b = node.getBoundingClientRect(); return { x:b.x, y:b.y, width:b.width, height:b.height }; };
  const overlap = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  const labels = [...document.querySelectorAll('#rpmTicks text')];
  const marks = [...document.querySelectorAll('#rpmTicks path')];
  const protectedNodes = [...document.querySelectorAll('#speedDigits, #speedUnit, #speedUnitMph, #gearValue, #vacModeLabel, #boostModeLabel, #boostSegments, #boostValue, .ap1-unit')];
  const collisions = [];
  for (const label of labels) {
    for (const other of [...protectedNodes, ...marks, ...labels.filter(n => n !== label)]) {
      if (overlap(rect(label),rect(other))) collisions.push({label:label.textContent,other:other.id || other.dataset.rpm || other.textContent});
    }
  }
  const cells = [...document.querySelectorAll('#rpmSegments polygon')];
  const points = cells.map(node => Array.from({length:node.points.numberOfItems},(_,i)=>node.points.getItem(i)).map(p => new DOMPoint(p.x,p.y).matrixTransform(node.getScreenCTM())));
  const length = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)*devicePixelRatio;
  const widths = points.flatMap(p => [length(p[0],p[1]),length(p[3],p[2])]);
  const gaps = points.slice(1).flatMap((p,i) => [length(points[i][1],p[0]),length(points[i][2],p[3])]);
  const markBelow = marks.every(node => {
    const rpm = Number(node.dataset.rpm), last = Number(marks.at(-1).dataset.rpm);
    const {point,normal} = arcFrame(rpm/last);
    return [node.getPointAtLength(0),node.getPointAtLength(node.getTotalLength())].every(p => (p.x-point.x)*normal.x+(p.y-point.y)*normal.y < 0);
  });
  return { cells:cells.length, lit:cells.filter(n => n.classList.contains('is-lit')).length, hotLit:cells.filter(n => n.classList.contains('is-lit') && n.classList.contains('is-hot')).length,
    labels:labels.map(n => ({text:n.textContent,rpm:Number(n.dataset.rpm),ratio:Number(n.dataset.ratio)})),
    graduations:marks.map(n => ({rpm:Number(n.dataset.rpm),major:n.dataset.major==='true'})),
    minimumCellWidthDevicePixels:Math.min(...widths), minimumCellGapDevicePixels:Math.min(...gaps), collisions, markBelow,
    majorTickLength:marks.find(n=>n.dataset.major==='true')?.getTotalLength() ?? 0,
    minorTickLength:marks.find(n=>n.dataset.major==='false')?.getTotalLength() ?? 0,
    shift:document.querySelector('#shiftLamp').textContent,
  };
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
    assert.equal(await page.locator('#boostValue').textContent(), '1.20 bar');
    assert.equal(await page.locator('.ap1-signature, #rpmValue, #fuelValue').count(), 0);
    assert.equal(await page.locator('body').innerText().then(text => text.includes('AP1 / REV ARC')), false);
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
          verify(() => assert(label.bandGap > 0, 'RPM numeral ink must remain below the strip: ' + label.text));
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
      for (const scale of [1, .7]) {
        await page.evaluate(scale => window.HUDCore.handleMessage('config', { data: { scale, glowIntensity: .8, elements: { showGauge: true } } }), scale);
        const states = [
          { name: 'metric-boost', unit: 'kmh', mode: 'boost', data: { Boost: 7.2519 } },
          { name: 'imperial-boost', unit: 'mph', mode: 'boost', data: { Boost: 7.2519 } },
          { name: 'metric-vac', unit: 'kmh', mode: 'vacuum', data: { Boost: -7.2519 } },
          { name: 'imperial-vac', unit: 'mph', mode: 'vacuum', data: { Boost: -7.2519 } },
          { name: 'zero', unit: 'kmh', mode: 'neutral', data: { Boost: 0 } },
          { name: 'missing', unit: 'mph', mode: 'unavailable', data: { Boost: null, speed_kmh: null, speed_mph: null } },
        ];
        let anchors;
        for (const scenario of states) {
          await frame(page, scenario.data, { isMetric: scenario.unit === 'kmh' });
          const labels = await page.evaluate(inspectLabels);
          const name = `labels-${scenario.name}-${scale === 1 ? 'default' : 'compact'}-dpr${dpr}`;
          await save(page, name + '.png');
          report.checks.push({ labelScenario: name, ...labels });
          assertLabels(labels, { unit: scenario.unit, boostMode: scenario.mode });
          const currentAnchors = Object.fromEntries(Object.entries(labels.labels).map(([id, label]) => [id, label.anchor]));
          if (anchors) assert.deepEqual(currentAnchors, anchors, 'Unit/mode changes must not move fixed legends');
          anchors = currentAnchors;
          if (scenario.name === 'missing') assert.equal(labels.speed, '---');
        }
        await page.evaluate(() => {
          const packet = { data: { timestamp_ms: 777, speed_kmh: 100, speed_mph: 62, rpm: 7000, maxRpm: 9000, gear: 4, Boost: -7.2519 }, isMetric: false };
          window.HUDCore.handleMessage('hud:frame', packet);
          window.fixtureLabelReplay = setInterval(() => window.HUDCore.handleMessage('hud:frame', packet), 30);
        });
        await page.waitForTimeout(1800);
        const stale = await page.evaluate(inspectLabels);
        const staleName = `labels-stale-${scale === 1 ? 'default' : 'compact'}-dpr${dpr}`;
        await save(page, staleName + '.png');
        report.checks.push({ labelScenario: staleName, ...stale });
        assertLabels(stale, { unit: 'mph', boostMode: 'unavailable' });
        assert.equal(stale.speed, '---');
        assert.equal(await page.locator('#signalStatus').textContent(), 'SIGNAL LOST');
        await page.evaluate(() => clearInterval(window.fixtureLabelReplay));
        await frame(page);
      }
      for (const scale of [1, .7]) {
        await page.evaluate(scale => window.HUDCore.handleMessage('config', { data: { scale, glowIntensity: .8, elements: { showGauge: true } } }), scale);
        const rpmCases = [
          { name:'zero',rpm:0,maxRpm:9000,redlineRpm:8000,axis:10000,shift:false },
          { name:'redline',rpm:8000,maxRpm:9000,redlineRpm:8000,axis:10000,shift:true },
          { name:'engine-max',rpm:9000,maxRpm:9000,redlineRpm:8000,axis:10000,shift:true },
          { name:'headroom',rpm:10000,maxRpm:9000,redlineRpm:8000,axis:10000,shift:true },
          { name:'overrange',rpm:11000,maxRpm:9000,redlineRpm:8000,axis:10000,shift:true },
          { name:'adaptive-high',rpm:11000,maxRpm:12000,redlineRpm:11000,axis:14000,shift:true },
          { name:'adaptive-rounded',rpm:9200,maxRpm:9500,redlineRpm:9000,axis:11000,shift:true },
        ];
        for (const scenario of rpmCases) {
          await frame(page, scenario);
          const name = `rpm-${scenario.name}-${scale===1?'default':'compact'}-dpr${dpr}`;
          await save(page,name+'.png');
          const rpm = await inspectRpm(page), layout = await inspectArcLayout(page);
          report.checks.push({rpmScenario:name,expected:scenario,rpm,labelClearances:layout.labelClearances});
          assert.deepEqual(rpm.collisions, [], 'RPM scale must clear readouts and its own graduations: ' + name);
          assert(rpm.markBelow && layout.labelClearances.every(n=>n.bandGap>0), 'Numeral/mark ink must stay below the strip: ' + name);
          assert(rpm.majorTickLength > rpm.minorTickLength && rpm.minorTickLength > 0);
          assert(rpm.minimumCellWidthDevicePixels >= 1, 'Dense oblique cells must retain at least one device pixel of width');
          assert(rpm.minimumCellGapDevicePixels >= .5, 'Dense oblique cells need an actual dark gap at compact DPR1');
          assert.equal(rpm.lit, Math.ceil(Math.min(1,scenario.rpm/scenario.axis)*rpm.cells));
          assert.equal(rpm.shift === 'SHIFT', scenario.shift, 'Shift uses actual redline, not display headroom');
          assert.equal(rpm.graduations.at(-1).rpm, scenario.axis);
          assert(rpm.labels.at(-1).ratio < 1, 'Numbered scale must leave the explicit headroom tail');
          assert(rpm.labels.every(label => Math.abs(label.ratio-label.rpm/scenario.axis)<1e-12));
        }
      }
      await page.evaluate(() => window.HUDCore.handleMessage('config', { data: { scale: 1, glowIntensity: .8, elements: { showGauge: true } } }));
      await frame(page);
    }
    if (width === 1280 && dpr === 1) {
      await frame(page, {}, { isMetric: false });
      assert.equal(await page.locator('#ap1Cluster').getAttribute('data-speed'), '117');
      await save(page, 'imperial.png');
      const positivePaint = await boostPaint(page);
      const boostCases = [
        { name: 'boost-positive-quarter', data: { Boost: 3.62595 }, text: '0.25 bar', ratio: .1875, mode: 'boost' },
        { name: 'boost-positive-half', data: { Boost: 7.2519 }, text: '0.50 bar', ratio: .375, mode: 'boost' },
        { name: 'boost-positive-one', data: { Boost: 14.5038 }, text: '1.00 bar', ratio: .75, mode: 'boost' },
        { name: 'boost-positive-two', data: { Boost: 29.0076 }, text: '2.00 bar', ratio: 1, mode: 'boost' },
        { name: 'boost-zero', data: { Boost: 0 }, text: '0.00 bar', ratio: 0, mode: 'neutral' },
        { name: 'boost-negative', data: { Boost: -7.2519, boost_bar: 0, boost_psi: 0 }, text: '-0.50 bar', ratio: .375, mode: 'vacuum' },
        { name: 'boost-negative-one', data: { Boost: -14.5038 }, text: '-1.00 bar', ratio: .75, mode: 'vacuum' },
        { name: 'boost-negative-two', data: { Boost: -29.0076 }, text: '-2.00 bar', ratio: 1, mode: 'vacuum' },
        { name: 'boost-negative-overflow', data: { Boost: -43.5114 }, text: '-3.00 bar', ratio: 1, mode: 'vacuum' },
        { name: 'boost-vac-psi', data: { Boost: -7.2519, displayUnits: { boostPressure: 'psi' } }, text: '-7.3 PSI', ratio: .375, mode: 'vacuum' },
        { name: 'boost-vac-kpa', data: { Boost: -7.2519, displayUnits: { boostPressure: 'kpa' } }, text: '-50 kPa', ratio: .375, mode: 'vacuum' },
        { name: 'boost-tiny-negative', data: { Boost: -.0145038 }, text: '-0.00 bar', ratio: .00075, mode: 'vacuum' },
        { name: 'boost-missing', data: { Boost: undefined, TimestampMS: 1, boost_bar: 0, boost_psi: 0 }, text: '-- bar', mode: 'unavailable' },
        { name: 'boost-psi', data: { Boost: 14.5038, displayUnits: { boostPressure: 'psi' } }, text: '14.5 PSI' },
        { name: 'boost-kpa', data: { Boost: 14.5038, displayUnits: { boostPressure: 'kpa' } }, text: '100 kPa' },
        { name: 'boost-overflow', data: { Boost: 43.5114 }, text: '3.00 bar' },
      ];
      for (const scenario of boostCases) {
        await frame(page, scenario.data);
        await save(page, scenario.name + '.png');
        assert.equal(await page.locator('#boostValue').textContent(), scenario.text);
        const b = await page.locator('#boostValue').boundingBox(), c = await page.locator('#ap1Cluster').boundingBox();
        assert(b.x >= c.x && b.x + b.width <= c.x + c.width, 'Boost value must remain contained: ' + scenario.name);
        if (scenario.name === 'boost-missing') assert.equal(await page.locator('#boostSegments .is-lit').count(), 0);
        if (scenario.name === 'boost-negative-overflow') assert.equal(await page.locator('#ap1Cluster').getAttribute('data-boost-range'), 'low');
        if (scenario.name === 'boost-overflow') assert.equal(await page.locator('#ap1Cluster').getAttribute('data-boost-range'), 'high');
        const mode = await page.locator('#ap1Cluster').getAttribute('data-boost-mode');
        const ratio = await page.locator('#ap1Cluster').getAttribute('data-boost-ratio');
        const tickLabels = await page.locator('#boostTicks text').allTextContents();
        const color = await page.evaluate(() => { const node = document.querySelector('#boostSegments .is-lit'); return node ? getComputedStyle(node).fill : null; });
        if (scenario.mode) assert.equal(mode, scenario.mode);
        if (scenario.ratio !== undefined) assert(Math.abs(Number(ratio) - scenario.ratio) < 1e-10, 'Piecewise boost fill must match physical pressure: ' + scenario.name);
        if (mode === 'neutral' || mode === 'unavailable') assert.equal(await page.locator('#boostSegments .is-lit').count(), 0);
        const unit = await page.locator('#ap1Cluster').getAttribute('data-boost-unit');
        const expectedTicks = { bar: ['0','0.5','1','2'], PSI: ['0','7.3','14.5','29'], kPa: ['0','50','100','200'] };
        assert.deepEqual(tickLabels, expectedTicks[unit]);
        const paint = await boostPaint(page);
        const labels = await page.evaluate(inspectLabels);
        assertLabels(labels, { unit: 'kmh', boostMode: mode });
        if (mode === 'vacuum') {
          assert.equal(await page.locator('#vacModeLabel').getAttribute('data-active'), 'true');
          assert.deepEqual(paint, positivePaint, 'Both signs must preserve identical bar, value and tick paint; fixed legend selection is checked separately');
          assert((await page.locator('#boostValue').textContent()).startsWith('-'), 'VAC must retain the numeric minus sign');
        }
        report.checks.push({ boostScenario: scenario.name, text: scenario.text, mode, ratio, tickLabels, color, paint, labels });
      }
      await frame(page, { gear: 0, speed_kmh: 24, rpm: 3400 });
      assert.equal(await page.locator('#gearValue').textContent(), 'R');
      await save(page, 'reverse.png');
      await frame(page, { gear: 11, speed_kmh: 0, rpm: 950 });
      assert.equal(await page.locator('#gearValue').textContent(), 'N');
      await save(page, 'neutral.png');
      await frame(page, { rpm: 8500, Boost: 25 });
      assert.equal(await page.locator('#shiftLamp').textContent(), 'SHIFT');
      await save(page, 'redline.png');
      await frame(page, { speed_kmh: null, rpm: null, gear: null, Boost: null });
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
