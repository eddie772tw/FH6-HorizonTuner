const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { verifyMedia } = require('./media.cjs');
const { verifyStatus } = require('./status.cjs');

async function main() {
  const repo = path.resolve(__dirname, '../../../..');
  const style = path.basename(path.resolve(__dirname, '../..'));
  const out = path.join(process.env.OUTPUT_DIR || path.join(repo, 'scratch', style + '-visual'), 'launcher');
  fs.mkdirSync(out, { recursive: true });
  const root = path.join(repo, 'hud_overlay');
  const parser = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/udp-parser-samples.json'), 'utf8'));
  const elements = { showGauge: true, showRPM: true, showSpeed: true, showGear: true,
    showCenterInfo: true, showTeleMaster: false, showMotionEffect: false, showTeleSuspension: false,
    showTeleTires: false, showTeleAttitude: false, showTelePedals: false, showPowerTorque: false, showTeleCompass: false };
  const config = { hudStyle: style, scale: 1, unit: 'kmh', effectiveUnit: 'kmh',
    lfaManualExpand: false, lfaAutoExpand: false,
    effectiveUnits: { speed: 'kmh', boostPressure: 'bar' }, enableSmoothing: true,
    useDefaultColors: true, glowIntensity: 1, elements };
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/runtime' || u.pathname === '/api/overlay/system_media') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(u.pathname === '/api/runtime' ? { platform: 'windows', capabilities: { systemMedia: true } }
        : { success: true, has_media: false, state: 'unavailable', source: 'winrt' }));
    }
    if (u.pathname === '/api/cars/database') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({"1260": {"display_name": "2010 Lexus LFA"}, "4084": {"display_name": "1972 Datsun #269 Attacking The Clock Racing 240Z All Carbon Hillclimb Beast"}})); }
    if (u.pathname === '/api/hud/styles') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ styles: fs.readdirSync(root).filter(n => fs.existsSync(path.join(root,n,'index.html'))).map(id => ({ id, source: 'builtin', urlPrefix: '/hud' })) }));
    }
    if (u.pathname === '/api/overlay/config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(config)); }
    const file = path.resolve(root, '.' + decodeURIComponent(u.pathname.replace(/^\/hud/, '')));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode=404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [], missing = [], samples = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if(r.status()>=400 && !r.url().endsWith('/favicon.ico')) missing.push({url:r.url(),status:r.status()}); });
  await page.addInitScript(() => {
    class Socket { constructor(url) { this.url=url; this.readyState=1; setTimeout(()=>this.onopen?.({}),30); } send() {} close() { this.readyState=3; } }
    Socket.OPEN=1; window.WebSocket=Socket;
  });
  async function record(name, expected = {}) {
    const frame = page.frames().find(f => f.url().includes('/'+style+'/index.html'));
    if (!frame) throw new Error('HUD was not dynamically discovered');
    const state = await frame.evaluate(() => {
      const text = id => document.getElementById('lfa' + id)?.textContent;
      const e = document.getElementById(window.HUDCore.getActiveStyle().containerId), b = e.getBoundingClientRect();
      const fill = document.getElementById('lfaBoostFill');
      return { readings: { speed:text('Speed'),gear:text('Gear'),status:text('Status'),tire:text('Tire'),boost:text('Boost'),boostUnit:text('BoostUnit'),boostMode:text('BoostMode'),boostFraction:parseFloat(fill.style.strokeDasharray)/100,boostVisible:fill.style.opacity,throttle:text('Throttle'),brake:text('Brake'),lap:text('LapTime'),expanded:e.dataset.expanded,expansionSettled:e.dataset.expansionSettled,expandedCurrent:text('ExpandedCurrent') },
        body:getComputedStyle(document.body).backgroundColor, bounds:{x:b.x,y:b.y,width:b.width,height:b.height,display:getComputedStyle(e).display} };
    });
    await page.screenshot({ path: path.join(out,name+'.png'), omitBackground: true }); samples.push({name,...state});
    for (const [key, value] of Object.entries(expected)) assert.equal(state.readings[key], value, name + ':' + key);
    assert.equal(state.body, 'rgba(0, 0, 0, 0)');
    return { frame, state };
  }
  async function patch(data) { await page.evaluate(p => Object.assign(window.auditRaw, p), data); await page.waitForTimeout(180); }
  async function units(effectiveUnits) {
    await page.evaluate(({config,effectiveUnits}) => window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,unit:effectiveUnits.speed,effectiveUnit:effectiveUnits.speed,effectiveUnits}})), {config,effectiveUnits});
    await page.waitForTimeout(180);
  }
  try {
    await page.goto('http://127.0.0.1:'+server.address().port+'/hud/index.html');
    await page.waitForFunction(() => document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle());
    await page.waitForTimeout(1800);
    await record('host-standby', {status:'Pending......',speed:'—',tire:'N/A',boost:'N/A',lap:'—:—'});
    await page.evaluate(raw => {
      window.auditRaw={...raw};
      window.auditFeed=setInterval(()=>{window.auditRaw.TimestampMS+=16;window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.auditRaw}}));},16);
    }, parser.samples[0].parsedJson);
    await page.waitForTimeout(300);
    await record('host-parser-positive', {speed:'180',gear:'4',status:'PI N/A',tire:'95°C',boost:'1',boostUnit:'bar',boostMode:'',throttle:'80%',brake:'20%',lap:'0:34.21'});
    await patch({CurrentLap:34.8});
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: { ...config, lfaManualExpand: true } })), config);
    await page.waitForTimeout(800); await record('host-manual-expanded', {expanded:'true',expansionSettled:'true',expandedCurrent:'0:34.80'});
    await page.evaluate(config => window.dispatchEvent(new CustomEvent('hud:config', { detail: config })), config);
    await page.waitForTimeout(800); await record('host-manual-restored', {expanded:'false',expansionSettled:'true'});
    for (const [bar, boostFraction] of [[.25,.1875],[.5,.375],[1,.75],[2,1]]) {
      await patch({Boost:bar*14.5038}); await record('host-nonlinear-boost-'+bar, {boost:String(bar),boostFraction,boostMode:''});
    }
    await patch({Boost:parser.samples[1].parsedJson.Boost}); await record('host-parser-zero', {boost:'0',boostFraction:0,boostMode:''});
    await patch({Boost:-7.2519}); await record('host-vacuum-half', {boost:'-0.5',boostFraction:.5,boostMode:'VAC'});
    await patch({Boost:parser.samples[2].parsedJson.Boost}); await record('host-parser-negative', {boost:'-0.5',boostMode:'VAC'});
    await units({speed:'mph',boostPressure:'psi',temperature:'F'});
    await record('host-imperial-units', {speed:'112',tire:'203°F',boost:'-7.3',boostUnit:'psi'});
    await units({speed:'kmh',boostPressure:'kpa',temperature:'C'});
    await record('host-independent-kpa', {tire:'95°C',boost:'-50',boostUnit:'kPa'});
    await page.evaluate(()=>{delete window.auditRaw.Boost;window.auditRaw.TireTemp=[176,null,212,230];}); await page.waitForTimeout(200);
    await record('host-missing-boost-partial-tires', {boost:'N/A',tire:'N/A',boostFraction:0,boostVisible:'0',boostMode:''});
    await patch({Boost:14.5038,TireTemp:[176,194,212,230],AccelInput:0,BrakeInput:0});
    await record('host-zero-pedals', {throttle:'0%',brake:'0%'});
    await patch({AccelInput:255,BrakeInput:255}); await record('host-full-pedals', {throttle:'100%',brake:'100%'});
    await patch({AccelInput:204,BrakeInput:51,LapNumber:3,LastLap:82,CurrentLap:0,CurrentRaceTime:220,RacePosition:2});
    await record('host-lap-completion', {status:'LAP 3',lap:'0:00.00'});
    await page.waitForTimeout(3200); await record('host-lap-notice-expired', {status:'P2'});
    await patch({LapNumber:4,LastLap:79,BestLap:79,CurrentLap:1.23,CurrentRaceTime:300});
    await record('host-best-improvement', {status:'BEST LAP',lap:'0:01.23'});
    await page.evaluate(()=>clearInterval(window.auditFeed)); await page.waitForTimeout(3100);
    await record('host-stale-with-smoothing', {status:'Pending......',speed:'—',tire:'N/A',boost:'N/A',throttle:'N/A',brake:'N/A',lap:'—:—'});
    await page.evaluate(() => {
      window.auditRaw.Gear=0;window.auditRaw.SpeedMetersPerSecond=-4.5;window.auditRaw.CurrentEngineRpm=1400;
      window.auditFeed=setInterval(()=>{window.auditRaw.TimestampMS+=16;window.dispatchEvent(new CustomEvent('telemetry',{detail:{...window.auditRaw}}));},16);
    });
    await page.waitForTimeout(200); await record('host-reverse-reconnected', {gear:'R',speed:'16',status:'PI N/A'});
    await units({speed:'mph',boostPressure:'psi',temperature:'F'}); await record('host-imperial', {speed:'10'});
    await page.setViewportSize({width:1280,height:720}); await page.waitForTimeout(150);
    const small = await record('host-720p'); assert(small.state.bounds.x >= 0 && small.state.bounds.y >= 0 && small.state.bounds.x + small.state.bounds.width <= 1280 && small.state.bounds.y + small.state.bounds.height <= 720);
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,elements:{...config.elements,showGauge:false}}})),config);
    await page.waitForTimeout(100); assert.equal((await record('host-gauge-hidden')).state.bounds.display,'none');
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:config})),config);
    await page.waitForTimeout(100); assert.notEqual((await record('host-gauge-restored')).state.bounds.display,'none');
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:{...config,hudStyle:'simple'}})),config); await page.waitForTimeout(250);
    await page.evaluate(config=>window.dispatchEvent(new CustomEvent('hud:config',{detail:config})),config); await page.waitForTimeout(1800);
    const { frame }=await record('host-style-reloaded', {status:'PI N/A'});
    await frame.evaluate(()=>window.postMessage({type:'hud:destroy'},'*')); await page.waitForTimeout(500);
    samples.push({name:'destroy',remainingBodyChildren:await frame.evaluate(()=>document.body.childElementCount)});
    assert.equal(samples.at(-1).remainingBodyChildren,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    await verifyStatus({ browser, origin: 'http://127.0.0.1:' + server.address().port, config, raw: parser.samples[0].parsedJson, out });
    await verifyMedia({ browser, origin: 'http://127.0.0.1:' + server.address().port, config, raw: parser.samples[0].parsedJson, out });
  } catch (error) { errors.push(String(error)); throw error; } finally {
    fs.writeFileSync(path.join(out,'host-audit.json'),JSON.stringify({style,parserFixtureProvenance:parser.provenance,errors,missing,samples},null,2));
    await browser.close();await new Promise(r=>server.close(r));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
