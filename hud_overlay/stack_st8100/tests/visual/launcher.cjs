// Real launcher + shared Coordinator + interpolation. Controlled WebSocket/API boundary only.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
async function main() {
  const repo = path.resolve(__dirname, '../../../..'), root = path.join(repo, 'hud_overlay');
  const out = path.join(process.env.OUTPUT_DIR || path.join(repo, 'scratch/stack-st8100-visual'), 'launcher'); fs.mkdirSync(out, { recursive: true });
  const elements = { showGauge: true, showRPM: true, showSpeed: true, showGear: true, showCenterInfo: true, showTeleMaster: false,
    showMotionEffect: false, showTeleSuspension: false, showTeleTires: false, showTeleAttitude: false, showTelePedals: false,
    showPowerTorque: false, showTeleCompass: false };
  const config = { hudStyle: 'stack_st8100', scale: 1, unit: 'kmh', effectiveUnit: 'kmh', effectiveUnits: { speed: 'kmh', boostPressure: 'bar' },
    enableSmoothing: true, useDefaultColors: true, glowIntensity: 1, elements };
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/hud/styles') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ styles: fs.readdirSync(root).filter(id => fs.existsSync(path.join(root,id,'index.html'))).map(id => ({ id, source:'builtin', urlPrefix:'/hud' })) })); }
    if (pathname === '/api/overlay/config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(config)); }
    const file = path.resolve(root, '.' + decodeURIComponent(pathname.replace(/^\/hud/, '')));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser; const report = { checks: [], errors: [], missing: [] };
  try {
    browser = await chromium.launch({ headless:true, chromiumSandbox:true,
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel:process.env.PLAYWRIGHT_CHANNEL } : {}),
      ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
    const page = await browser.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.missing.push(response.url()); });
    await page.addInitScript(() => {
      class Socket { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.({}), 30); } send() {} close() { this.readyState = 3; } }
      Socket.OPEN = 1; window.WebSocket = Socket;
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/hud/index.html`);
    await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle());
    await page.waitForTimeout(1700);
    async function capture(name) {
      const frame = page.frames().find(frame => frame.url().includes('/stack_st8100/index.html'));
      assert(frame, 'Style must be dynamically discovered');
      const data = await frame.locator('#stackCanvas').evaluate(canvas => ({ ...canvas.dataset }));
      await page.screenshot({ path:path.join(out,name+'.png'), omitBackground:true }); report.checks.push({name,...data}); return data;
    }
    const raw = { TimestampMS:10000, IsRaceOn:1, CarOrdinal:12, CurrentRaceTime:70, LapNumber:1, CurrentEngineRpm:6400, EngineMaxRpm:8000,
      SpeedMetersPerSecond:50, Gear:4, Fuel:.7, Boost:14.5038, TireTemp:[194,203,212,221], CurrentLap:12.3, LastLap:58.45, BestLap:57.6 };
    await page.evaluate(raw => { window.raw = raw; window.feed = setInterval(() => { window.raw.TimestampMS += 16; window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.raw}})); },16); }, raw);
    await page.waitForTimeout(400); assert.equal((await capture('host-live')).lcd1, 'KM/H 180 | GEAR 4');
    await page.evaluate(() => { for (const key of ['CurrentEngineRpm','EngineMaxRpm','SpeedMetersPerSecond','Gear','Fuel','Boost','TireTemp']) delete window.raw[key]; });
    await page.waitForTimeout(400);
    const missing = await capture('host-raw-missing'); assert.equal(missing.lcd1, 'KM/H -- | GEAR --'); assert.equal(missing.lcd2, 'TIME 1:10.00 | TYRE C --'); assert.equal(missing.shift,'false');
    await page.evaluate(raw => { window.raw = { ...raw, TimestampMS:window.raw.TimestampMS + 16 }; }, raw);
    await page.waitForTimeout(300);
    await page.evaluate(() => clearInterval(window.feed)); await page.waitForTimeout(1800);
    assert.equal((await capture('host-stale-with-smoothing')).status,'NO SIGNAL');
    await page.evaluate(() => { window.raw.TimestampMS = 10; window.raw.CurrentRaceTime = .01; window.raw.LapNumber = 0; window.feed = setInterval(() => { window.raw.TimestampMS += 16; window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.raw}})); },16); });
    await page.waitForTimeout(400); assert.equal((await capture('host-restarted')).status,'LIVE');
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,effectiveUnits:{speed:'mph',boostPressure:'psi'}}})),config);
    await page.waitForTimeout(300); assert.match((await capture('host-imperial')).lcd1,/MPH 112/);
    await page.setViewportSize({width:1280,height:720}); await page.waitForTimeout(200); await capture('host-720p');
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,hudStyle:'simple'}})),config);
    await page.waitForTimeout(300);
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config',{detail:config})),config);
    await page.waitForTimeout(1700); assert.equal((await capture('host-style-return')).status,'LIVE');
    const frame = page.frames().find(frame => frame.url().includes('/stack_st8100/index.html'));
    await frame.evaluate(() => window.postMessage({type:'hud:destroy'},'*')); await page.waitForTimeout(250);
    assert.equal(await frame.evaluate(() => document.body.childElementCount),0);
    assert.deepEqual(report.errors,[]); assert.deepEqual(report.missing,[]);
  } catch (error) { report.errors.push(String(error)); throw error; }
  finally { fs.writeFileSync(path.join(out,'host-audit.json'),JSON.stringify(report,null,2)+'\n'); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
