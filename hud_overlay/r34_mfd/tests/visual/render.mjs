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
      const status = await page.locator('#r34StreamStatus').evaluate(node => {
        if (!node.textContent.trim()) return null;
        const b = node.getBoundingClientRect();
        const cluster = document.getElementById('r34Cluster');
        const owner = document.getElementById(cluster.hidden ? 'r34Mfd' : 'r34SpeedModule').getBoundingClientRect();
        return { text: node.textContent, clear: b.top >= owner.bottom, fits: b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
      });
      if (status) assert(status.clear && status.fits, 'Stream status must fit below the live instrument islands');
      report.checks.push({ name, viewport: [width, height], dpr, bounds, status });
      if (width === 1280 && (dpr === 1 || (dpr === 2 && ['single', 'twin', 'multi', 'g', 'lap'].includes(name)))) {
        const crop = 'mfd-' + name + '-dpr' + dpr + '.png';
        await page.locator('#r34Mfd').screenshot({ path: path.join(out, crop), omitBackground: true }); report.screenshots.push(crop);
      }
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
    const inspectDials = async mode => {
      const dials = await page.locator('[data-mode="' + mode + '"] .r34-dial').evaluateAll(elements => elements.map(dial => {
        const bounds = dial.querySelector('svg').getBoundingClientRect();
        const panel = dial.querySelector('.r34-peak-panel').getBoundingClientRect();
        const tolerance = 1 / devicePixelRatio;
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const legends = [...dial.querySelectorAll('[id$="-labels"] text, [id$="-unit"]')];
        return {
          labels: [...dial.querySelectorAll('text')].map(text => {
            const b = text.getBoundingClientRect();
            return { text: text.textContent, contained: b.left >= bounds.left - tolerance && b.right <= bounds.right + tolerance && b.top >= bounds.top - tolerance && b.bottom <= bounds.bottom + tolerance };
          }),
          siblingOverlap: legends.map(text => {
            const b = text.getBoundingClientRect();
            return { text: text.textContent, panel: overlaps(b, panel), legends: legends.filter(other => other !== text && overlaps(b, other.getBoundingClientRect())).map(other => other.textContent) };
          }),
        };
      }));
      assert(dials.every(dial => dial.labels.every(label => label.contained)), mode + ' gauge labels must fit their own dial viewport');
      assert(dials.every(dial => dial.siblingOverlap.every(label => !label.panel && !label.legends.length)), mode + ' scale labels and units must not overlap sibling PEAK panels or other legends');
      report.checks.push({ mode, dialReadability: dials });
    };
    await configure({}); await save('waiting');
    const inspectLayout = async () => {
      const layout = await page.evaluate(() => {
        const ids = ['r34TachModule', 'r34SpeedModule', 'r34BoostModule', 'r34TempModule', 'r34Mfd'];
        const boxes = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
        return { boxes, clusterHidden: document.getElementById('r34Cluster').hidden, width: innerWidth, height: innerHeight };
      });
      const visible = layout.clusterHidden ? layout.boxes.slice(-1) : layout.boxes;
      assert(visible.every(b => b.x >= 0 && b.y >= 0 && b.right <= layout.width + .01 && b.bottom <= layout.height + .01), 'Independent islands must fit the viewport');
      if (!layout.clusterHidden) {
        assert(layout.boxes[0].right < layout.boxes[1].x, 'R34 main dials preserve tach-left/speed-right and a clear center');
        assert(layout.boxes[3].right < layout.boxes[0].x && layout.boxes[1].right < layout.boxes[2].x, 'Temperature is outside left; boost is outside right');
        assert(layout.boxes[2].right < layout.boxes[4].x, 'Right auxiliary must not overlap the MFD');
      }
      const screen = layout.boxes.at(-1); assert(Math.abs(screen.width / screen.height - 270 / 152) < .01);
      report.checks.push({ layout });
    };
    await inspectLayout();
    const compressedSpacing = await page.locator('#r34TachFace .r34-scale-numeral').evaluateAll(nodes => {
      const labels = nodes.filter(node => Number(node.dataset.value) <= 3000).map(node => {
        const box = node.getBoundingClientRect();
        const glyph = node.querySelector('path'), matrix = glyph.getScreenCTM();
        const stroke = Number(getComputedStyle(glyph).strokeWidth.replace('px', '')) * Math.hypot(matrix.c, matrix.d);
        return { value: Number(node.dataset.value), top: box.top - stroke / 2, bottom: box.bottom + stroke / 2 };
      });
      return labels.slice(1).map((label, index) => ({ low: labels[index].value, high: label.value, physicalGap: (labels[index].top - label.bottom) * devicePixelRatio }));
    });
    assert(compressedSpacing.every(pair => pair.physicalGap > .4), 'Compressed 0–3 glyph strokes need a real visible gap without changing the equal tick mapping');
    report.checks.push({ compressedSpacing });
    await inspectDials('single');
    await inspectCanvas('r34History');
    for (const mode of ['single', 'twin', 'multi', 'g', 'lap']) {
      await configure({ r34MfdMode: mode });
      for (let sample = 0; sample < 80; sample++) await frame({ Boost: (1 + Math.sin(sample / 12) * .4) * 14.5038, LapNumber: mode === 'lap' ? Math.floor(sample / 20) + 3 : 3 });
      await frame({ LapNumber: mode === 'lap' ? 6 : 3 }); await save(mode);
      if (width === 1280) {
        const filename = 'context-' + mode + '-dpr' + dpr + '.png';
        await page.locator('#r34Container').screenshot({ path: path.join(out, filename), omitBackground: true });
        report.screenshots.push(filename);
      }
      assert.equal(await page.locator('[data-mode]:not([hidden])').getAttribute('data-mode'), mode);
      if (mode === 'single' || mode === 'g') await inspectCanvas(mode === 'g' ? 'r34G' : 'r34History');
      if (mode === 'single' || mode === 'twin') await inspectDials(mode);
    }
    // LCD text must fit matching physical windows, including real sibling separation.
    const inspectLcd = async () => {
      const lcds = await page.locator('.r34-lcd').evaluateAll(nodes => nodes.map(node => {
        const window = node.querySelector('.r34-lcd-window').getBoundingClientRect();
        const labels = [...node.querySelectorAll('text')].map(text => ({ text: text.textContent, rect: text.getBoundingClientRect() })).filter(item => item.rect.width > 0 && item.rect.height > 0);
        const tolerance = 1 / devicePixelRatio;
        const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { id: node.id, width: window.width, height: window.height, texts: labels.map(item => item.text),
          contained: labels.every(({ rect }) => rect.left >= window.left - tolerance && rect.right <= window.right + tolerance && rect.top >= window.top - tolerance && rect.bottom <= window.bottom + tolerance),
          separate: labels.every((item, index) => labels.slice(index + 1).every(other => !overlap(item.rect, other.rect))) };
      }));
      assert(lcds.every(lcd => lcd.contained && lcd.separate), 'Visible LCD content must fit its window without sibling collisions');
      assert(Math.abs(lcds[0].width - lcds[1].width) < .01 && Math.abs(lcds[0].height - lcds[1].height) < .01, 'Both physical LCD windows must match');
      report.checks.push({ lcds });
    };
    const saveLcd = async name => {
      await inspectLcd(); await save('lcd-' + name);
      if (width === 1280 && dpr === 2) for (const dial of ['Tach', 'Speed']) {
        const filename = 'dial-' + dial.toLowerCase() + '-' + name + '-dpr2.png';
        await page.locator('#r34' + dial + 'Module').screenshot({ path: path.join(out, filename), omitBackground: true }); report.screenshots.push(filename);
      }
    };
    await configure({}); await frame({ CurrentLap: 67.321 });
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'timer');
    assert.equal(await page.locator('#r34TachTimer').textContent(), "1'07.321");
    assert.equal(await page.locator('#r34Readouts').count(), 0, 'The floating central gear/speed strip is removed');
    await saveLcd('live-timer');
    if (width === 1280 && dpr === 1) {
      const alpha = await page.evaluate(async base64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const a = document.getElementById('r34TachModule').getBoundingClientRect(), b = document.getElementById('r34SpeedModule').getBoundingClientRect();
        const x = Math.ceil(a.right + 1), y = Math.ceil(Math.max(a.top, b.top)), w = Math.floor(b.left - a.right - 2), h = Math.floor(Math.min(a.bottom, b.bottom) - y);
        const gap = ctx.getImageData(x, y, w, h).data;
        return { gapTransparent: gap.every((value, index) => index % 4 !== 3 || value === 0), outerTransparent: ctx.getImageData(0, 0, 1, 1).data[3] === 0 };
      }, (await page.screenshot({ omitBackground: true })).toString('base64'));
      assert(alpha.gapTransparent && alpha.outerTransparent, 'Actual pixels outside the faces remain transparent, without an assembly rectangle'); report.checks.push({ alpha });
    }
    await frame({ CurrentLap: null });
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'power');
    assert.equal(await page.locator('#r34LcdPower').textContent(), '288 HP');
    assert.equal(await page.locator('#r34LcdTorque').textContent(), '405 N·m');
    await saveLcd('power-torque');
    for (const [unit, expected] of [['kw', '215 kW'], ['ps', '292 PS']]) {
      await configure({ effectiveUnits: { ...baseConfig.effectiveUnits, power: unit, torque: 'lbft' } }); await frame({ CurrentLap: null });
      assert.equal(await page.locator('#r34LcdPower').textContent(), expected);
      assert.equal(await page.locator('#r34LcdTorque').textContent(), '299 lb·ft'); await saveLcd('power-' + unit);
    }
    await configure({}); await frame({ CarOrdinal: 434, LapNumber: 0, CurrentLap: 82.5 });
    await frame({ CarOrdinal: 434, LapNumber: 1, CurrentLap: 0, LastLap: 82.5 });
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'timer');
    assert.equal(await page.locator('#r34TachTimer').textContent(), "0'00.000"); await saveLcd('rollover-zero');
    if (width === 1280 && dpr === 1) {
      for (let index = 0; index < 16; index++) { await page.waitForTimeout(200); await frame({ CarOrdinal: 434, LapNumber: 1, CurrentLap: 0 }); }
      assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'power');
      await frame({ CarOrdinal: 434, LapNumber: 1, CurrentLap: 3.4 });
      assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'timer');
      report.checks.push('Fresh sustained zero expires after the original three-second rollover grace; later positive timing resumes');
    }
    await configure({ effectiveUnits: { ...baseConfig.effectiveUnits, speed: 'mph' } }); await frame({ CurrentLap: null });
    assert.equal(await page.locator('#r34DigitalSpeed').textContent(), '101'); assert.equal(await page.locator('#r34DigitalSpeedUnit').textContent(), 'mph');
    assert.equal(await page.locator('#r34Gear').textContent(), '4'); await saveLcd('mph-gear');
    await configure({}); await frame({ CurrentLap: null, PowerWatts: null, TorqueNewtons: null, SpeedMetersPerSecond: null, Gear: null });
    assert.equal(await page.locator('#r34LcdPower').textContent(), 'N/A HP'); assert.equal(await page.locator('#r34LcdTorque').textContent(), 'N/A N·m');
    assert.equal(await page.locator('#r34DigitalSpeed').textContent(), 'N/A'); await saveLcd('missing-fields');
    await frame({ CurrentLap: null, PowerWatts: -7457, TorqueNewtons: null });
    assert.equal(await page.locator('#r34LcdPower').textContent(), '-10 HP'); assert.equal(await page.locator('#r34LcdTorque').textContent(), 'N/A N·m');
    await frame({ CurrentLap: null, PowerWatts: null, TorqueNewtons: -15 });
    assert.equal(await page.locator('#r34LcdPower').textContent(), 'N/A HP'); assert.equal(await page.locator('#r34LcdTorque').textContent(), '-15 N·m');
    await configure({ elements: { ...baseConfig.elements, showRPM: false, showSpeed: false, showGear: true, showPowerTorque: false } }); await frame({ CurrentEngineRpm: 8500 });
    assert.equal(await page.locator('#r34TachTimerGroup').isVisible(), true); assert.equal(await page.locator('#r34GearGroup').isVisible(), true);
    assert.equal(await page.locator('#r34DigitalSpeedGroup').isVisible(), false); assert.equal(await page.locator('#r34RevLamp').evaluate(n => n.classList.contains('active')), false);
    await frame({ CurrentLap: null }); assert.equal(await page.locator('#r34LcdPower').textContent(), 'N/A HP'); assert.equal(await page.locator('#r34LcdTorque').textContent(), 'N/A N·m');
    await configure({}); await frame({ success: false });
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'unavailable');
    assert.equal(await page.locator('#r34LcdPower').textContent(), 'N/A HP'); assert.equal(await page.locator('#r34TachTimer').textContent(), "—'——.———");
    await configure({ r34MfdMode: 'multi' }); await frame({ TireTemp: [32, 68, 104, 140] });
    assert.equal(await page.locator('#r34TempValue').textContent(), '30.0');
    assert.equal(await page.locator('#r34Multi .r34-multi-row:last-child label').textContent(), 'TIRE TEMP');
    assert.equal(await page.locator('#r34Multi .r34-multi-row:last-child strong span').textContent(), '30.0');
    const cAngle = await page.locator('#r34TempNeedle').getAttribute('transform');
    const cBar = await page.locator('#r34Multi .r34-multi-row:last-child i').getAttribute('style');
    await save('temperature-c');
    await configure({ r34MfdMode: 'multi', effectiveUnits: { ...baseConfig.effectiveUnits, temperature: 'F' } });
    await frame({ TireTemp: [32, 68, 104, 140] });
    assert.equal(await page.locator('#r34TempValue').textContent(), '86.0');
    assert.equal(await page.locator('#r34TempUnit').textContent(), '°F');
    assert.equal(await page.locator('#r34TempNeedle').getAttribute('transform'), cAngle);
    assert.equal(await page.locator('#r34Multi .r34-multi-row:last-child i').getAttribute('style'), cBar);
    await save('temperature-f');
    await frame({ TireTemp: [32, null, 104, 140] });
    assert.equal(await page.locator('#r34TempValue').textContent(), 'N/A');
    assert.equal(await page.locator('#r34Multi .r34-multi-row:last-child strong span').textContent(), 'N/A');
    assert.equal(await page.locator('#r34TempNeedle').evaluate(node => getComputedStyle(node).visibility), 'hidden');
    await save('missing-one-tire');
    await configure({ r34MfdMode: 'multi' }); await frame({ TireTemp: [0, 0, 0, 0] });
    assert.equal(await page.locator('#r34TempValue').textContent(), '-17.8'); await save('zero-fahrenheit-input');
    await frame({ TireTemp: [-40, -40, -40, -40] });
    assert.equal(await page.locator('#r34TempValue').textContent(), '-40.0'); await save('negative-tire-temperature');
    for (const [name, boost, tire] of [['min', -.5, 32], ['mid', .75, 167], ['max', 2, 302]]) {
      await configure({ r34MfdMode: 'single' }); await frame({ Boost: boost * 14.5038, TireTemp: [tire, tire, tire, tire] });
      const directions = await page.locator('#r34BoostNeedle, #r34TempNeedle').evaluateAll(nodes => nodes.map(node => {
        const matrix = node.transform.baseVal.consolidate().matrix; return { id: node.id, x: matrix.a, y: matrix.b, pivotX: matrix.e, pivotY: matrix.f, faceCenter: node.ownerSVGElement.viewBox.baseVal.width / 2 };
      }));
      assert(directions.every(d => (d.id === 'r34TempNeedle' ? d.x > 0 && d.pivotX < d.faceCenter : d.x < 0 && d.pivotX > d.faceCenter) && (name === 'min' ? d.y > 0 : name === 'max' ? d.y < 0 : Math.abs(d.y) < .001)), 'Mirrored offset pivots: left temperature sweeps right; right boost sweeps left');
      assert(Math.abs(directions[0].pivotX + directions[1].pivotX - directions[0].faceCenter * 2) < .001 && directions[0].pivotY === directions[1].pivotY, 'Both auxiliary pivots mirror the same face center');
      report.checks.push({ sweep: name, directions });
      await save('sweep-' + name);
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
      await inspectLayout();
      const full = await inspectCanvas(mode === 'g' ? 'r34G' : 'r34History');
      const fullMarker = mode === 'g' ? await gMarker() : null;
      await configure({ r34MfdMode: mode, scale: .7 }); await frame({});
      await inspectLayout();
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
    const fixedSpeedNeedle = await page.locator('#r34SpeedNeedle').getAttribute('transform');
    const fixedSpeedFace = await page.locator('#r34SpeedFace').innerHTML();
    await configure({ r34MfdMode: 'single', effectiveUnits: { speed: 'mph', boostPressure: 'psi' } }); await frame({ Boost: -7.2519, Gear: 0 }); await save('imperial-vacuum'); await inspectDials('single');
    assert.equal(await page.locator('#r34DigitalSpeed').textContent(), '101');
    assert.equal(await page.locator('#r34DigitalSpeedUnit').textContent(), 'mph');
    assert.equal(await page.locator('#r34SpeedNeedle').getAttribute('transform'), fixedSpeedNeedle);
    assert.equal(await page.locator('#r34SpeedFace').innerHTML(), fixedSpeedFace);
    assert.equal(await page.locator('#r34SpeedFace text').textContent(), 'kmh');
    assert.equal(await page.locator('#r34Single-value').textContent(), '-7.3'); assert.equal(await page.locator('#r34Gear').textContent(), 'R');
    await configure({ r34MfdMode: 'single', effectiveUnits: { speed: 'kmh', boostPressure: 'kpa' } }); await frame({ Boost: 43.5114, CurrentEngineRpm: 12000, SpeedMetersPerSecond: 100 }); await save('over-scale-kpa'); await inspectDials('single');
    assert.equal(await page.locator('#r34Single-value').textContent(), '300'); assert.match(await page.locator('#r34DigitalSpeed').textContent(), /360/);
    assert.match(await page.locator('#r34ClusterNote').textContent(), /SPEED OVER SCALE/);
    assert.match(await page.locator('#r34ClusterNote').textContent(), /RPM OVER SCALE: 12000/);
    await configure({ elements: { ...baseConfig.elements, showSpeed: false, showRPM: false, showGear: false } });
    await frame({ CurrentEngineRpm: 12000, SpeedMetersPerSecond: 100 });
    assert.equal(await page.locator('#r34ClusterNote').textContent(), '');
    assert.equal(await page.locator('#r34TachFace').isVisible(), false);
    assert.equal(await page.locator('#r34SpeedFace').isVisible(), false);
    assert.equal(await page.locator('#r34DigitalSpeedGroup').isVisible(), false);
    assert.equal(await page.locator('#r34GearGroup').isVisible(), false);
    await save('overscale-common-readouts-hidden');
    await configure({}); await frame({ CurrentEngineRpm: 12000, SpeedMetersPerSecond: 100 });
    assert.equal(await page.locator('#r34TachFace').isVisible(), true);
    assert.equal(await page.locator('#r34SpeedFace').isVisible(), true);
    assert.equal(await page.locator('#r34GearGroup').isVisible(), true);
    assert.match(await page.locator('#r34ClusterNote').textContent(), /SPEED OVER SCALE/);
    await configure({}); await frame({ Boost: null, CurrentEngineRpm: null, SpeedMetersPerSecond: null, Fuel: null, Gear: null, TireTemp: null }); await save('missing');
    assert.equal(await page.locator('#r34Single-value').textContent(), 'N/A');
    assert.equal(await page.locator('#r34DigitalSpeed').textContent(), 'N/A');
    await frame({ IsRaceOn: 0 }); await save('paused'); assert.equal(await page.locator('#r34Status').textContent(), 'PAUSED');
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'unavailable');
    assert.equal(await page.locator('#r34LcdPower').textContent(), 'N/A HP');
    await frame({}); await page.waitForTimeout(1700); await save('stale'); assert.equal(await page.locator('#r34Single-value').textContent(), 'N/A');
    assert.equal(await page.locator('#r34TempValue').textContent(), 'N/A');
    assert.equal(await page.locator('#r34TachLcd').getAttribute('data-lcd-mode'), 'unavailable');
    assert.equal(await page.locator('#r34LcdTorque').textContent(), 'N/A N·m');
    await configure({ r34ShowCluster: false, r34MfdMode: 'multi', scale: .7, useDefaultColors: false, customColor: '#70c9df' }); await frame({}); await save('compact-mfd-only-custom');
    assert.equal(await page.locator('#r34Cluster').isVisible(), false); await inspectLayout();
    await configure({ elements: { ...baseConfig.elements, showGear: false, showRPM: true } }); await frame({ CurrentEngineRpm: 8500 });
    assert.equal(await page.locator('#r34GearGroup').isVisible(), false);
    assert.equal(await page.locator('#r34RevLamp').isVisible(), true);
    assert.equal(await page.locator('#r34RevLamp').evaluate(node => node.classList.contains('active')), true);
    await save('gear-hidden-rev-active');
    await configure({}); await frame({ CarOrdinal: 999, Boost: 0, Gear: 11 }); assert.equal(await page.locator('#r34Single-peak').textContent(), '0.00'); await save('new-car-neutral');
    await page.evaluate(() => window.HUDCore.handleMessage('hud:elements', { showGauge: false })); assert.equal(await page.locator('#r34Container').isVisible(), false);
    await configure({}); await frame({}); assert.equal(await page.locator('#r34Container').isVisible(), true);
    await page.evaluate(() => window.HUDCore.handleMessage('hud:elements', { showGauge: true }));
    assert.equal(await page.locator('#r34Container').evaluate(node => getComputedStyle(node).display), 'block');
    assert.equal(await page.locator('#r34MfdCase, .r34-bezel-keys, .r34-joystick').count(), 0);
    await configure({ r34MfdMode: 'twin' }); await frame({ CurrentEngineRpm: 6800 });
    assert.equal(await page.locator('#r34TwinR-value').textContent(), '6.8');
    await page.reload(); await page.waitForFunction(() => Boolean(window.R34Hud)); await configure({}); assert.equal(await page.locator('#r34Status').textContent(), 'WAITING');
    if (width === 1280 && dpr === 1) {
      for (const [rw, rh] of [[2560, 1440], [3440, 1440], [3840, 360]]) {
        await page.setViewportSize({ width: rw, height: rh });
        for (const scale of [.7, 1, 2]) {
          await configure({ scale }); await frame({}); await inspectLayout(); await inspectCanvas('r34History');
          const filename = 'responsive-' + rw + 'x' + rh + '-scale' + scale + '.png';
          await page.screenshot({ path: path.join(out, filename), omitBackground: true }); report.screenshots.push(filename);
        }
        await configure({ r34ShowCluster: false, scale: 2, r34MfdMode: 'g' }); await frame({}); await inspectLayout(); await inspectCanvas('r34G');
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) { report.errors.push(String(error)); throw error; }
finally { await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n'); await browser?.close(); server.close(); }
