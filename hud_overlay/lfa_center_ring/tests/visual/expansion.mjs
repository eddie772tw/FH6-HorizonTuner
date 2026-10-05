/** Actual-browser expansion checks. The installed Playwright clock makes motion captures repeatable. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyExpansion({ browser, origin, out, summary }) {
  const base = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, redlineRpm: 8000, speed_kmh: 180, speed_mph: 111.85, gear: 4, throttle: .8, brake: .2, tire_temp_f: [176, 194, 212, 230], boost_psi: 14.5038, isRaceOn: 1, carOrdinal: 10 };
  summary.expansion = [];
  for (const [width, height, dpr, displayScale] of [[1280,720,1,1],[1920,1080,1,1],[2560,1440,1,1],[1920,1080,2,1],[1280,720,1,.8],[1920,1080,2,.8]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-05T00:00:01Z'));
    let frame, stamp = 100, race = {}, samples = [], surfaceSource;
    const send = (type, data = {}) => frame.evaluate(({ type, data }) => window.HUDCore.handleMessage(type, data), { type, data });
    const config = data => send('config', { data: { isMetric: true, scale: displayScale, elements: { showGauge: true }, ...data } });
    async function feed(patch = {}, elapsed = 100) {
      await page.clock.runFor(elapsed);
      await send('hud:frame', { data: { ...base, ...race, timestamp_ms: ++stamp, ...patch } });
      await page.clock.runFor(16);
    }
    const layout = () => frame.evaluate(() => {
      const root = document.getElementById('lfaContainer'), speed = document.getElementById('lfaSpeed').getBoundingClientRect(), bounds = root.getBoundingClientRect();
      return { target: root.dataset.expanded === 'true', settled: root.dataset.expansionSettled === 'true', progress: Number(root.dataset.expansionProgress), x: speed.x,
        transform: getComputedStyle(document.getElementById('lfaMovingCenter')).transform, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
    });
    async function capture(name) {
      const state = await layout();
      samples.push({ name, ...state, panelBounds: state.progress > 0 ? await noOverlap() : null });
      // Page screenshot avoids locator stability's RAF wait while our test clock is paused.
      if (width === 1920 && dpr === 2) await page.screenshot({ path: path.join(out, 'detail-expansion-' + name + (displayScale === 1 ? '' : '-compact') + '.png'), clip: await frame.locator('#lfaContainer').boundingBox(), omitBackground: true });
    }
    async function noOverlap() {
      const report = await frame.evaluate(xml => {
        // Read the exact vector source used to export the visible raster fascia.
        // It is test-only geometry, never a second production clipping layer.
        const asset = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
        asset.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
        document.body.appendChild(asset);
        try {
          const surface = asset.querySelector('#expandedSurface'), ring = asset.querySelector('#expandedRingCutout');
          const circle = { x: ring.cx.baseVal.value, y: ring.cy.baseVal.value, r: ring.r.baseVal.value };
          const texts = [...document.querySelectorAll('#lfaExpandedPane text')].filter(node => node.textContent).map(node => {
            const b = node.getBBox(); return { text: node.textContent, bounds: { x: b.x, y: b.y, width: b.width, height: b.height } };
          });
          const overlaps = [], outsideSurface = [], ringIntersections = [];
          const progress = Number(document.getElementById('lfaContainer').dataset.expansionProgress);
          for (let i = 0; i < texts.length; i++) {
            const { text, bounds: a } = texts[i];
            for (let j = i + 1; j < texts.length; j++) {
              const b = texts[j].bounds;
              if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) overlaps.push([text, texts[j].text]);
            }
            // Two design units of clearance include glyph antialiasing. Sample
            // all rectangle edges against the actual path, not a rectangular proxy.
            const left = a.x - 2, right = a.x + a.width + 2, top = a.y - 2, bottom = a.y + a.height + 2;
            const points = [];
            const edge = (x1, y1, x2, y2) => { const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)); for (let k = 0; k <= n; k++) points.push(new DOMPoint(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n)); };
            edge(left, top, right, top); edge(right, top, right, bottom); edge(right, bottom, left, bottom); edge(left, bottom, left, top);
            if (points.some(point => !surface.isPointInFill(point))) outsideSurface.push(text);
            const nearest = { x: Math.max(left, Math.min(right, circle.x)), y: Math.max(top, Math.min(bottom, circle.y)) };
            if (Math.hypot(nearest.x - circle.x, nearest.y - circle.y) <= circle.r) ringIntersections.push(text);
          }
          return { progress, checkedTextCount: texts.length, clearanceDesignUnits: 2, texts, overlaps, outsideSurface, ringIntersections };
        } finally { asset.remove(); }
      }, surfaceSource);
      assert.deepEqual(report.overlaps, [], 'Expanded labels and readings must not overlap');
      assert.deepEqual(report.outsideSurface, [], 'Every expanded text bbox must stay inside the actual curved fascia with clearance');
      assert.deepEqual(report.ringIntersections, [], 'Expanded text must stay outside the settled shifted-ring cutout');
      // During motion the moving ring may intentionally cover the panel; it
      // does not excuse text leaking outside the visible fascia's left outline.
      return report;
    }
    try {
      await page.goto(origin + '/fixture');
      frame = page.frames().find(f => f.url().includes('/lfa_center_ring/'));
      await frame.waitForFunction(() => window.HUDCore?.getActiveStyle());
      surfaceSource = await frame.evaluate(async () => (await fetch('assets/expanded-pane.svg')).text());
      await config({ lfaManualExpand: false, lfaAutoExpand: false });
      race = { CurrentLap: 34.21, LastLap: 91, BestLap: 88, lap: 2, race_position: 3, CurrentRaceTime: 210 };
      await feed(); const collapsed = await layout();
      assert.equal(collapsed.transform, 'none'); await capture('collapsed');
      await config({ lfaManualExpand: true, lfaAutoExpand: false });
      assert.equal((await layout()).target, true);
      await page.clock.runFor(150); const intermediate = await layout();
      assert.ok(intermediate.progress > 0 && intermediate.progress < 1); await capture('opening-150ms');
      await page.clock.runFor(700); const expanded = await layout();
      assert.equal(expanded.progress, 1); assert.equal(expanded.settled, true);
      assert.ok(Math.abs(expanded.x - collapsed.x - collapsed.bounds.width * 96 / 560) < .1, 'The ring must really move right on screen, not be cancelled by right anchoring');
      assert.deepEqual(expanded.bounds, collapsed.bounds);
      await capture('manual');
      await page.screenshot({ path: path.join(out, `expanded-${width}x${height}-dpr${dpr}${displayScale === 1 ? '' : '-compact'}.png`) });
      await feed({ CurrentLap: 5999.99, LastLap: 5999.99, BestLap: 5999.99, boost_psi: -998.99 * 14.5038 });
      await capture('maximum-width');
      for (const unit of ['bar', 'psi', 'kpa']) {
        await config({ effectiveUnits: { boostPressure: unit, temperature: 'F' } });
        for (const value of [-.00001, -.5, -998.9, 9998.9, -1e12, 1e12, null]) {
          const psi = value === null ? null : unit === 'bar' ? value * 14.5038 : unit === 'kpa' ? value / 6.89476 : value;
          await feed({ CurrentLap: 5999.99, LastLap: 5999.99, BestLap: 5999.99, Boost: psi, throttle: 1, brake: 1, tire_temp_f: [-998.9,-998.9,-998.9,-998.9] });
          await noOverlap();
        }
        await capture('units-' + unit);
      }
      await feed({ CurrentLap: undefined, LastLap: undefined, BestLap: undefined, Boost: null, throttle: null, brake: null, tire_temp_f: [null,null,null,null] });
      await capture('unavailable-readings');
      await config({ effectiveUnits: { boostPressure: 'bar', temperature: 'C' } });
      await config({ lfaManualExpand: false }); await page.clock.runFor(120);
      const reversal = await frame.evaluate(() => {
        const data = { ...window._currentFullConfig, lfaManualExpand: false, lfaAutoExpand: false };
        // runFor may stop between RAF ticks. First paint the old target at the
        // current clock instant, then reverse at that SAME instant. Comparing
        // an older RAF snapshot to a later config paint would test elapsed
        // motion, not a discontinuity caused by retargeting.
        window.HUDCore.handleMessage('config', { data });
        const read = () => ({ now: performance.now(), progress: Number(document.getElementById('lfaContainer').dataset.expansionProgress),
          transform: getComputedStyle(document.getElementById('lfaMovingCenter')).transform, x: document.getElementById('lfaSpeed').getBoundingClientRect().x });
        const before = read();
        window.HUDCore.handleMessage('config', { data: { ...data, lfaManualExpand: true } });
        return { before, after: read() };
      });
      assert.ok(reversal.before.progress > 0 && reversal.before.progress < 1);
      assert.deepEqual(reversal.after, reversal.before, 'At the same clock instant, reversing preserves rendered position and transform exactly');
      for (const target of [false, true, false, true]) { await page.clock.runFor(45); await config({ lfaManualExpand: target }); assert.ok((await layout()).progress >= 0 && (await layout()).progress <= 1); }
      await page.clock.runFor(700); assert.equal((await layout()).progress, 1);
      await config({ lfaManualExpand: false }); await page.clock.runFor(150); await capture('closing-150ms');
      await page.clock.runFor(700); assert.equal((await layout()).transform, 'none');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.runFor(16);
      await config({ lfaManualExpand: true }); assert.equal((await layout()).progress, 1);
      await config({ lfaManualExpand: false }); assert.equal((await layout()).progress, 0);
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.clock.runFor(16);
      await config({ lfaManualExpand: true }); await page.clock.runFor(150);
      const beforeResize = await layout(); await page.setViewportSize({ width: width - 100, height: height - 80 });
      const afterResize = await layout(); assert.ok(afterResize.progress >= beforeResize.progress); assert.ok(afterResize.progress < 1);
      await page.clock.runFor(700); await page.setViewportSize({ width, height });

      // A new car/session clears earlier manual-test timing evidence. Initial zero cannot enter even with P3.
      race = { CurrentLap: 0, LastLap: 0, BestLap: 0, lap: 0, race_position: 3, CurrentRaceTime: 0, carOrdinal: 20 };
      await feed(); await config({ lfaManualExpand: false, lfaAutoExpand: true }); await page.clock.runFor(700);
      for (let i = 0; i < 6; i++) await feed({}, 100);
      assert.equal((await layout()).target, false); await capture('auto-initial-zero');
      for (let i = 0; i < 6; i++) { race.CurrentLap = 1 + i / 10; race.CurrentRaceTime = 1 + i / 10; await feed({}, 100); }
      assert.equal((await layout()).target, true); await page.clock.runFor(700); await capture('auto-race');
      // Frozen valid elapsed time remains a race while packet timestamps continue advancing.
      for (let i = 0; i < 6; i++) await feed({}, 400);
      assert.equal((await layout()).target, true);
      await feed({ isRaceOn: 0 }); assert.equal((await layout()).target, true);
      assert.equal(await frame.locator('#lfaStatus').textContent(), 'PAUSED');
      await feed({ rpm: undefined, speed_kmh: undefined, speed_mph: undefined }); assert.equal((await layout()).target, true);
      await feed({ success: false }); assert.equal((await layout()).target, true);
      await feed(); assert.equal((await layout()).target, true);
      race = { ...race, CurrentLap: 0, lap: 1, LastLap: 90, CurrentRaceTime: 2 };
      await feed(); assert.equal((await layout()).target, true);
      await page.clock.runFor(200); await feed({ timestamp_ms: stamp - 5, CurrentLap: undefined }); assert.equal((await layout()).target, true);
      race.CurrentLap = .1; race.CurrentRaceTime = 2.1;
      await feed(); await page.clock.runFor(1700); assert.equal((await layout()).target, true); await feed();
      await config({ lfaManualExpand: true, lfaAutoExpand: true }); await config({ lfaManualExpand: false, lfaAutoExpand: true });
      assert.equal((await layout()).target, true, 'Manual OFF yields to an already confirmed auto race');
      await config({ lfaAutoExpand: false }); assert.equal((await layout()).target, false);
      await config({ lfaAutoExpand: true }); assert.equal((await layout()).target, true);
      for (let i = 0; i < 9; i++) await feed({ CurrentLap: undefined }, 260);
      assert.equal((await layout()).target, false); await page.clock.runFor(700); await capture('missing-collapse');
      for (let i = 0; i < 6; i++) { race.CurrentLap = 3 + i / 10; race.CurrentRaceTime = 3 + i / 10; await feed({}, 100); }
      assert.equal((await layout()).target, true);
      for (let i = 0; i < 9; i++) await feed({ CurrentLap: 0, race_position: 0 }, 260);
      assert.equal((await layout()).target, false);
      for (let i = 0; i < 6; i++) { race.CurrentLap = 5 + i / 10; race.CurrentRaceTime = 5 + i / 10; await feed({}, 100); }
      assert.equal((await layout()).target, true);
      const duplicate = { ...base, ...race, timestamp_ms: stamp };
      for (let i = 0; i < 10; i++) { await page.clock.runFor(350); await send('hud:frame', { data: duplicate }); }
      assert.equal((await layout()).target, false); await page.clock.runFor(700); await capture('stale-collapse');
      await config({ lfaManualExpand: true }); await page.clock.runFor(700); await capture('manual-without-data');
      assert.equal(await frame.locator('#lfaExpandedCurrent').textContent(), '—:—');
      assert.equal(await frame.locator('#lfaExpandedBoost').textContent(), 'N/A');
      await config({ lfaManualExpand: false });
      // Reconnect must reconfirm positive progression, never celebrate a stale baseline.
      for (let i = 0; i < 6; i++) { race.CurrentLap = 7 + i / 10; race.CurrentRaceTime = 7 + i / 10; await feed({}, 100); }
      assert.equal((await layout()).target, true);

      // First full persisted config on a fresh document begins settled, without a startup slide.
      await page.reload(); frame = page.frames().find(f => f.url().includes('/lfa_center_ring/'));
      await frame.waitForFunction(() => window.HUDCore?.getActiveStyle());
      await config({ lfaManualExpand: true, lfaAutoExpand: false });
      assert.equal((await layout()).progress, 1); assert.equal((await layout()).settled, true); await capture('persisted-manual');
      await send('hud:destroy'); await page.clock.runFor(32); assert.equal(await frame.locator('#lfaContainer').count(), 0);
      assert.deepEqual(errors, []);
      summary.expansion.push({ viewport: { width, height }, dpr, scale: displayScale, samples, errors, passed: true });
    } catch (error) {
      await page.screenshot({ path: path.join(out, 'expansion-failure.png') }).catch(() => {});
      summary.expansion.push({ viewport: { width, height }, dpr, scale: displayScale, samples, errors, passed: false, error: String(error) });
      throw error;
    } finally { await context.close(); }
  }
}
