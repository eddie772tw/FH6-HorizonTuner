/* Actual Launcher + Coordinator status carousel; browser clock controls only elapsed test time. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
async function verifyStatus({browser,origin,config,raw,out}){
 const report={catalogSource:'backend/car_database.json display_name for ordinals1260/4084; actual existing catalog values',scope:'Actual Launcher/Coordinator with raw UDP-shaped frames, live media and socket events; synthetic traffic, not native game acceptance',runs:[]};
 for(const [width,height,dpr,scale]of[[1280,720,1,1],[1920,1080,2,1],[1280,720,1,.8],[1920,1080,2,.8]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});const page=await context.newPage(),errors=[],samples=[];let frame,stamp=1000;
  const tag=`${width}x${height}-dpr${dpr}-scale${scale}`;
  const packet={...raw,TimestampMS:stamp,CarOrdinal:1260,CarClass:5,CarPerformanceIndex:850,CurrentLap:0,CurrentRaceTime:0,LapNumber:0,LastLap:0,BestLap:0,RacePosition:0};
  const media={success:true,state:'live',source:'winrt',has_media:true,title:'UDP independence fixture',artist:'Original test metadata',status:'paused',thumbnail_available:false};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/overlay/system_media',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(media)}));
  await page.addInitScript(()=>{class Socket{constructor(){this.readyState=1;setTimeout(()=>this.onopen?.({}),30);}send(){}close(){this.readyState=3;}}Socket.OPEN=1;window.WebSocket=Socket;});
  await page.clock.install({time:new Date('2026-10-05T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-05T00:00:01Z'));
  const status=()=>frame.evaluate(()=>{const n=document.getElementById('lfaStatus'),b=n.getBoundingClientRect(),s=getComputedStyle(n);return{text:n.textContent,kind:n.dataset.kind,pending:n.dataset.pending,title:n.title,width:n.clientWidth,scrollWidth:n.scrollWidth,fontSize:s.fontSize,overflow:s.overflow,textOverflow:s.textOverflow,box:{x:b.x,y:b.y,width:b.width,height:b.height},expanded:document.getElementById('lfaContainer').dataset.expanded};});
  async function feed(ms=100,patch={}){await page.clock.runFor(ms);stamp+=Math.max(1,ms);Object.assign(packet,patch,{TimestampMS:stamp});await page.evaluate(p=>window.dispatchEvent(new CustomEvent('telemetry',{detail:p})),packet);await page.clock.runFor(32);}
  async function capture(name,expected){const s=await status();if(expected)assert.equal(s.text,expected,name);assert.equal(s.overflow,'hidden');assert.equal(s.textOverflow,'ellipsis');samples.push({name,...s});await page.screenshot({path:path.join(out,`status-${name}-${tag}.png`),clip:await frame.locator('#lfaContainer').boundingBox(),omitBackground:true});return s;}
  async function slot(kind){for(let i=0;i<105;i++){if((await status()).kind===kind)return;await feed(100);}throw Error('Carousel failed to reach '+kind);}
  async function configure(patch){await page.evaluate(c=>window.dispatchEvent(new CustomEvent('hud:config',{detail:c})),{...config,scale,...patch});await page.clock.runFor(32);}
  try{
   await page.goto(origin+'/hud/index.html');await page.waitForFunction(()=>document.querySelector('#hud-iframe')?.contentWindow?.HUDCore?.getActiveStyle());frame=page.frames().find(f=>f.url().includes('/lfa_center_ring/index.html'));
   await configure({});await capture('initial-pending','Pending......');
   await configure({lfaManualExpand:true});
   for(let i=0;i<4;i++){await page.evaluate(data=>{window.dispatchEvent(new CustomEvent('ws:connected'));window.dispatchEvent(new CustomEvent('hud:media',{detail:data}));},media);await page.clock.runFor(500);}
   await capture('media-socket-without-udp','Pending......');await configure({lfaManualExpand:false});await page.clock.runFor(800);
   await feed();await capture('pi','S2 850');await slot('car');await capture('model','2010 Lexus LFA');await slot('brand');await capture('brand','crosXover');await slot('connection');await capture('live','LIVE');
   await feed(100,{CarOrdinal:4084});await capture('car-change-reset','S2 850');await slot('car');const long=await capture('long-model');assert.ok(long.text.includes('All Carbon Hillclimb Beast'));assert.ok(long.scrollWidth>long.width,'Known long model must exercise visible ellipsis');
   await configure({lfaManualExpand:true});for(let i=0;i<8;i++)await feed(100);await slot('car');await capture('long-model-expanded',long.text);
   // Keep socket and media alive while Coordinator continues RAF replay. None may refresh UDP health.
   for(let i=0;i<4;i++){await page.evaluate(data=>{window.dispatchEvent(new CustomEvent('ws:connected'));window.dispatchEvent(new CustomEvent('hud:media',{detail:data}));},media);await page.clock.runFor(500);}
   await capture('udp-stopped-media-alive','Pending......');
   await page.evaluate(p=>window.dispatchEvent(new CustomEvent('telemetry',{detail:p})),packet);await page.clock.runFor(100);await capture('replayed-pending','Pending......');
   await page.evaluate(p=>window.dispatchEvent(new CustomEvent('telemetry',{detail:{...p,TimestampMS:p.TimestampMS-100,CarOrdinal:1260}})),packet);await page.clock.runFor(100);await capture('out-of-order-pending','Pending......');
   await feed(100,{CarOrdinal:999});await capture('reconnected-reset','S2 850');await slot('car');await capture('unknown-car','CAR N/A');
   await feed(100,{CarOrdinal:1260,CarClass:0,CarPerformanceIndex:100});await capture('class-d','D 100');await feed(100,{CarPerformanceIndex:0});await capture('invalid-pi','PI N/A');
   await feed(100,{CarClass:5,CarPerformanceIndex:850,CurrentLap:1,CurrentRaceTime:1,RacePosition:3});await feed(500,{CurrentLap:1.5,CurrentRaceTime:1.5});await capture('race-priority','P3');
   await page.clock.runFor(1700);await capture('race-grace-udp-stale','Pending......');
   await feed(100,{CurrentLap:null,RacePosition:0});await capture('reconnect-during-race-grace','LIVE');
   for(let i=0;i<4;i++)await feed(500);await capture('idle-after-race-grace','S2 850');
   await feed(100,{CurrentLap:2,CurrentRaceTime:2,RacePosition:3});await feed(500,{CurrentLap:2.5,CurrentRaceTime:2.5});await capture('race-reconfirmed','P3');
   await feed(100,{CurrentLap:0,CurrentRaceTime:3,LapNumber:1,LastLap:85,BestLap:85});await capture('lap-notice','BEST LAP');
   for(let i=0;i<4;i++)await feed(500,{CurrentLap:null,RacePosition:0});await capture('notice-after-race-end','BEST LAP');
   for(let i=0;i<3;i++)await feed(400);assert.notEqual((await status()).text,'BEST LAP');await capture('notice-expired-carousel');
   await feed(100,{CurrentLap:0,CurrentRaceTime:0,LapNumber:0,LastLap:0,BestLap:0,RacePosition:0});
   await page.clock.runFor(1700);await capture('free-roam-outage','Pending......');
   stamp=0;packet.TimestampMS=0;await page.evaluate(p=>window.dispatchEvent(new CustomEvent('telemetry',{detail:p})),packet);await page.clock.runFor(32);
   await capture('free-roam-restart-baseline','Pending......');await feed(100);await capture('free-roam-restart-recovered','S2 850');
   assert.deepEqual(errors,[]);report.runs.push({width,height,dpr,scale,samples,errors,passed:true});
  }catch(error){await page.screenshot({path:path.join(out,`status-failure-${tag}.png`)}).catch(()=>{});report.runs.push({width,height,dpr,scale,samples,errors,passed:false,error:String(error)});throw error;}
  finally{fs.writeFileSync(path.join(out,'status-report.json'),JSON.stringify(report,null,2));await context.close();}
 }
}
module.exports={verifyStatus};
