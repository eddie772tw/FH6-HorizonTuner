// Actual sandboxed Chrome pixels; controlled source packets and presentation clock.
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
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.otf':'font/otf' };
const server = createServer(async (req,res) => {
  try { const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(target);res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const report={runtime:'Sandboxed Chrome, controlled source telemetry/clock; not Windows native/game acceptance',screenshots:[],checks:[],errors:[]};
const base={IsRaceOn:1,CarOrdinal:12,CurrentRaceTime:70,LapNumber:1,CurrentEngineRpm:6400,EngineMaxRpm:8000,SpeedMetersPerSecond:50,Gear:4,Boost:14.5038,TireTemp:[194,203,212,221],CurrentLap:12.3,LastLap:58.45,BestLap:57.6,RacePosition:2,PowerWatts:223710,TorqueNewtons:400,AccelInput:200,BrakeInput:0};
const elements={showGauge:true,showRPM:true,showCenterInfo:true,showSpeed:true,showGear:true,showBoost:true};
let browser, now=0, stamp=10000;
async function config(page,data={}) {await page.evaluate(data=>window.HUDCore.handleMessage('config',{data}),{scale:1,elements,...data});}
async function frame(page,extra={},step=100) {
  now+=step;stamp+=Math.max(1,step);
  await page.evaluate(({data,now})=>{window.fixtureNow=now;window.HUDCore.handleMessage('hud:frame',{data});},{data:{...base,...extra,TimestampMS:stamp},now});
}
async function runFor(page,duration,extra={}) {for(let n=0;n<duration;n+=100)await frame(page,typeof extra==='function'?extra(now+100):extra);}
async function capture(page,name) {
  const state=await page.locator('#stackCanvas').evaluate(c=>({...c.dataset,label:c.getAttribute('aria-label')}));
  await page.screenshot({path:path.join(out,name+'.png'),omitBackground:true});report.screenshots.push(name+'.png');report.checks.push({name,...state});return state;
}
const alarmSlots=[{enabled:true,metric:'tire_max',direction:'high',threshold:100},{enabled:true,metric:'boost',direction:'high',threshold:.8},{enabled:true,metric:'rpm',direction:'high',threshold:6000}];
try {
 browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 for(const [width,height,dpr]of[[1280,720,1],[1920,1080,1],[2560,1440,1],[1280,720,2]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{window.fixtureNow=0;Object.defineProperty(performance,'now',{value:()=>window.fixtureNow});});
  await page.goto(`http://127.0.0.1:${server.address().port}/stack_st8100/index.html`);await page.waitForFunction(()=>window.HUDCore?.getActiveStyle());await config(page);await frame(page);
  const normal=await capture(page,`metric-${width}x${height}-dpr${dpr}`);assert.equal(normal.lcd1,'KM/H 180 | GEAR 4');assert.equal(normal.lcd2,'TIME 1:10.00 | TYRE C 98');
  const box=await page.locator('#stackContainer').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
  const alignment=await page.locator('#stackContainer').evaluate(c=>{const canvas=c.querySelector('canvas').getBoundingClientRect(),mark=c.querySelector('svg').getBoundingClientRect();return{canvasWidth:canvas.width,markWidth:mark.width,rightMargin:canvas.right-mark.right,markVisible:getComputedStyle(c.querySelector('svg')).display!=='none'};});assert(alignment.markVisible&&alignment.markWidth>0&&alignment.rightMargin>=0);report.checks.push({name:'mark-containment',dpr,...alignment});
  if(width===1280){
   for(const face of['black','white']){
    await config(page,{stackSt8100Face:face});await frame(page);await capture(page,`face-${face}-dpr${dpr}`);
    await page.locator('#stackContainer').screenshot({path:path.join(out,`detail-${face}-dpr${dpr}.png`),omitBackground:true});report.screenshots.push(`detail-${face}-dpr${dpr}.png`);
   }
   await config(page,{scale:.7});await frame(page);await capture(page,`compact-white-dpr${dpr}`);
   await config(page,{scale:1,stackSt8100Face:'black',stackSt8100Field2:'boost',stackSt8100Field3:'power',stackSt8100Field4:'torque',effectiveUnits:{speed:'mph',boostPressure:'psi',power:'kw',torque:'lbft'}});await frame(page,{Boost:-7.2519});
   const units=await capture(page,`units-dpr${dpr}`);assert.equal(units.lcd1,'MPH 112 | BST PSI -7.3');assert.equal(units.lcd2,'KW 224 | LBFT 295');
  }
  if(width===1280&&dpr===1){
   await config(page,{stackSt8100Field1:'speed',stackSt8100Field2:'gear',stackSt8100Field3:'race_time',stackSt8100Field4:'tire_avg',effectiveUnits:{speed:'kmh',boostPressure:'bar'},stackSt8100Face:'black'});
   for(const face of ['black','white']) for(const [dial,max]of[['0-3-8',8000],['0-4-10',10000],['0-3-10.5',10500],['0-6-13',13000],['auto',10200]]){await config(page,{stackSt8100Dial:dial,stackSt8100Face:face});await frame(page,{EngineMaxRpm:max,CurrentEngineRpm:max*.8});await capture(page,`profile-${face}-${dial.replaceAll('.','_')}`);}
   await config(page,{stackSt8100Dial:'0-3-8',stackSt8100Face:'black'});await frame(page,{EngineMaxRpm:10000,CurrentEngineRpm:8200});assert.equal((await capture(page,'fixed-face-no-premature-shift')).shift,'false');
   await frame(page,{EngineMaxRpm:10000,CurrentEngineRpm:9200});assert.equal((await capture(page,'fixed-face-shift')).shift,'true');await config(page,{stackSt8100Dial:'auto'});await frame(page,{EngineMaxRpm:16000,CurrentEngineRpm:15000});await capture(page,'over-range');
   await config(page,{stackSt8100Page:'peaks'});await frame(page);await capture(page,'tell-tales');await config(page,{stackSt8100Page:'live'});
   // Real renderer receives advancing packets while the test clock steps deterministically.
   const begin=now;await frame(page,{CurrentLap:10});await runFor(page,2600,t=>({CurrentLap:10+(t-begin)/1000}));assert.equal((await capture(page,'timing-page')).page,'timing');
   await runFor(page,2500,t=>({CurrentLap:10+(t-begin)/1000}));assert.equal((await capture(page,'timing-base-page')).page,'base');
   await config(page,{stackSt8100Alarms:alarmSlots});await runFor(page,700,t=>({CurrentLap:10+(t-begin)/1000}));const active=await capture(page,'alarm-slot-1');assert.equal(active.phase,'alarm');assert.equal(active.alarmSlot,'1');
   const lapOrigin=now;await frame(page,{CurrentLap:.1,LastLap:57.1,LapNumber:2});assert.equal((await capture(page,'lap-queued-during-warning')).phase,'alarm');
   await runFor(page,2300,t=>({CurrentLap:(t-lapOrigin)/1000,LastLap:57.1,LapNumber:2}));assert.equal((await capture(page,'information-between-warning-and-lap')).phase,'info');
   await runFor(page,2500,t=>({CurrentLap:(t-lapOrigin)/1000,LastLap:57.1,LapNumber:2}));assert.equal((await capture(page,'lap-replaces-next-warning')).phase,'lap');
   await runFor(page,2500,t=>({CurrentLap:(t-lapOrigin)/1000,LastLap:57.1,LapNumber:2}));await capture(page,'information-after-lap');await runFor(page,2500,t=>({CurrentLap:(t-lapOrigin)/1000,LastLap:57.1,LapNumber:2}));assert.equal((await capture(page,'alarm-slot-2-after-lap')).alarmSlot,'2');
   await config(page,{stackSt8100Alarms:[]});await frame(page,{CurrentLap:10,LastLap:57.1,LapNumber:2});await frame(page,{CurrentLap:10.1,LastLap:57.1,LapNumber:2});await frame(page,{CurrentLap:.1,LastLap:56.9,LapNumber:3});assert.equal((await capture(page,'lap-popup-no-alarm')).phase,'lap');
   await runFor(page,2500,{CurrentLap:2.6,LastLap:56.9,LapNumber:3});assert.equal((await capture(page,'lap-popup-resumed')).phase,'info');
   await frame(page,{CurrentEngineRpm:null,EngineMaxRpm:null,SpeedMetersPerSecond:null,Gear:null,TireTemp:null,CurrentRaceTime:null,CurrentLap:null,LastLap:null,BestLap:null,RacePosition:0});const missing=await capture(page,'missing-channels');assert.equal(missing.shift,'false');
   await frame(page,{IsRaceOn:0});assert.equal((await capture(page,'paused')).status,'PAUSED');await frame(page,{success:false});assert.equal((await capture(page,'data-error')).status,'DATA ERROR');
   await frame(page);await page.evaluate(({now,stamp,base})=>{window.fixtureNow=now;window.HUDCore.handleMessage('hud:frame',{data:{...base,TimestampMS:stamp}});},{now:now+=1600,stamp,base});assert.equal((await capture(page,'stale')).status,'NO SIGNAL');
   await frame(page);assert.equal((await capture(page,'reconnected')).status,'LIVE');
   await config(page,{elements:{...elements,showGauge:false}});assert.equal(await page.locator('#stackContainer').isVisible(),false);
   await page.evaluate(()=>window.postMessage({type:'hud:destroy'},'*'));await page.waitForFunction(()=>document.body.childElementCount===0);
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
}catch(error){report.errors.push(String(error));throw error;}
finally{await writeFile(path.join(out,'visual-evidence.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();await new Promise(resolve=>server.close(resolve));}
