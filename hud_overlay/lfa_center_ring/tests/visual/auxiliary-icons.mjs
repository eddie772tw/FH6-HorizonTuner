/** Normal-mode icon clearance and real Chromium captures, outside the unit gate. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyAuxiliaryIcons({ browser, origin, out, summary }) {
  summary.auxiliaryIcons = [];
  const base = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, redlineRpm: 8000, speed_kmh: 180, speed_mph: 111.85, gear: 4, throttle: .8, brake: .2, tire_temp_f: [176, 194, 212, 230], boost_psi: 14.5038, isRaceOn: 1 };
  for (const [dpr, scale] of [[1, 1], [1, .8], [2, 1], [2, .8]]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const page = await context.newPage(), errors = [], checks = [];
    summary.auxiliaryIcons.push({ viewport: { width: 1920, height: 1080 }, dpr, scale, checks, errors });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/fixture');
    const frame = page.frames().find(candidate => candidate.url().includes('/lfa_center_ring/'));
    await frame.waitForFunction(() => window.HUDCore?.getActiveStyle());
    const send = (type, data) => frame.evaluate(({ type, data }) => window.HUDCore.handleMessage(type, data), { type, data });
    await send('config', { data: { isMetric: true, scale, elements: { showGauge: true }, lfaManualExpand: false, lfaAutoExpand: false } });
    let stamp = 100;
    const scenarios = [
      ['metric', { temperature: 'C', boostPressure: 'bar', speed: 'kmh' }, {}],
      ['imperial', { temperature: 'F', boostPressure: 'psi', speed: 'mph' }, {}],
      ['vacuum-bar', { temperature: 'C', boostPressure: 'bar', speed: 'kmh' }, { boost_psi: -.5 * 14.5038 }],
      ['vacuum-kpa', { temperature: 'C', boostPressure: 'kpa', speed: 'kmh' }, { boost_psi: -.5 * 14.5038 }],
      ['unavailable', { temperature: 'C', boostPressure: 'bar', speed: 'kmh' }, { tire_temp_f: [], boost_psi: null }],
    ];
    for (const [name, displayUnits, patch] of scenarios) {
      await send('hud:frame', { data: { ...base, ...patch, displayUnits, timestamp_ms: ++stamp } });
      await page.waitForTimeout(40);
      const report = await frame.evaluate(async () => {
        const fascia = document.getElementById('lfaCollapsedFascia');
        await fascia.decode();
        const xml = await (await fetch('assets/side-crescents.svg')).text();
        const asset = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
        asset.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
        document.body.appendChild(asset);
        try {
          const bounds = (node, matrix = null) => {
            const b = node.getBBox();
            const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => matrix ? new DOMPoint(x, y).matrixTransform(matrix) : { x, y });
            return { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) };
          };
          const icons = [...asset.querySelectorAll('use')].map(node => ({ id: node.getAttribute('href').slice(1), bounds: bounds(node, node.transform.baseVal.consolidate().matrix) }));
          const labels = [...document.querySelectorAll('#lfaCollapsedReadings text')].filter(node => node.textContent).map(node => ({ text: node.textContent, bounds: bounds(node) }));
          const overlaps = [], outsideSurface = [], ringIntersections = [];
          const surface = asset.querySelector('g[mask] > path'), ring = asset.querySelector('#preserveCenter circle');
          const circle = { x: ring.cx.baseVal.value, y: ring.cy.baseVal.value, r: ring.r.baseVal.value };
          // Two design units allow for half-stroke width and raster antialiasing.
          const clearance = 2;
          for (const icon of icons) {
            const a = icon.bounds, left = a.left - clearance, right = a.right + clearance, top = a.top - clearance, bottom = a.bottom + clearance;
            for (const label of labels) {
              const b = label.bounds;
              if (left < b.right && right > b.left && top < b.bottom && bottom > b.top) overlaps.push([icon.id, label.text]);
            }
            const corners = [new DOMPoint(left, top), new DOMPoint(right, top), new DOMPoint(right, bottom), new DOMPoint(left, bottom)];
            if (corners.some(point => !surface.isPointInFill(point))) outsideSurface.push(icon.id);
            const nearestX = Math.max(left, Math.min(right, circle.x)), nearestY = Math.max(top, Math.min(bottom, circle.y));
            if (Math.hypot(nearestX - circle.x, nearestY - circle.y) <= circle.r) ringIntersections.push(icon.id);
          }
          return { icons, labels, clearance, overlaps, outsideSurface, ringIntersections, normalMode: document.getElementById('lfaContainer').dataset.expanded !== 'true', rasterLoaded: fascia.naturalWidth > 0 };
        } finally { asset.remove(); }
      });
      const screenshot = `detail-icons-${name}-dpr${dpr}${scale === 1 ? '' : '-compact'}.png`;
      await frame.locator('#lfaContainer').screenshot({ path: path.join(out, screenshot), omitBackground: true });
      checks.push({ name, screenshot, ...report });
      assert.equal(report.normalMode, true);
      assert.equal(report.rasterLoaded, true);
      assert.deepEqual(report.icons.map(icon => icon.id), ['tireIcon', 'turboIcon']);
      assert.deepEqual(report.overlaps, [], 'Normal-mode icons need clearance from every live label');
      assert.deepEqual(report.outsideSurface, [], 'Normal-mode icons must remain inside the original side surfaces');
      assert.deepEqual(report.ringIntersections, [], 'Normal-mode icons must clear the preserved center');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
}
