const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { inspectLabels, assertLabels } = require('./label-checks.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const repo = path.resolve(__dirname, '../../../..');
  const style = path.basename(path.resolve(__dirname, '../..'));
  const out = path.join(process.env.OUTPUT_DIR || path.join(repo, 'scratch', style + '-visual'), 'launcher');
  fs.mkdirSync(out, { recursive: true });
  const root = path.join(repo, 'hud_overlay');
  const elements = {
    showGauge: true, showRPM: true, showSpeed: true, showGear: true,
    showCenterInfo: true, showTeleMaster: false, showMotionEffect: false,
    showTeleSuspension: false, showTeleTires: false, showTeleAttitude: false,
    showTelePedals: false, showPowerTorque: false, showTeleCompass: false,
  };
  const config = { hudStyle: style, scale: 1, unit: 'kmh', effectiveUnit: 'kmh',
    effectiveUnits: { speed: 'kmh', boostPressure: 'bar' }, enableSmoothing: true,
    useDefaultColors: true, glowIntensity: 1, elements };
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/hud/styles') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ styles: fs.readdirSync(root).filter(n => fs.existsSync(path.join(root,n,'index.html'))).map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) }));
    }
    if (u.pathname === '/api/overlay/config') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(config));
    }
    const file = path.resolve(root, '.' + decodeURIComponent(u.pathname.replace(/^\/hud/, '')));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode=404; return res.end('Not found');
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const missing = [];
  page.on('response', r => { if(r.status()>=400 && !r.url().endsWith('/favicon.ico')) missing.push({url:r.url(),status:r.status()}); });
  await page.addInitScript(() => {
    class Socket {
      constructor(url) { this.url=url; this.readyState=1; setTimeout(()=>this.onopen?.({}),30); }
      send() {} close() { this.readyState=3; }
    }
    Socket.OPEN=1; window.WebSocket=Socket;
  });
  const boostFixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/boost-raw-json.json'), 'utf8'));
  const samples = [];
  async function record(name) {
    const frame = page.frames().find(f => f.url().includes('/'+style+'/index.html'));
    if (!frame) throw new Error('HUD was not dynamically discovered');
    const state = await frame.evaluate(() => ({ text: document.body.innerText, readings: { speed: document.querySelector('#ap1Cluster')?.dataset.speed || document.querySelector('#lfaSpeed')?.textContent, gear: document.querySelector('#gearValue, #lfaGear')?.textContent, status: document.querySelector('#signalStatus, #lfaStatus')?.textContent, boost: document.querySelector('#boostValue')?.textContent, boostRange: document.querySelector('#ap1Cluster')?.dataset.boostRange, boostMode: document.querySelector('#ap1Cluster')?.dataset.boostMode, boostRatio: document.querySelector('#ap1Cluster')?.dataset.boostRatio, boostCaption: document.querySelector('.ap1-boost-caption[data-active="true"]')?.textContent || null, footerRemoved: document.querySelectorAll('.ap1-signature, #rpmValue, #fuelValue').length === 0 }, body: getComputedStyle(document.body).backgroundColor,
      style: window.HUDCore.getActiveStyle().containerId,
      bounds: (() => { const e=document.getElementById(window.HUDCore.getActiveStyle().containerId); const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height,display:getComputedStyle(e).display}; })() }));
    await page.screenshot({ path: path.join(out,name+'.png'), omitBackground: true });
    const labels = await frame.evaluate(inspectLabels);
    samples.push({name,...state,labels});
    assertLabels(labels, { unit: labels.speedUnit, boostMode: state.readings.boostMode });
    const assert = require('node:assert/strict');
    if (name === 'host-cruise') { assert.equal(state.readings.speed, '180'); assert.equal(state.readings.gear, '4'); assert.equal(state.readings.boost, '1.00 bar'); }
    const boostExpected = { 'host-boost-quarter': '0.25 bar', 'host-boost-half': '0.50 bar', 'host-boost-one': '1.00 bar', 'host-boost-two': '2.00 bar', 'host-boost-zero': '0.00 bar', 'host-boost-negative': '-0.50 bar', 'host-boost-negative-one': '-1.00 bar', 'host-boost-negative-two': '-2.00 bar', 'host-boost-missing': '-- bar', 'host-boost-overflow': '3.00 bar', 'host-boost-psi': '14.5 PSI', 'host-boost-kpa': '100 kPa' };
    if (boostExpected[name]) assert.equal(state.readings.boost, boostExpected[name]);
    const expectedRatios = { 'host-cruise': .75, 'host-boost-quarter': .1875, 'host-boost-half': .375, 'host-boost-one': .75, 'host-boost-two': 1, 'host-boost-zero': 0, 'host-boost-negative': .375, 'host-boost-negative-one': .75, 'host-boost-negative-two': 1 };
    if (name in expectedRatios) assert(Math.abs(Number(state.readings.boostRatio) - expectedRatios[name]) < 1e-6, 'Boost mapping must match parser float32 precision');
    if (name === 'host-boost-negative') { assert.equal(state.readings.boostMode, 'vacuum'); assert.equal(state.readings.boostCaption, 'VAC'); }
    if (name === 'host-boost-zero') assert.equal(state.readings.boostMode, 'neutral');
    if (name === 'host-boost-overflow') assert.equal(state.readings.boostRange, 'high');
    assert.equal(state.readings.footerRemoved, true);
    if (name === 'host-stale-with-smoothing') { assert.match(state.readings.status, /SIGNAL/); assert.match(state.readings.speed, /^(---|—)$/); }
    if (name === 'host-reverse-reconnected') { assert.equal(state.readings.gear, 'R'); assert.equal(state.readings.speed, '16'); }
    if (name === 'host-imperial') { assert.equal(state.readings.speed, '10'); assert.equal(labels.speedUnit, 'mph'); }
    if (name === 'host-gauge-hidden') assert.equal(state.bounds.display, 'none');
    else if (name === 'host-gauge-restored') assert.notEqual(state.bounds.display, 'none');
    if (name === 'host-720p') { assert(state.bounds.x >= 0 && state.bounds.y >= 0); assert(state.bounds.x + state.bounds.width <= 1280 && state.bounds.y + state.bounds.height <= 720); }
    assert.equal(state.body, 'rgba(0, 0, 0, 0)');
    return frame;
  }
  try {
    await page.goto('http://127.0.0.1:'+server.address().port+'/hud/index.html');
    await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle());
    await page.waitForTimeout(1800);
    await record('host-standby');
    await page.evaluate(rawFrame => {
      window.auditRaw={...rawFrame};
      window.auditFeed=setInterval(()=>{window.auditRaw.TimestampMS+=16;window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.auditRaw}}));},16);
    }, boostFixtures.cases[0].frame);
    await page.waitForTimeout(300);
    await record('host-cruise');
    for (const [name, boost] of [['host-boost-quarter', 3.62595], ['host-boost-half', 7.2519], ['host-boost-one', 14.5038], ['host-boost-two', 29.0076], ['host-boost-zero', boostFixtures.cases[1].frame.Boost], ['host-boost-negative', boostFixtures.cases[2].frame.Boost], ['host-boost-negative-one', -14.5038], ['host-boost-negative-two', -29.0076], ['host-boost-missing', null], ['host-boost-overflow', 43.5114]]) {
      await page.evaluate(value => { if (value === null) delete window.auditRaw.Boost; else window.auditRaw.Boost = value; }, boost);
      await page.waitForTimeout(200); await record(name);
    }
    await page.evaluate(value => { window.auditRaw.Boost = value; }, boostFixtures.cases[0].frame.Boost);
    for (const unit of ['psi','kpa']) {
      await page.evaluate(({ config, unit }) => window.dispatchEvent(new CustomEvent('hud:config', { detail: { ...config, effectiveUnits: { speed: 'kmh', boostPressure: unit } } })), { config, unit });
      await page.waitForTimeout(200); await record('host-boost-' + unit);
    }
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: config })), config);
    await page.waitForTimeout(200);
    await page.evaluate(()=>clearInterval(window.auditFeed));
    await page.waitForTimeout(3100);
    await record('host-stale-with-smoothing');
    await page.evaluate(() => {
      window.auditRaw.Gear=0; window.auditRaw.SpeedMetersPerSecond=-4.5; window.auditRaw.CurrentEngineRpm=1400;
      window.auditFeed=setInterval(()=>{window.auditRaw.TimestampMS+=16;window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.auditRaw}}));},16);
    });
    await page.waitForTimeout(150);
    await record('host-reverse-reconnected');
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,unit:'mph',effectiveUnit:'mph',effectiveUnits:{speed:'mph',boostPressure:'psi'}}})),config);
    await page.waitForTimeout(150);
    await record('host-imperial');
    await page.setViewportSize({width:1280,height:720});
    await page.waitForTimeout(150);
    await record('host-720p');
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,elements:{...config.elements,showGauge:false}}})),config);
    await page.waitForTimeout(100);
    await record('host-gauge-hidden');
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:config})),config);
    await page.waitForTimeout(100);
    await record('host-gauge-restored');
    for (const scale of [1, .7]) {
      for (const [label, unit, boost, mode] of [['metric-boost','kmh',7.2519,'boost'], ['imperial-vac','mph',-7.2519,'vacuum'], ['zero','kmh',0,'neutral'], ['missing','mph',null,'unavailable']]) {
        await page.evaluate(({config,scale,unit,boost}) => {
          if (boost === null) delete window.auditRaw.Boost; else window.auditRaw.Boost = boost;
          window.dispatchEvent(new CustomEvent('hud:config', { detail: { ...config, scale, unit, effectiveUnit: unit, effectiveUnits: { speed: unit, boostPressure: 'bar' } } }));
        }, {config,scale,unit,boost});
        await page.waitForTimeout(150);
        const frame = await record('host-labels-' + label + '-' + (scale === 1 ? 'default' : 'compact'));
        assertLabels(await frame.evaluate(inspectLabels), {unit,boostMode:mode});
      }
      await page.evaluate(() => clearInterval(window.auditFeed));
      await page.waitForTimeout(3100);
      const staleFrame = await record('host-labels-stale-' + (scale === 1 ? 'default' : 'compact'));
      assertLabels(await staleFrame.evaluate(inspectLabels), {unit:'mph',boostMode:'unavailable'});
      const assert = require('node:assert/strict');
      assert.equal(await staleFrame.locator('#signalStatus').textContent(), 'SIGNAL LOST');
      await page.evaluate(() => { window.auditFeed = setInterval(() => { window.auditRaw.TimestampMS += 16; window.dispatchEvent(new CustomEvent('telemetry', { detail: {...window.auditRaw} })); },16); });
    }
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', {detail:config})), config);
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,hudStyle:'simple'}})),config);
    await page.waitForTimeout(250);
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:config})),config);
    await page.waitForTimeout(1800);
    const frame=await record('host-style-reloaded');
    await frame.evaluate(()=>window.postMessage({type:'hud:destroy'},'*'));
    await page.waitForTimeout(500);
    samples.push({name:'destroy',remainingBodyChildren:await frame.evaluate(()=>document.body.childElementCount)});
    const assert = require('node:assert/strict');
    assert.equal(samples.at(-1).remainingBodyChildren, 0);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log(JSON.stringify({style,errors,missing,samples},null,2));
  } catch (error) { errors.push(String(error)); throw error; } finally {
    fs.writeFileSync(path.join(out,'host-audit.json'),JSON.stringify({style,errors,missing,samples},null,2));
    await browser.close(); await new Promise(r=>server.close(r));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
