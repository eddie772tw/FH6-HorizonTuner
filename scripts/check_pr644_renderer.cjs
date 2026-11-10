const { chromium }=require('../scratch/browser-tools/node_modules/playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(__dirname,'../scratch/pr-644-visual-review');
fs.mkdirSync(out,{recursive:true});
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Users/eddie/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true});
const page=await browser.newPage();
// Load only the module graph: the output below is an isolated renderer probe.
await page.goto('http://localhost:1434');
const result=await page.evaluate(async()=>{
 const {drawChart,createChartLayout}=await import('/src/features/telemetry/components/TelemetryDetailPrimitives.tsx');
 const data=[{time:0,a:.8,b:.2},{time:1,a:.8,b:.2}];
 const lines=[{dataKey:'a',label:'A',color:'#00ff00'},{dataKey:'b',label:'B',color:'#ff0000'}];
 const layout=createChartLayout(data,lines,240,120);
 const theme={divider:'transparent',text:'transparent',font:'sans-serif',dash:[],flat:true};
 const render=(ls)=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=120;const ctx=canvas.getContext('2d');ctx.lineWidth=7;ctx.shadowBlur=9;ctx.shadowColor='#123456';drawChart(ctx,data,ls,layout,theme,getComputedStyle(document.documentElement),new Map());return {pixels:Array.from(ctx.getImageData(0,60,240,60).data),state:{lineWidth:ctx.lineWidth,shadowBlur:ctx.shadowBlur,shadowColor:ctx.shadowColor}}};
 const multi=render(lines),single=render([lines[1]]);
 return {sameSeriesPixels:multi.pixels.every((v,i)=>v===single.pixels[i]),stateRestored:multi.state.lineWidth===7&&multi.state.shadowBlur===9&&multi.state.shadowColor==='#123456',hasInk:multi.pixels.some((v,i)=>i%4===3&&v>0)};
});
assert(result.sameSeriesPixels,'A series changed appearance when rendered after another series');assert(result.stateRestored);assert(result.hasInk);
fs.writeFileSync(path.join(out,'renderer-checks.json'),JSON.stringify(result,null,2)+'\n');
console.log(result);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
