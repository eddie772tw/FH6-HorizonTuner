const { chromium } = require('../scratch/browser-tools/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/visual-review/pr-644');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Users/eddie/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true });
  const results = [];
  const cases = ['default','modern','elegant','swiss','swiss-editorial','swiss-contrast','rhine-lab'].flatMap(core => ['light','dark'].map(mode => ({core,mode,width:1280})));
  for (const core of ['default','swiss','rhine-lab']) cases.push({core, mode:'dark', width:320});
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i], lang = ['en-us','zh-tw','ja-jp'][i % 3];
    const page = await browser.newPage({viewport:{width:c.width,height:720}, deviceScaleFactor:1, reducedMotion:i % 2 ? 'reduce' : 'no-preference'});
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    const theme={halfmoonCore:c.core,mode:c.mode,primaryColor:'#00f0ff',secondaryColor:'#ff003c',accentColor:'#7000ff',customCSS:''};
    await page.addInitScript(theme => localStorage.setItem('themeSettings',JSON.stringify(theme)), theme);
    await page.route('http://127.0.0.1:8001/**', async route => {
      const u = new URL(route.request().url()); let body={};
      if (u.pathname==='/api/runtime') body={platform:'windows',capabilities:{hudOverlay:false,audioSpectrum:false,systemMedia:false,localMotecLaunch:false},telemetry:{port:8000,listenAddresses:['127.0.0.1'],error:null}};
      else if(u.pathname==='/api/settings') body={language:lang,theme};
      else if(u.pathname==='/api/languages') body=['en-us','zh-tw','ja-jp'];
      else if(u.pathname.startsWith('/api/languages/')) body=JSON.parse(fs.readFileSync(path.join(root,'lang',u.pathname.split('/').pop()+'.json'),'utf8'));
      else if(/list|cars|sessions|presets|styles/.test(u.pathname)) body=[];
      else if(u.pathname.includes('recording')) body={is_recording:false};
      await route.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await page.routeWebSocket('**/ws/**', ws => {});
    await page.goto('http://localhost:1434', {timeout:120000});
    await page.locator('#suspension-card-title').waitFor();
    await page.locator('.modal.show .btn-close').click();
    await page.locator('.modal-backdrop').waitFor({state:'hidden'});
    await page.evaluate(async () => {
      const {telemetryHistoryStore} = await import('/src/features/telemetry/telemetryHistory.ts');
      for(let i=0;i<90;i++) telemetryHistoryStore.record({IsRaceOn:1,CarOrdinal:1,TimestampMS:i*200,
        NormalizedSuspensionTravel:[0.5+0.25*Math.sin(i*.2),0.4+0.18*Math.cos(i*.3),0.35+0.12*Math.sin(i*.3),0.6+0.22*Math.cos(i*.15)],
        TireTemp:[75+i*.1,80+i*.08,85+i*.06,90+i*.04],TireSlipRatio:[.1,.2,.3,.4],TireSlipAngle:[.02,.03,.04,.05],TireCombinedSlip:[.2,.3,.4,.5],SurfaceRumble:[.1,.15,.2,.25],
        AccelerationX:Math.sin(i*.15),AccelerationY:Math.cos(i*.2),AccelerationZ:.1,Pitch:.02,Roll:.04,Yaw:.06,SpeedMetersPerSecond:40+i*.1,CurrentEngineRpm:4500+i*10,PowerWatts:150000+i*100,TorqueNewtons:350+i,Boost:100000+i*100,Gear:4,EngineMaxRpm:8500,EngineIdleRpm:800});
    });
    await page.locator('section[aria-labelledby="suspension-card-title"] .telemetry-card-shell__expand').click();
    await page.locator('.telemetry-detail-view__chart canvas').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const save=['default','swiss','rhine-lab'].includes(c.core);
    const file=`${c.core}-${c.mode}-${lang}-${c.width}.png`;
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert(!overflow, `${file}: document overflow`);
    const canvases=await page.locator('.telemetry-detail-view__chart canvas').evaluateAll(nodes=>nodes.map(el=>({width:el.width,height:el.height,hasInk:el.getContext('2d').getImageData(0,0,el.width,el.height).data.some((x,i)=>i%4===3&&x>0)})));
    assert(canvases.length && canvases.every(c=>c.hasInk),`${file}: empty chart`);
    await page.locator('.telemetry-detail-view__chart').first().scrollIntoViewIfNeeded();
    if(save) {
      await page.screenshot({path:path.join(out,file)});
      await page.locator('.telemetry-detail-view__chart').first().screenshot({path:path.join(out,'chart-'+file)});
    }
    results.push({...c,lang,file:save?file:null,chartFile:save?'chart-'+file:null,overflow,canvases,errors});
    assert.equal(errors.length,0,JSON.stringify(errors));
    if(i===0 && process.env.FH6_CAPTURE_DETAIL_PANELS === '1') {
      for(const id of ['tires','dynamics']) {
        await page.keyboard.press('Escape');
        await page.locator(`section[aria-labelledby="${id}-card-title"] .telemetry-card-shell__expand`).click();
        const charts=page.locator('.telemetry-detail-view__chart');
        for(let j=0;j<await charts.count();j++) {
          await charts.nth(j).scrollIntoViewIfNeeded();
          await charts.nth(j).screenshot({path:path.join(out,`${id}-chart-${j}.png`)});
        }
        await charts.first().scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(out,`${id}-page.png`)});
      }
    }
    await page.close();
    console.log(file);
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({date:'2026-11-10',implementation:'86a3cb96a8afdeb540357ba4a2e39b3727a7860f + reviewed line-width/shadow repair',browser:browser.version(),environment:'Windows Chromium headless; real AppShell/providers/renderer; route-isolated HTTP backend; synthetic history fixture; DPR 1; zoom 100%; full-page screenshots except labelled chart crops. No game/device acceptance.',cases:results},null,2)+'\n');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
