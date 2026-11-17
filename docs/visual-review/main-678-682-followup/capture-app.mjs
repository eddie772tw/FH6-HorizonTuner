import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.FH6_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
import fs from 'node:fs/promises';
const repo=fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const out=repo+'/docs/visual-review/main-678-682-followup';
await fs.mkdir(out,{recursive:true});
const dicts=Object.fromEntries(await Promise.all(['en-us','zh-tw','ja-jp'].map(async lang=>[lang,JSON.parse(await fs.readFile(repo+'/lang/'+lang+'.json','utf8'))])));
const browser=await chromium.launch({executablePath:process.env.FH6_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try {
for(const [core,mode,language,width] of [['default','light','en-us',1280],['default','dark','zh-tw',320],['swiss','light','zh-tw',1280],['swiss','dark','ja-jp',1280],['rhine-lab','light','ja-jp',1280],['rhine-lab','dark','en-us',1280]]){
 const theme={halfmoonCore:core,mode,primaryColor:'#00f0ff',secondaryColor:'#ff003c',accentColor:'#7000ff',customCSS:''};
 const context=await browser.newContext({viewport:{width,height:width===320?800:720},reducedMotion:'reduce'});
 await context.addInitScript(t=>{localStorage.setItem('themeSettings',JSON.stringify(t));localStorage.setItem('fh6-data-out-guide/v1','skipped');},theme);
 await context.routeWebSocket('**/ws/**',()=>{});
 let releaseReset; let failReset=true; let overlay={enabled:false,hudStyle:'simple',selectedMonitorIndex:0};
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), path=url.pathname;
  let data={}; let status=200;
  if(path==='/api/runtime')data={platform:'windows',capabilities:{hudOverlay:true,audioSpectrum:true,systemMedia:true,localMotecLaunch:true},telemetry:{port:8000,listenAddresses:['127.0.0.1'],error:null}};
  else if(path==='/api/settings')data={language,theme,auto_check_updates:false};
  else if(path==='/api/languages')data=Object.keys(dicts).map(code=>({code,name:code}));
  else if(path.startsWith('/api/languages/'))data=dicts[path.split('/').pop()];
  else if(path==='/api/overlay/config'){
   if(route.request().method()==='POST'){
    await new Promise(resolve=>{releaseReset=resolve});
    if(failReset){status=500;data={error:'Fixture: saving failed'};}else {overlay=route.request().postDataJSON();data={status:'success'};}
   } else data=overlay;
  }
  else if(path==='/api/analysis/status')data={isRecording:false,recordingCount:0,currentSessionId:null};
  else if(path==='/api/analysis/sessions')data=[{filename:'fixture.csv',session_id:'fixture',car_name:'Review fixture',total_laps:2,best_lap_time:0,size:123,mtime:1794880000}];
  else if(path.endsWith('/laps'))data=[{lap_number:1,lap_time:0,max_speed_kmh:-1,start_distance:0,end_distance:100,is_estimated:true},{lap_number:2,lap_time:84.32,max_speed_kmh:245,start_distance:100,end_distance:200,is_estimated:false}];
  else if(path==='/api/road/workflows')data=[];
  else if(path==='/api/companion/status')data={enabled:false,clients:[]};
  else if(path==='/api/cars/with_params'||path==='/api/cars/database'||path==='/api/audio/devices'||path==='/api/hud/styles'||path.endsWith('/routes')||path==='/api/analysis/data'||path==='/api/analysis/sessions/fixture')data=[];
  await route.fulfill({status,json:data});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1453/'); console.log('loaded',core,mode); await page.keyboard.press('Escape');
 const t=key=>dicts[language][key]??key;
 await page.getByRole('button',{name:t('HUD'),exact:true}).click();
 await page.getByRole('tab',{name:t('General'),exact:true}).click();console.log('general');
 const reset=()=>page.getByRole('button',{name:t('Reset HUD Settings'),exact:true});
 await reset().click();
 await page.getByRole('button',{name:t('Cancel'),exact:true}).waitFor();
 // A dialog above a pending confirmation must retain its own Escape behavior.
 await page.getByRole('button',{name:t('HUD'),exact:true}).focus();
 await page.keyboard.press('Escape');
 if(!await page.getByRole('button',{name:t('Cancel'),exact:true}).isVisible())throw Error('Outside Escape dismissed reset');
 await page.getByRole('button',{name:t('Cancel'),exact:true}).click();
 if(await reset().evaluate(el=>document.activeElement!==el))throw Error('Cancel did not restore focus');
 await reset().click(); await reset().click();console.log('reset requested');
 await page.waitForFunction(()=>document.querySelector('fieldset.hud-settings-form[aria-busy]')?.getAttribute('aria-busy')==='true');
 await page.screenshot({path:out+`/${core}-${mode}-${language}-${width}-saving.png`});
 releaseReset();
 await page.waitForFunction(()=>document.querySelector('fieldset.hud-settings-form[aria-busy]')?.getAttribute('aria-busy')==='false');
 if(!await page.getByRole('button',{name:t('Cancel'),exact:true}).isVisible())throw Error('Failed reset closed confirmation');
 failReset=false;await reset().click();
 await page.waitForFunction(()=>document.querySelector('fieldset.hud-settings-form[aria-busy]')?.getAttribute('aria-busy')==='true');
 releaseReset();
 await page.getByRole('button',{name:t('Cancel'),exact:true}).waitFor({state:'hidden'});
 await page.getByRole('button',{name:t('Sessions'),exact:true}).click();console.log('sessions');
 const select=page.getByRole('combobox',{name:t('Select Session'),exact:true});
 await select.selectOption('fixture.csv');
 const primary=page.getByRole('combobox',{name:t('Primary Lap'),exact:true});
 await primary.locator('option[value="1"]').waitFor({state:'attached'});
 const label=await primary.locator('option[value="1"]').textContent();
 if(label.includes('0.00s')||label.includes('-1 km/h'))throw Error('Invalid lap data leaked');
 await primary.selectOption('1'); await page.screenshot({path:out+`/${core}-${mode}-${language}-${width}-sessions.png`});
 const bounds=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 results.push({core,mode,language,width,label,bounds,errors});
 console.log(JSON.stringify(results.at(-1)));await context.close();
}
await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2)+'\n');
} finally {
 await browser.close();
}
