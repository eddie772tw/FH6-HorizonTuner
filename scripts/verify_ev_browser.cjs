// Opt-in browser smoke; run from the repository root with a separate Vite server.
// All backend HTTP and WebSocket traffic is mocked. No game UDP is sent.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
let browser, page;

(async () => {
  browser = await chromium.launch({headless:true,channel:process.env.EV_BROWSER_CHANNEL || 'msedge'});
  page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[]; page.on('pageerror', e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack)});
  page.setDefaultTimeout(10000);
  await page.addInitScript(()=>localStorage.setItem('fh6-data-out-guide/v1','skipped'));
  const profiles = {};
  let sockets=[];
  await page.routeWebSocket('**/*', socket=>{sockets.push(socket);socket.onClose(()=>sockets=sockets.filter(s=>s!==socket));});
  const settings={language:'en-us', developer_tuning_enabled:false, dyno_recording:false};
  await page.route('http://127.0.0.1:8001/**', async route=>{
    const req=route.request(), p=new URL(req.url()).pathname;
    let body={};
    if(p==='/api/runtime') body={platform:'windows', capabilities:{hudOverlay:false,audioSpectrum:false,systemMedia:false,localMotecLaunch:false},telemetry:{port:8000,listenAddresses:['127.0.0.1'],error:null}};
    else if(p==='/api/settings') body=settings;
    else if(p==='/api/languages') body=[];
    else if(p.startsWith('/api/languages/')) body=JSON.parse(fs.readFileSync(path.resolve('lang/zh-tw.json'),'utf8'));
    else if(p==='/api/cars/database') body={'3445':{display_name:'Taycan Turbo S'}};
    else if(p==='/api/cars/with_params') body=[{id:'3445',name:'Taycan Turbo S'}];
    else if(p.startsWith('/api/car_params/')) {
      const id=p.split('/').at(-1);
      if(req.method()==='POST') profiles[id]=JSON.parse(req.postData());
      body=profiles[id]??{weight:2200,weight_distribution:50,maxHp:751,maxTorque:1050,drivetrain:'AWD'};
    }
    else if(p==='/api/companion/host') body={commands:[]};
    else if(p.includes('/engine-observations') || p==='/api/road/compatibility' || p==='/api/road/workflows') body=[];
    else if(p==='/api/discord/status') body={};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(process.env.EV_PREVIEW_URL || 'http://127.0.0.1:1421');
  await page.getByRole('button',{name:'Tune',exact:true}).waitFor();
  const replay=JSON.parse(fs.readFileSync('tests/fixtures/ev_taycan_replay.json','utf8'));
  const makeFrame=row=>({...Object.fromEntries(replay.columns.map((k,i)=>[k,row[i]])),AccelerationX:0,AccelerationY:0,AccelerationZ:0,
    VelocityX:0,VelocityY:0,VelocityZ:0,Yaw:0,NormalizedSuspensionTravel:[0,0,0,0],TireSlipAngle:[0,0,0,0],TireTemp:[60,60,60,60]});
  const send=f=>sockets.forEach(s=>s.send(JSON.stringify(f)));
  send({...makeFrame(replay.runs[0].rows[0]),IsRaceOn:1});
  await page.getByRole('button',{name:'Tune',exact:true}).click();
  await page.getByText('Taycan Turbo S · 3445').waitFor();
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
  assert.equal(profiles['3445'].isElectric,true);
  assert.deepEqual(profiles['3445'].evGearbox.gearRatios,[4,2]);
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
  assert.equal(profiles['3445'].evGearbox.finalDrive,null);
  assert.deepEqual(profiles['3445'].evGearbox.gearRatios,[null]);
  assert.deepEqual(profiles['3445'].evGearbox.gearAdjustable,[false]);
  await page.getByRole('button',{name:'1. Goal & Setup',exact:true}).click();
  await page.getByRole('switch',{name:'EV powertrain'}).uncheck();
  assert.equal(await page.getByText('Gears Count',{exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'4. Setup verification',exact:true}).isDisabled(),true);
  await page.getByRole('switch',{name:'EV powertrain'}).check();
  await page.getByRole('button',{name:'3. Engine data & gearing',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:'Measured EV baseline',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Calculate EV model',exact:true}).isDisabled(),true);
  settings.language='zh-tw';
  await page.reload();
  await page.getByRole('button',{name:'調校',exact:true}).waitFor();
  send({...makeFrame(replay.runs[0].rows[0]),IsRaceOn:1});
  await page.getByRole('button',{name:'調校',exact:true}).click();
  await page.getByText('Taycan Turbo S · 3445').waitFor();
  await page.getByRole('heading',{name:'EV 量測與齒比 基礎模型',exact:true}).waitFor();
  assert.equal(await page.getByLabel('量測時的終傳比',{exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'計算 EV 模型',exact:true}).isDisabled(),true);
  await page.screenshot({path:'scratch/ev-zh-tw.png',fullPage:true});
  console.log(JSON.stringify({checks:'mode exclusivity, persisted profile reload, decoded replay, navigation lifetime, final-drive-only two-speed and locked unknown-ratio single-speed EV, verification gate, mode invalidation, 6 theme combinations, zh-tw labels',errors},null,2));
  await browser.close();
  assert.deepEqual(errors,[]);
})().catch(async e=>{console.error(e);if(page) console.log(await page.locator('body').innerText());if(browser) await browser.close();process.exit(1)});
