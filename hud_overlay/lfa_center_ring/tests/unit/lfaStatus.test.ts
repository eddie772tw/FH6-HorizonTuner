import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const directory = resolve(process.cwd(), '../hud_overlay/lfa_center_ring');
const scope: any = {};
for (const file of ['lfa-status.js','lfa-catalog.js']) runInNewContext(readFileSync(resolve(directory,file),'utf8'),scope);
const S=scope.LfaStatus;
const idle={live:true,shift:false,status:'LIVE',racing:false,rank:null,notice:null};
const car={TimestampMS:100,CarOrdinal:10,CarClass:5,CarPerformanceIndex:850,CurrentRaceTime:50,LapNumber:0};
const catalog={'10':{display_name:'2012 Lexus LFA'},'11':{year:2020,make:'Maker',model:'Model'}};
function harness(){const state=S.create();let stamp=100;return{state,feed(now:number,patch:any={}){S.ingest(state,{...car,TimestampMS:++stamp,...patch},now);return S.view(state,idle,now,catalog);},view(now:number,context:any={}){return S.view(state,{...idle,...context},now,catalog);}};}

describe('LFA status identity and UDP-only carousel',()=>{
 it('validates all eight FH6 classes including D zero and never fabricates score zero',()=>{
  for(let c=0;c<8;c++){const h=harness();expect(h.feed(0,{CarClass:c,CarPerformanceIndex:100}).text).toBe(S.classes[c]+' 100');}
  for(const bad of [0,99,1000,'850',NaN,Infinity,null,1.2])expect(harness().feed(0,{CarPerformanceIndex:bad}).text).toBe('PI N/A');
  for(const bad of [-1,8,'0',NaN,null,1.2])expect(harness().feed(0,{CarClass:bad}).text).toBe('PI N/A');
 });
 it('advances four slots at monotonic three-second intervals while fresh UDP continues',()=>{
  const h=harness();expect(h.feed(0).text).toBe('S2 850');
  for(let n=1000;n<=12000;n+=1000){const v=h.feed(n);if(n%3000===0)expect(v.text).toBe(['2012 Lexus LFA','crosXover','LIVE','S2 850'][n/3000-1]);}
  expect(h.view(11900).text).toBe('S2 850');
 });
 it('initial, invalid timestamp and repeated frames stay Pending without car data',()=>{
  const h=harness();expect(h.view(0).text).toBe('Pending......');
  for(const value of [undefined,null,'1',-1,1.5,4294967296,NaN]){h.feed(0,{TimestampMS:value});expect(h.view(1).text).toBe('Pending......');}
  h.feed(10);S.ingest(h.state,{...car,TimestampMS:108,CarOrdinal:11},1400); // stale/out-of-order metadata cannot replace the accepted identity
  expect(h.view(1510).text).toBe('Pending......');expect(h.state.identity).toBeNull();
 });
 it('requires advancement after an initial real zero and rejects a timestamp-zero standby',()=>{
  const h=harness();h.feed(0,{TimestampMS:0});expect(h.view(0).text).toBe('Pending......');
  h.feed(100,{TimestampMS:0});expect(h.view(100).text).toBe('Pending......');
  expect(h.feed(200,{TimestampMS:1}).text).toBe('S2 850');
 });
 it('two advancing old timestamps after silence cannot restart without credible clock/lap or car reset',()=>{
  const h=harness();h.feed(0,{TimestampMS:50000});h.view(1600);
  h.feed(1700,{TimestampMS:49000});h.feed(1800,{TimestampMS:49100});expect(h.view(1800).text).toBe('Pending......');
  expect(h.feed(1900,{TimestampMS:50100}).text).toBe('S2 850');
  h.feed(2000,{TimestampMS:0,CurrentRaceTime:0});expect(h.view(2000).text).toBe('Pending......');
  expect(h.feed(2100,{TimestampMS:100,CurrentRaceTime:.1}).text).toBe('S2 850');
 });
 it('rejects replay and out-of-order timestamps; accepts genuine uint32 wrap',()=>{
  const h=harness();h.feed(0);for(const now of [500,1000,1490]){S.ingest(h.state,{...car,TimestampMS:now===1000?99:101,CarOrdinal:11},now);h.view(now);}
  expect(h.view(1500).text).toBe('Pending......');expect(h.feed(1600).text).toBe('S2 850');
  const s=S.create();S.ingest(s,{...car,TimestampMS:0xfffffff0},0);S.ingest(s,{...car,TimestampMS:2},100);expect(S.view(s,idle,100,catalog).connected).toBe(true);
  S.ingest(s,{...car,TimestampMS:0xfffffff1},1400);expect(S.view(s,idle,1600,catalog).text).toBe('Pending......');
 });
 it('requires two plausible advancing packets to accept a lower-clock reconnect and fences retired epochs',()=>{
  const h=harness();h.feed(0,{TimestampMS:50000});h.view(2000);
  h.feed(2100,{TimestampMS:0,CarOrdinal:11,CurrentRaceTime:0});expect(h.view(2100).text).toBe('Pending......');
  expect(h.feed(2200,{TimestampMS:100,CarOrdinal:11,CurrentRaceTime:.1}).text).toBe('S2 850');
  h.feed(2300,{TimestampMS:50001,CarOrdinal:10});expect(h.state.identity.ordinal).toBe(11);
 });
 it('recovers immediately from ordinary short/long network gaps when the same clock advances',()=>{
  const h=harness();h.feed(0,{TimestampMS:10000,CurrentRaceTime:0});
  expect(h.feed(500,{TimestampMS:10500,CurrentRaceTime:0}).connected).toBe(true);
  expect(h.view(2000).text).toBe('Pending......');
  expect(h.feed(60000,{TimestampMS:70000,CurrentRaceTime:0}).text).toBe('S2 850');
 });
 it('recovers a same-car free-roam game restart only after a bounded increasing low-counter sequence',()=>{
  const h=harness();h.feed(0,{TimestampMS:50000,CurrentRaceTime:0});h.view(1600);
  expect(h.feed(1700,{TimestampMS:0,CurrentRaceTime:0}).text).toBe('Pending......');
  expect(h.feed(1750,{TimestampMS:0,CurrentRaceTime:0}).text).toBe('Pending......');
  expect(h.feed(1800,{TimestampMS:100,CurrentRaceTime:0}).text).toBe('S2 850');
  h.feed(1900,{TimestampMS:50100,CurrentRaceTime:0});expect(h.state.identity.timestamp).toBe(100);
 });
 it('expires an unconfirmed reset candidate rather than combining arbitrarily distant old packets',()=>{
  const h=harness();h.feed(0,{TimestampMS:50000,CurrentRaceTime:0});h.view(1600);
  h.feed(1700,{TimestampMS:0,CurrentRaceTime:0});
  expect(h.feed(4000,{TimestampMS:100,CurrentRaceTime:0}).text).toBe('Pending......');
  expect(h.feed(4100,{TimestampMS:200,CurrentRaceTime:0}).text).toBe('S2 850');
 });
 it('car change and reconnect reset the carousel; unknown identities cannot retain old names',()=>{
  const h=harness();for(let n=0;n<=3000;n+=1000)h.feed(n);expect(h.view(3000).text).toBe('2012 Lexus LFA');
  expect(h.feed(3100,{CarOrdinal:999}).text).toBe('S2 850');
  for(let n=4100;n<=6100;n+=1000)h.feed(n,{CarOrdinal:999});expect(h.view(6100).text).toBe('CAR N/A');
  h.view(8000);expect(h.feed(8100,{CarOrdinal:11}).text).toBe('S2 850');
 });
 it('Pending overrides notices, race, SHIFT and error when UDP stops; race/notice pause idle clock',()=>{
  const h=harness();h.feed(0);h.feed(1000);expect(h.view(1000,{racing:true,rank:3}).text).toBe('P3');
  h.feed(2000);expect(h.view(2000,{notice:{text:'BEST LAP',until:5000}}).text).toBe('BEST LAP');
  h.feed(3000);expect(h.view(3000).text).toBe('BEST LAP');
  expect(h.view(4500,{shift:true,racing:true,rank:3}).text).toBe('Pending......');
  expect(h.feed(4600).text).toBe('S2 850');
 });
 it('lets a completion notice expire before resuming carousel after race timing disappears',()=>{
  const h=harness();h.feed(0);h.view(0,{notice:{text:'LAP 3',until:3000},racing:true,rank:3});
  for(const now of [1000,2000])expect(h.feed(now).text).toBe('LAP 3');
  expect(h.feed(3000).text).toBe('S2 850');expect(h.feed(4000).text).toBe('S2 850');
 });
 it('uses only catalog entries keyed to the current ordinal, treating names as plain bounded text',()=>{
  expect(S.name(catalog,11)).toBe('2020 Maker Model');expect(S.name(catalog,999)).toBe('CAR N/A');
  expect(S.name({'10':{display_name:'<img src=x> '+ '長'.repeat(300)}},10)).toHaveLength(240);
 });
 it('rejects default-zero identity/timestamp aliases from the actual Coordinator',()=>{
  const c:any={window:{},FrameInterpolator:class{},updatePhysicsTargets:()=>{}};
  const source=readFileSync(resolve(directory,'../shared/coordinator.js'),'utf8').replace(/^import.*$/gm,'').replace(/^export /gm,'');runInNewContext(source,c);
  const absent=c.formatHudTelemetry({CurrentEngineRpm:0});expect(absent.timestamp_ms).toBe(0);expect(absent.carClass).toBe(0);
  const state=S.create();S.ingest(state,absent,0);expect(S.view(state,idle,0,catalog).text).toBe('Pending......');
  const real=c.formatHudTelemetry({...car,CurrentEngineRpm:7200});S.ingest(state,real,0);expect(S.view(state,idle,0,catalog).text).toBe('S2 850');
  for(const now of [500,1000,1499]){S.ingest(state,{...real,rpm:7201},now);S.view(state,idle,now,catalog);}
  expect(S.view(state,idle,1500,catalog).text).toBe('Pending......');
 });
});

describe('LFA local catalog lifetime',()=>{
 function service(){let resolveFetch:any;const load=vi.fn(),abort=vi.fn(),jobs=new Map<number,Function>();const fetch=vi.fn(()=>new Promise(r=>resolveFetch=r));const c=scope.LfaCatalog.create({fetch,AbortController:class{signal={};abort=abort;},setTimeout:(fn:Function)=>{jobs.set(1,fn);return 1;},clearTimeout:(id:number)=>jobs.delete(id),onLoad:load});return{c,fetch,load,abort,jobs,complete:async(data:any)=>{resolveFetch({ok:true,json:async()=>data});for(let n=0;n<6;n++)await Promise.resolve();}};}
 it('uses one existing same-origin GET per lifetime, with no refetch for car/slot updates',async()=>{const x=service();x.c.start();x.c.start();await x.complete(catalog);expect(x.fetch).toHaveBeenCalledTimes(1);expect(x.fetch.mock.calls[0][0]).toBe('/api/cars/database');expect(x.load).toHaveBeenCalledWith(catalog);});
 it.each(['timeout','destroy'])('fences a late catalog after %s',async(mode)=>{const x=service();x.c.start();if(mode==='timeout')x.jobs.get(1)!();else x.c.destroy();await x.complete(catalog);expect(x.load).not.toHaveBeenCalled();expect(x.abort).toHaveBeenCalled();});
});

describe('LFA status integration with actual model epochs',()=>{
 it('recovers a new same-car epoch, clears retired race/notices, and never restores an old catalog name',()=>{
  const modelScope:any={};for(const f of ['lfa-auxiliary.js','lfa-session.js','lfa-expansion.js','lfa-status.js','lfa-model.js'])runInNewContext(readFileSync(resolve(directory,f),'utf8'),modelScope);
  const M=modelScope.LfaModel,s=M.newState();s.catalog=catalog;
  const base={rpm:6000,maxRpm:9000,speed_kmh:180,gear:4,carOrdinal:10,carClass:5,carPi:850,lap:0,race_position:3};
  const feed=(now:number,patch:any)=>{M.ingest(s,{...base,...patch},{},now);return M.view(s,now);};
  feed(0,{timestamp_ms:50000,CurrentLap:10,CurrentRaceTime:50});
  expect(feed(500,{timestamp_ms:50500,CurrentLap:10.5,CurrentRaceTime:50.5}).centerText).toBe('P3');
  expect(feed(600,{timestamp_ms:50600,CurrentLap:0,CurrentRaceTime:51,lap:1,LastLap:85,BestLap:85}).centerText).toBe('BEST LAP');
  expect(M.view(s,2200).centerText).toBe('Pending......');
  expect(feed(2300,{timestamp_ms:0,CurrentLap:0,CurrentRaceTime:0,race_position:0}).centerText).toBe('Pending......');
  expect(feed(2400,{timestamp_ms:100,CurrentLap:0,CurrentRaceTime:0,race_position:0})).toMatchObject({centerText:'S2 850',live:true,confirmedRace:false});
  expect(s.race.notice).toBeNull();
  // Simulate the catalog arriving after an identity change: lookup uses the current ordinal.
  s.catalog=null;feed(2500,{timestamp_ms:200,carOrdinal:999,CurrentLap:0,CurrentRaceTime:0,race_position:0});s.catalog=catalog;
  for(const now of [3500,4500,5500])feed(now,{timestamp_ms:now-2300,carOrdinal:999,CurrentLap:0,CurrentRaceTime:0,race_position:0});
  expect(M.view(s,5500).centerText).toBe('CAR N/A');
 });
});
