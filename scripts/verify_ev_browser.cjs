// Opt-in browser smoke; run from the repository root with a separate Vite server.
// HTTP uses a fresh Rust process and isolated data directory. Only decoded WebSocket replay is injected. No game UDP is sent.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const dataDir = fs.mkdtempSync(path.resolve('scratch/ev-browser-'));
const errors = [];
let browser, page, backend, backendUrl, sockets = [], latestWorkflow;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startBackend() {
  const portFile = path.join(dataDir, 'logs/web_port.txt');
  fs.rmSync(portFile, {force:true});
  const log = fs.openSync(path.join(dataDir, 'process.log'), 'a');
  backend = spawn(process.env.EV_BACKEND_EXE || path.resolve('backend-rust/target/debug/server-sidecar.exe'),
    ['--data-dir', dataDir, '--port', '0'], {windowsHide:true, stdio:['pipe',log,log],
      env:{...process.env,TELEMETRY_IP:'127.0.0.1',TELEMETRY_PORT:'0'}});
  fs.closeSync(log);
  backend.on('error', error => errors.push(error.message));
  for(let attempt=0;attempt<150;attempt++) {
    if(fs.existsSync(portFile)) {
      backendUrl = `http://127.0.0.1:${fs.readFileSync(portFile,'utf8').trim()}`;
      try { await api('/api/settings'); return; } catch {}
    }
    if(backend.exitCode !== null) throw new Error(`Backend exited: ${backend.exitCode}; see ${dataDir}`);
    await delay(100);
  }
  throw new Error(`Backend startup timed out; see ${dataDir}`);
}
async function stopBackend() {
  if(!backend || backend.exitCode !== null) return;
  const processToStop = backend;
  const stopped = once(processToStop, 'exit');
  processToStop.stdin.end();
  const timer = setTimeout(()=>processToStop.kill(),5000);
  await stopped;
  clearTimeout(timer);
  backend = null;
}
async function api(endpoint, body) {
  const response = await fetch(backendUrl+endpoint, body === undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result = await response.json();
  assert.ok(response.ok, `${endpoint}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function openBrowser() {
  browser = await chromium.launch({headless:true,channel:process.env.EV_BROWSER_CHANNEL || 'msedge'});
  page = await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror', e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack)});
  page.setDefaultTimeout(20000);
  await page.addInitScript(()=>localStorage.setItem('fh6-data-out-guide/v1','skipped'));
  sockets = [];
  await page.routeWebSocket('**/*', socket=>{sockets.push(socket);socket.onClose(()=>sockets=sockets.filter(s=>s!==socket));});
  // Only decoded telemetry is injected. Every HTTP result comes from this owned Rust process.
  await page.route('http://127.0.0.1:8001/**', async route=>{
    const req=route.request(), url=new URL(req.url());
    const response = await route.fetch({url:backendUrl+url.pathname+url.search});
    if(url.pathname==='/api/tuning/workflow' && response.ok()) {
      const value = await response.json();
      if(value.recommendation) latestWorkflow = value;
    }
    await route.fulfill({response});
  });
  await page.goto(process.env.EV_PREVIEW_URL || 'http://127.0.0.1:1421');
}
(async () => {
  await startBackend();
  await api('/api/settings', {language:'en-us',developer_tuning_enabled:false,dyno_recording:false});
  await api('/api/car_params/3445', {weight:2200,weight_distribution:50,maxHp:751,maxTorque:1050,drivetrain:'AWD'});
  await openBrowser();
  await page.getByRole('button',{name:'Tune',exact:true}).waitFor();
  const replay=JSON.parse(fs.readFileSync('tests/fixtures/ev_taycan_replay.json','utf8'));
  const makeFrame=row=>({...Object.fromEntries(replay.columns.map((k,i)=>[k,row[i]])),AccelerationX:0,AccelerationY:0,AccelerationZ:0,
    VelocityX:0,VelocityY:0,VelocityZ:0,Yaw:0,NormalizedSuspensionTravel:[0,0,0,0],TireSlipAngle:[0,0,0,0],TireTemp:[60,60,60,60]});
  const send=f=>sockets.forEach(s=>s.send(JSON.stringify(f)));
  send({...makeFrame(replay.runs[0].rows[0]),IsRaceOn:1});
  await page.getByRole('button',{name:'Tune',exact:true}).click();
  await page.getByText(/Taycan.*3445/).waitFor();
  await page.getByRole('switch',{name:'EV powertrain'}).check();
  assert.equal(await page.getByText('Gears Count',{exact:true}).count(),0);
  await page.getByRole('button',{name:'3. Engine data & gearing',exact:true}).click();
  await page.getByLabel('Measured final drive',{exact:true}).fill('4.03');
  await page.getByLabel('Final drive is adjustable in game',{exact:true}).check();
  await page.getByLabel('Gear 1 · Ratio if shown',{exact:true}).fill('4.00');
  await page.getByRole('button',{name:'Add forward gear',exact:true}).click();
  await page.getByLabel('Gear 2 · Ratio if shown',{exact:true}).fill('2.00');
  await page.getByLabel('All forward gears and their adjustability match the current game setup.').check();
  await page.screenshot({path:'scratch/ev-before.png',fullPage:true});
  await page.getByRole('button',{name:'Start EV collection',exact:true}).click();
  for(let i=0;i<replay.runs[0].rows.length;i++){
    send(makeFrame(replay.runs[0].rows[i]));
    if(i%50===0) await new Promise(r=>setTimeout(r,10));
  }
  // Leave and return during collection to exercise the provider lifetime.
  await page.getByRole('button',{name:'2. Chassis & Tires',exact:true}).click();
  await page.getByRole('button',{name:'3. Engine data & gearing',exact:true}).click();
  await page.getByRole('button',{name:'Pause collection',exact:true}).click();
  await page.getByRole('button',{name:'Calculate EV model',exact:true}).click();
  await page.getByRole('heading',{name:'Measured EV baseline',exact:true}).waitFor();
  assert.equal((await api('/api/car_params/3445')).isElectric,true);
  assert.deepEqual((await api('/api/car_params/3445')).evGearbox.gearRatios,[4,2]);
  await page.screenshot({path:'scratch/ev-result-dark.png',fullPage:true});
  for(const mode of ['dark','light']) for(const core of ['default','modern','elegant']){
    await page.evaluate(({mode,core})=>{document.documentElement.dataset.bsTheme=mode;document.documentElement.dataset.bsCore=core},{mode,core});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.screenshot({path:'scratch/ev-result-light.png',fullPage:true});
  await page.getByText('Boundary speed',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'scratch/ev-result-detail.png',fullPage:true});
  await page.getByRole('button',{name:'4. Setup verification',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'4. Setup verification',exact:true}).getAttribute('aria-current'),'step');
  for(let attempt=0;!latestWorkflow && attempt<100;attempt++) await delay(100);
  assert.ok(latestWorkflow?.recommendation, 'UI must obtain an authoritative Rust recommendation');
  assert.equal(latestWorkflow.recommendation.formulaVersion,'rust/ev-measured-workflow-v1');
  const savedWorkflow = await api('/api/road/workflows', {
    identity:{ordinal:3445,performanceIndex:795,drivetrain:2},carName:'Taycan',
    event:{name:'EV replay acceptance',format:'circuit'},recommendation:latestWorkflow.recommendation});
  const savedDocuments = await api('/api/road/workflows/'+savedWorkflow.id);
  const savedGearing = await api('/api/tuning/ev-gearing', {
    evidenceId:latestWorkflow.recommendation.inputSnapshot.evidenceId,
    setup:(await api('/api/car_params/3445')).evGearbox,candidateFinalDrive:4.03});
  const savedSetup = (await api('/api/car_params/3445')).evGearbox;
  const savedEvidenceId = latestWorkflow.recommendation.inputSnapshot.evidenceId;
  // Single-speed contract: replay only the held-first-gear observations.
  // This verifies the workflow shape, not a real single-speed car calibration.
  await page.getByRole('button',{name:'3. Engine data & gearing',exact:true}).click();
  await page.getByRole('button',{name:'Remove last gear',exact:true}).click();
  await page.getByLabel('Final drive is adjustable in game',{exact:true}).uncheck();
  await page.getByLabel('Measured final drive',{exact:true}).fill('');
  await page.getByLabel('Gear 1 · Ratio if shown',{exact:true}).fill('');
  await page.getByLabel('All forward gears and their adjustability match the current game setup.').check();
  assert.equal(await page.getByLabel('Candidate final drive',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Start EV collection',exact:true}).click();
  for(let i=0;i<replay.runs[0].rows.length;i++){
    const f=makeFrame(replay.runs[0].rows[i]);
    if(f.Gear===1) send(f);
    if(i%50===0) await new Promise(r=>setTimeout(r,10));
  }
  await page.getByRole('button',{name:'Pause collection',exact:true}).click();
  await page.getByRole('button',{name:'Calculate EV model',exact:true}).click();
  await page.getByRole('heading',{name:'Measured EV baseline',exact:true}).waitFor();
  assert.equal(await page.locator('table').first().locator('tbody tr').count(),1);
  assert.equal(await page.getByRole('button',{name:'4. Setup verification',exact:true}).isEnabled(),true);
  assert.equal((await api('/api/car_params/3445')).evGearbox.finalDrive,null);
  assert.deepEqual((await api('/api/car_params/3445')).evGearbox.gearRatios,[null]);
  assert.deepEqual((await api('/api/car_params/3445')).evGearbox.gearAdjustable,[false]);
  await page.getByRole('button',{name:'1. Goal & Setup',exact:true}).click();
  await page.getByRole('switch',{name:'EV powertrain'}).uncheck();
  assert.equal(await page.getByText('Gears Count',{exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'4. Setup verification',exact:true}).isDisabled(),true);
  await page.getByRole('switch',{name:'EV powertrain'}).check();
  await page.getByRole('button',{name:'3. Engine data & gearing',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:'Measured EV baseline',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Calculate EV model',exact:true}).isDisabled(),true);
  await api('/api/settings',{language:'zh-tw'});
  await browser.close();
  await stopBackend();
  await startBackend();
  assert.deepEqual(await api('/api/road/workflows/'+savedWorkflow.id),savedDocuments);
  assert.deepEqual(await api('/api/tuning/ev-gearing', {
    evidenceId:savedEvidenceId,setup:savedSetup,candidateFinalDrive:4.03}),savedGearing);
  await openBrowser();
  await page.getByRole('button',{name:'調校',exact:true}).waitFor();
  send({...makeFrame(replay.runs[0].rows[0]),IsRaceOn:1});
  await page.getByRole('button',{name:'調校',exact:true}).click();
  await page.getByText(/Taycan.*3445/).waitFor();
  await page.getByRole('button',{name:'3. 動力與傳動',exact:true}).click();
  await page.getByRole('heading',{name:'EV 量測與齒比 基礎模型',exact:true}).waitFor();
  assert.equal(await page.getByLabel('量測時的終傳比',{exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'計算 EV 模型',exact:true}).isDisabled(),true);
  await page.screenshot({path:'scratch/ev-zh-tw.png',fullPage:true});
  const report = {checks:'Rust HTTP and saved evidence replay after process restart, mode exclusivity, persisted profile reload, decoded replay, navigation lifetime, final-drive-only two-speed and locked unknown-ratio single-speed contract, verification gate, mode invalidation, 6 theme combinations, zh-tw labels',errors};
  fs.writeFileSync(path.join(dataDir,'acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await browser.close();
  await stopBackend();
  console.log('Rust replay and restart artifacts:',dataDir);
  assert.deepEqual(errors,[]);
})().catch(async e=>{console.error(e);if(page) console.log(await page.locator('body').innerText());if(browser) await browser.close();await stopBackend();process.exit(1)});
