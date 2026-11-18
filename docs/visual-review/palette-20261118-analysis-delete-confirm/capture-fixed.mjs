import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.FH6_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
import fs from 'node:fs/promises';
const repo=fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const out=repo+'/docs/visual-review/palette-20261118-analysis-delete-confirm';
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
 let failDelete=true; let overlay={enabled:false,hudStyle:'simple',selectedMonitorIndex:0};
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), path=url.pathname;
  let data={}; let status=200;
  if(path==='/api/runtime')data={platform:'windows',capabilities:{hudOverlay:true,audioSpectrum:true,systemMedia:true,localMotecLaunch:true},telemetry:{port:8000,listenAddresses:['127.0.0.1'],error:null}};
  else if(path==='/api/settings')data={language,theme,auto_check_updates:false};
  else if(path==='/api/languages')data=Object.keys(dicts).map(code=>({code,name:code}));
  else if(path.startsWith('/api/languages/'))data=dicts[path.split('/').pop()];
  else if(path==='/api/overlay/config')data=overlay;
  else if(path.startsWith('/api/analysis/sessions/') && route.request().method()==='DELETE'){status=failDelete?500:200;data=failDelete?{error:'Fixture: delete failed'}:{status:'success'};}
  else if(path==='/api/analysis/status')data={isRecording:false,recordingCount:0,currentSessionId:null};
  else if(path==='/api/analysis/sessions')data=[{filename:'fixture.csv',session_id:'fixture',car_name:'Review fixture',total_laps:2,best_lap_time:0,size:123,mtime:1794880000}];
  else if(path.endsWith('/laps'))data=[{lap_number:1,lap_time:0,max_speed_kmh:-1,start_distance:0,end_distance:100,is_estimated:true},{lap_number:2,lap_time:84.32,max_speed_kmh:245,start_distance:100,end_distance:200,is_estimated:false}];
  else if(path==='/api/road/workflows')data=[];
  else if(path==='/api/companion/status')data={enabled:false,clients:[]};
  else if(path==='/api/cars/with_params'||path==='/api/cars/database'||path==='/api/audio/devices'||path==='/api/hud/styles'||path.endsWith('/routes')||path==='/api/analysis/data'||path==='/api/analysis/sessions/fixture')data=[];
  await route.fulfill({status,json:data});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1454/'); console.log('loaded',core,mode); await page.keyboard.press('Escape');
 const t=key=>dicts[language][key]??key;
 await page.getByRole('button',{name:t('Sessions'),exact:true}).click();console.log('sessions');
 const select=page.getByRole('combobox',{name:t('Select Session'),exact:true});
 await select.selectOption('fixture.csv');

 const trigger=()=>page.getByRole('button',{name:t('Delete selected session'),exact:true});
 await trigger().click();
 await page.getByRole('button',{name:t('Cancel'),exact:true}).waitFor();
 await page.screenshot({path:out+`/${core}-${mode}-${language}-${width}-confirm-fixed.png`});
 await page.keyboard.press('Escape');
 if(await trigger().evaluate(el=>document.activeElement!==el))throw Error('Escape did not restore focus');
 await trigger().click();
 await page.getByRole('group').getByRole('button',{name:t('Delete'),exact:true}).click();
 await page.getByRole('alert').filter({hasText:t('Failed to delete session.')}).waitFor();
 const errorText=await page.getByRole('alert').filter({hasText:t('Failed to delete session.')}).innerText();
 await page.screenshot({path:out+`/${core}-${mode}-${language}-${width}-error-fixed.png`});
 failDelete=false;
 await trigger().click();
 await page.getByRole('group').getByRole('button',{name:t('Delete'),exact:true}).click();
 await page.getByRole('status').filter({hasText:t('Session deleted.')}).waitFor({state:'attached'});
 const statusText=await page.locator('.analysis-toolbar .visually-hidden[role="status"]').innerText();
 const bounds=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 results.push({core,mode,language,width,errorText,statusText,bounds,errors});
 console.log(JSON.stringify(results.at(-1)));await context.close();
}
await fs.writeFile(out+'/fixed-browser-results.json',JSON.stringify(results,null,2)+'\n');
} finally {
 await browser.close();
}
