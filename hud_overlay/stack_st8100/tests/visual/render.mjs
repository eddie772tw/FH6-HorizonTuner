// Actual Chromium screenshots; fixture telemetry is not native/game acceptance.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const out = process.env.OUTPUT_DIR || path.join(root, '../scratch/stack-st8100-visual');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.otf': 'font/otf' };
const server = createServer(async (req, res) => {
  try {
    const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const report = { runtime: 'Sandboxed Chrome, controlled telemetry, not Windows native/game acceptance', screenshots: [], checks: [], errors: [] };
let browser;
const base = { IsRaceOn: 1, CarOrdinal: 12, CurrentRaceTime: 70, LapNumber: 1, CurrentEngineRpm: 6400, EngineMaxRpm: 8000,
  SpeedMetersPerSecond: 50, Gear: 4, Fuel: .7, Boost: 14.5038, TireTemp: [194,203,212,221], CurrentLap: 12.3, LastLap: 58.45, BestLap: 57.6 };
const elements = { showGauge: true, showRPM: true, showCenterInfo: true, showSpeed: true, showGear: true, showBoost: true };
let timestamp = 10000;
async function frame(page, extra = {}) {
  await page.evaluate(data => window.HUDCore.handleMessage('hud:frame', { data }), { ...base, ...extra, TimestampMS: timestamp += 16 });
  await page.waitForTimeout(110);
}
async function config(page, data = {}) {
  await page.evaluate(data => window.HUDCore.handleMessage('config', { data }), { scale: 1, elements, ...data });
}
async function capture(page, name) {
  const state = await page.locator('#stackCanvas').evaluate(canvas => ({ ...canvas.dataset, label: canvas.getAttribute('aria-label') }));
  await page.screenshot({ path: path.join(out, name + '.png'), omitBackground: true });
  report.screenshots.push(name + '.png'); report.checks.push({ name, ...state }); return state;
}
async function sustained(page, extra) { for (let i = 0; i < 7; i++) await frame(page, extra); }
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const [width, height, dpr] of [[1280,720,1],[1920,1080,1],[2560,1440,1],[1280,720,2]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/stack_st8100/index.html`);
    await page.waitForFunction(() => window.HUDCore?.getActiveStyle()); await config(page); await frame(page);
    const current = await capture(page, `metric-${width}x${height}-dpr${dpr}`);
    assert.equal(current.lcd1, 'KM/H 180 | GEAR 4'); assert.equal(current.lcd2, 'FUEL % 70 | TYRE C 98');
    const bounds = await page.locator('#stackContainer').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    if (width === 1280) {
      await page.locator('#stackCanvas').screenshot({ path: path.join(out, `detail-metric-dpr${dpr}.png`), omitBackground: true });
      report.screenshots.push(`detail-metric-dpr${dpr}.png`);
      await config(page, { scale: .7 }); await frame(page); await capture(page, `compact-dpr${dpr}`);
      await config(page, { effectiveUnits: { speed: 'mph', boostPressure: 'psi' }, stackSt8100TemperatureUnit: 'f',
        stackSt8100Field2: 'boost', stackSt8100Field3: 'current_lap', stackSt8100Field4: 'tire_max' });
      await frame(page, { Boost: -7.2519 });
      const imperial = await capture(page, `imperial-lap-dpr${dpr}`);
      assert.equal(imperial.lcd1, 'MPH 112 | BST PSI -7.3'); assert.equal(imperial.lcd2, 'LAP 0:12.30 | HOT F 221');
    }
    if (width === 1280 && dpr === 1) {
      await config(page, { stackSt8100Field1: 'speed', stackSt8100Field2: 'gear', stackSt8100Field3: 'fuel', stackSt8100Field4: 'tire_avg',
        effectiveUnits: { speed: 'kmh', boostPressure: 'bar' }, stackSt8100TemperatureUnit: 'c' });
      await frame(page, { Gear: 0, SpeedMetersPerSecond: 4.5 }); assert.equal((await capture(page, 'reverse')).lcd1, 'KM/H 16 | GEAR R');
      await frame(page, { Gear: 11 }); assert.match((await capture(page, 'neutral')).lcd1, /GEAR N/);
      await frame(page, { CurrentEngineRpm: 7500 }); assert.equal((await capture(page, 'shift')).shift, 'true');
      await frame(page, { CurrentEngineRpm: 9200, EngineMaxRpm: 10000 }); assert.equal((await capture(page, 'dial-0-4-10')).dial, '0-4-10');
      await frame(page, { CurrentEngineRpm: 11400, EngineMaxRpm: 13000 }); assert.equal((await capture(page, 'dial-0-6-13')).dial, '0-6-13');
      await frame(page, { CurrentEngineRpm: 15000, EngineMaxRpm: 16000 }); await capture(page, 'over-range');
      await config(page, { stackSt8100Page: 'peaks' }); await frame(page); await capture(page, 'tell-tales');
      await config(page, { stackSt8100Page: 'live', stackSt8100FuelWarningEnabled: true });
      await sustained(page, { Fuel: .05 }); assert.equal((await capture(page, 'low-fuel-warning')).warning, 'fuel');
      await config(page, { stackSt8100TireWarningEnabled: true });
      await sustained(page, { TireTemp: [300,200,200,200] }); assert.equal((await capture(page, 'tire-warning')).warning, 'tire');
      await config(page, { stackSt8100BoostWarningEnabled: true });
      await sustained(page, { Boost: 29.0076 }); assert.equal((await capture(page, 'boost-warning')).warning, 'boost');
      await frame(page, { Boost: null, TireTemp: null, Fuel: null, CurrentEngineRpm: null, SpeedMetersPerSecond: null, Gear: null });
      const missing = await capture(page, 'missing-channels'); assert.equal(missing.warning, ''); assert.equal(missing.lcd1, 'KM/H -- | GEAR --');
      await frame(page, { IsRaceOn: 0 }); assert.equal((await capture(page, 'paused')).status, 'PAUSED');
      await frame(page, { success: false }); assert.equal((await capture(page, 'data-error')).status, 'DATA ERROR');
      await frame(page);
      await page.evaluate(raw => { window.replay = setInterval(() => window.HUDCore.handleMessage('hud:frame', { data: raw }), 30); }, { ...base, TimestampMS: timestamp });
      await page.waitForTimeout(1700); assert.equal((await capture(page, 'stale')).status, 'NO SIGNAL');
      await page.evaluate(() => clearInterval(window.replay)); await frame(page);
      assert.equal((await capture(page, 'reconnected')).status, 'LIVE');
      await config(page, { useDefaultColors: false, customColor: '#5ecae8', scale: 1.1 }); await frame(page); await capture(page, 'custom-accent');
      await config(page, { elements: { ...elements, showGauge: false } }); assert.equal(await page.locator('#stackContainer').isVisible(), false);
      await config(page, { elements }); await frame(page);
      await page.evaluate(() => window.postMessage({ type: 'hud:destroy' }, '*'));
      await page.waitForFunction(() => document.body.childElementCount === 0); await page.waitForTimeout(200);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) { report.errors.push(String(error)); throw error; }
finally {
  await writeFile(path.join(out, 'visual-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
