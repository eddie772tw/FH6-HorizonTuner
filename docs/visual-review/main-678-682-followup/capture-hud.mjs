import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.FH6_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
import fs from 'node:fs/promises';
const repo=fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, ''),out=repo+'/docs/visual-review/main-678-682-followup';
const browser=await chromium.launch({executablePath:process.env.FH6_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const [width,height,dpr] of [[1280,720,1],[640,180,1],[640,180,2]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
  await context.route('**/hud-source/**',async route=>{const path=new URL(route.request().url()).pathname.replace('/hud-source/','/');await route.fulfill({body:await fs.readFile(repo+path),contentType:'text/javascript'});});
  await context.route('**/renderer-fixture',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#0b111b;color:white"><div id="hud"></div></body></html>'}));
  const page=await context.newPage();await page.goto('http://127.0.0.1:1453/renderer-fixture');
  const dimensions=await page.evaluate(async ({height})=>{
   const {createTelemetryCardsManager}=await import('/hud-source/hud_overlay/shared/telemetry-cards/manager.js');
   const manager=createTelemetryCardsManager();manager.init(document.getElementById('hud'));
   const config={telemetryOpacity:1,telemetryCornerOffsetY:height===720?160:200,telemetryCornerOffsetX:height===720?0:-200,elements:{showTeleMaster:true,showTeleSuspension:true,showTeleTires:false,showTeleTiresSlip:false,showTeleTiresTemp:false,showTeleAttitude:false,showTelePedals:false,showPowerTorque:false,showTeleCompass:false,showTeleCenterAnchor:false}};
   for(let i=0;i<150;i++)manager.update({susp_fl:i===149?1:(0.5+0.4*Math.sin(i*.1))},config);
   const canvas=document.getElementById('tcSuspWaveFL');const panel=document.getElementById('tcSuspBlockFL');const box=panel.getBoundingClientRect();
   return {canvas:{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight},box:{x:box.x,y:box.y,width:box.width,height:box.height}};
  },{height});
  const panel=page.locator('#tcSuspBlockFL');await panel.screenshot({path:out+`/suspension-${width}x${height}-dpr${dpr}.png`});
  results.push({width,height,dpr,...dimensions});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 await fs.writeFile(out+'/hud-results.json',JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();}
