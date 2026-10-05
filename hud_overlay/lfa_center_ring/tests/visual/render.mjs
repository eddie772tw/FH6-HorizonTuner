/** Optional Chromium evidence, kept outside the unit gate and packaged HUD. */
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const out = path.resolve(process.env.OUTPUT_DIR || path.join(root, 'docs/assets/lfa-center-ring'));
await mkdir(out, { recursive: true });
const fixture = `<!doctype html><meta charset="UTF-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#28353b;font:12px Arial;color:#adc3ca}body{background:linear-gradient(165deg,#768589 0%,#465b64 38%,#25333a 39%,#152128 75%)}body:before{content:'';position:absolute;inset:44% 0 0;background:repeating-linear-gradient(0deg,transparent 0 53px,#bcd4d510 54px 55px);transform:perspective(400px) rotateX(32deg);transform-origin:top}p{position:absolute;top:30px;left:32px;letter-spacing:2px;font-size:11px}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style><p>CHROMIUM LAYOUT FIXTURE · SYNTHETIC TELEMETRY · NOT A GAME CAPTURE</p><iframe src="/hud_overlay/lfa_center_ring/index.html"></iframe>`;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/fixture') { res.setHeader('content-type', 'text/html'); res.end(fixture); return; }
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, activePage;
const summary = { browser: null, platform: process.platform, nativeAcceptance: 'Not performed: Windows/game unavailable', source: 'Synthetic canonical frames through real HUDCore dispatcher', scenarios: [], passed: false, error: null };
const base = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, redlineRpm: 8000, speed_kmh: 180, speed_mph: 111.85, gear: 4, throttle: .8, brake: .2, tire_temp_f: [176, 194, 212, 230], boost_psi: 14.5038, isRaceOn: 1 };
async function send(frame, type, data = {}) { await frame.evaluate(({ type, data }) => window.HUDCore.handleMessage(type, data), { type, data }); }
async function text(frame, id) { return frame.locator('#lfa' + id).textContent(); }
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  summary.browser = await browser.version();
  for (const [width, height, dpr] of [[1280,720,1],[1920,1080,1],[2560,1440,1],[1920,1080,2]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    activePage = page;
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/fixture');
    const frame = page.frames().find((f) => f.url().includes('/lfa_center_ring/'));
    await frame.waitForFunction(() => window.HUDCore?.getActiveStyle());
    assert.equal(await text(frame, 'Status'), 'WAITING');
    assert.equal(await text(frame, 'Speed'), '—');
    for (const sensor of ['Tire', 'Boost', 'Throttle', 'Brake']) assert.equal(await text(frame, sensor), 'N/A');
    assert.equal(await text(frame, 'LapTime'), '—:—');
    await send(frame, 'hud:init', { isMetric: true });
    await page.waitForTimeout(40);
    assert.equal(await frame.locator('#lfaSelfCheck').isVisible(), true);
    await send(frame, 'config', { data: { isMetric: true, scale: 1, elements: { showGauge: true }, useDefaultColors: true } });
    let stamp = 100;
    async function reading(patch = {}, payload = {}) {
      await send(frame, 'hud:frame', { data: { ...base, timestamp_ms: ++stamp, ...patch }, ...payload });
      await page.waitForTimeout(40);
    }
    async function detail(name) {
      if (width === 1920 && dpr === 2) await frame.locator('#lfaContainer').screenshot({ path: path.join(out, `detail-${name}.png`), omitBackground: true });
    }
    await reading(); assert.equal(await text(frame, 'Speed'), '180'); assert.equal(await text(frame, 'Tire'), '95°C');
    assert.equal(await text(frame, 'Boost'), '1'); assert.equal(await text(frame, 'Throttle'), '80%'); assert.equal(await text(frame, 'Brake'), '20%');
    const rect = await frame.locator('#lfaContainer').boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
    const tag = `${width}x${height}-dpr${dpr}`;
    assert.equal(await frame.evaluate(() => document.querySelector('#lfaNeedle').width), 560 * dpr);
    assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: path.join(out, `metric-${tag}.png`) });
    if (width === 1920 && dpr === 2) {
      await frame.locator('#lfaContainer').screenshot({ path: path.join(out, 'detail-metric.png'), omitBackground: true });
      await reading({ rpm: 8400, gear: 5, throttle: 1 }); assert.equal(await text(frame, 'Status'), 'SHIFT');
      await frame.locator('#lfaContainer').screenshot({ path: path.join(out, 'detail-redline.png'), omitBackground: true });
    }
    await send(frame, 'config', { data: { isMetric: false, useDefaultColors: false, customColor: '#93d9ed', glowIntensity: 0, scale: 1 } });
    await reading({ displayUnits: { speed: 'mph' } }); assert.equal(await text(frame, 'Speed'), '112'); assert.equal(await text(frame, 'SpeedUnit'), 'mph');
    await detail('imperial');
    await reading({ gear: 0, rpm: 2200, speed_mph: -12, throttle: .1 }); assert.equal(await text(frame, 'Gear'), 'R'); assert.equal(await text(frame, 'Speed'), '12');
    await detail('reverse');
    await reading({ gear: 11, rpm: 900, speed_mph: 0 }); assert.equal(await text(frame, 'Gear'), 'N');
    await detail('neutral');
    await reading({ rpm: 15000, maxRpm: 16000, redlineRpm: 15000 }); assert.equal(await text(frame, 'Status'), 'SHIFT');
    await detail('high-rpm');
    await send(frame, 'config', { data: { isMetric: true, effectiveUnits: { temperature: 'F', boostPressure: 'psi' } } });
    await reading(); assert.equal(await text(frame, 'Tire'), '203°F'); assert.equal(await text(frame, 'BoostUnit'), 'psi'); assert.equal(await text(frame, 'Boost'), '14.5'); await detail('aux-psi-fahrenheit');
    await send(frame, 'config', { data: { effectiveUnits: { temperature: 'C', boostPressure: 'kpa' } } });
    await reading(); assert.equal(await text(frame, 'Boost'), '100'); assert.equal(await text(frame, 'BoostUnit'), 'kPa'); await detail('aux-kpa');
    await reading({ Boost: -7.2519, boost_psi: 0 }); assert.equal(await text(frame, 'Boost'), '-50'); await detail('aux-negative-boost');
    await reading({ Boost: 0, throttle: 0, brake: 0, tire_temp_f: [32, 32, 32, 32] });
    assert.equal(await text(frame, 'Boost'), '0'); assert.equal(await text(frame, 'Throttle'), '0%'); assert.equal(await text(frame, 'Brake'), '0%'); assert.equal(await text(frame, 'Tire'), '0°C'); await detail('aux-zero');
    await reading({ tire_temp_f: [176, null, 212, 230], boost_psi: undefined }); assert.equal(await text(frame, 'Tire'), 'N/A'); assert.equal(await text(frame, 'Boost'), 'N/A'); await detail('aux-partial-missing');
    await reading({ boost_psi: 72.519, throttle: 2, brake: -.5, tire_temp_f: [320, 320, 320, 320] });
    assert.equal(await text(frame, 'Throttle'), '100%'); assert.equal(await text(frame, 'Brake'), '0%'); assert.equal(await text(frame, 'Tire'), '160°C'); await detail('aux-clamped-arcs');
    await send(frame, 'config', { data: { effectiveUnits: { temperature: 'C', boostPressure: 'bar' } } });
    const race = { lap: 2, race_position: 3, CurrentLap: 34.21, LastLap: 91, BestLap: 88, CurrentRaceTime: 210 };
    await reading(race); assert.equal(await text(frame, 'Status'), 'P3'); assert.equal(await text(frame, 'LapTime'), '0:34.21'); await detail('rank-lap');
    await reading({ ...race, lap: 3, LastLap: 92, CurrentLap: 0, CurrentRaceTime: 220 });
    assert.equal(await text(frame, 'Status'), 'LAP 3'); assert.equal(await text(frame, 'LapTime'), '0:00.00'); await detail('lap-notice');
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); await reading({ ...race, lap: 3, LastLap: 92, CurrentLap: i, CurrentRaceTime: 221 + i }); }
    assert.equal(await text(frame, 'Status'), 'P3');
    await reading({ ...race, lap: 4, LastLap: 87, BestLap: 87, CurrentLap: .5, CurrentRaceTime: 300 });
    assert.equal(await text(frame, 'Status'), 'BEST LAP'); await detail('best-notice');
    await reading({ ...race, timestamp_ms: 0, lap: 0, LastLap: 0, BestLap: 0, CurrentLap: 0, CurrentRaceTime: 0 }); assert.equal(await text(frame, 'Status'), 'P3');
    await reading({ CurrentLap: 5999.99 }); assert.equal(await text(frame, 'LapTime'), '99:59.99'); await detail('lap-max-width');
    await reading({ CurrentLap: 6000 }); assert.equal(await text(frame, 'LapTime'), '—:—');
    await send(frame, 'hud:frame', { data: { timestamp_ms: ++stamp, rpm: 3000 } }); await page.waitForTimeout(40);
    assert.equal(await text(frame, 'Speed'), '—'); assert.equal(await text(frame, 'Gear'), '—'); assert.equal(await text(frame, 'Tire'), 'N/A');
    await detail('missing');
    await reading({ rpm: Infinity, speed_kmh: 1e12, speed_mph: 1e12, gear: 99, throttle: null, brake: NaN });
    assert.equal(await text(frame, 'Speed'), '—'); assert.equal(await text(frame, 'Gear'), '—');
    await reading({ success: false }); assert.equal(await text(frame, 'Status'), 'DATA ERROR'); assert.equal(await text(frame, 'Speed'), '—');
    await reading({ isRaceOn: 0 }); assert.equal(await text(frame, 'Status'), 'PAUSED');
    const duplicate = { ...base, timestamp_ms: ++stamp };
    await send(frame, 'hud:frame', { data: duplicate });
    for (let i = 0; i < 9; i++) { await page.waitForTimeout(180); await send(frame, 'hud:frame', { data: duplicate }); }
    await page.waitForTimeout(40); assert.equal(await text(frame, 'Status'), 'NO SIGNAL'); assert.equal(await text(frame, 'Speed'), '—'); assert.equal(await text(frame, 'Tire'), 'N/A'); assert.equal(await text(frame, 'LapTime'), '—:—');
    if (width === 1920 && dpr === 2) await frame.locator('#lfaContainer').screenshot({ path: path.join(out, 'detail-no-signal.png'), omitBackground: true });
    await reading(); assert.equal(await text(frame, 'Status'), 'LIVE'); assert.equal(await text(frame, 'Tire'), '95°C');
    await send(frame, 'hud:elements', { showGauge: false }); assert.equal(await frame.locator('#lfaContainer').isVisible(), false);
    await send(frame, 'hud:elements', { showGauge: true }); assert.equal(await frame.locator('#lfaContainer').isVisible(), true);
    await page.setViewportSize({ width: width - 100, height: height - 80 }); await reading();
    await send(frame, 'hud:animate'); await page.waitForTimeout(50); assert.equal(await frame.locator('#lfaSelfCheck').isVisible(), true);
    await reading(); assert.equal(await frame.locator('#lfaSelfCheck').isVisible(), false);
    await send(frame, 'hud:destroy'); await page.waitForTimeout(50); assert.equal(await frame.locator('#lfaContainer').count(), 0);
    assert.deepEqual(errors, []);
    summary.scenarios.push({ viewport: { width, height }, dpr, rect, tests: ['init', 'config', 'metric', 'imperial', 'reverse', 'neutral', 'redline', '16000-rpm-scale', 'four-tire-average-C-F', 'boost-bar-psi-kPa', 'signed-zero-missing-boost', 'pedal-percent-clamps', 'partial-tire-unavailable', 'rank-reported-lap', 'lap-and-best-notices', 'notice-expiry-reset', 'lap-max-width-overflow', 'missing', 'invalid', 'error', 'pause', 'replayed-timestamp-stale', 'reconnect', 'visibility', 'resize', 'animate', 'destroy', 'dpr-backing-store', 'transparent-outside'], errors });
    await context.close();
  }
  summary.passed = true;
} catch (error) {
  summary.error = error.stack || String(error);
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(path.join(out, 'evidence.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
