import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FrameInterpolator } from '../../../shared/frame-interpolator.js';
const scope: any = {}, dir = resolve(process.cwd(), '../hud_overlay/stack_st8100');
for (const file of ['stack-config.js', 'stack-model.js', 'stack-schedule.js', 'stack-monitor.js']) runInNewContext(readFileSync(resolve(dir,file),'utf8'),scope);
const M=scope.StackModel, S=scope.StackMonitor, C=scope.StackConfig;
const packet=(extra:Record<string,unknown>={})=>({TimestampMS:10000,IsRaceOn:1,CarOrdinal:12,CurrentRaceTime:70,LapNumber:1,CurrentEngineRpm:6400,EngineMaxRpm:8000,SpeedMetersPerSecond:50,Gear:4,Boost:14.5038,TireTemp:[194,203,212,221],CurrentLap:12.3,LastLap:58.45,BestLap:57.6,RacePosition:2,PowerWatts:223710,TorqueNewtons:400,AccelInput:255,BrakeInput:0,...extra});
function feed(s:any,now=0,extra={}) { return S.ingest(s,packet({TimestampMS:10000+now,...extra}),{},now); }
const field=(s:any,key:string)=>M.field(key,s,{});
function alarms(s:any,slots:any[]) { S.configure(s,{stackSt8100Alarms:slots}); }
function sustained(s:any,extra={},start=0) { for(let n=start;n<=start+600;n+=100) feed(s,n,extra); }

describe('ST8100 source telemetry and exact dial profiles',()=>{
 it('removes fuel; adds real race timer, power/torque/pedals, and timing-position values',()=>{
  const s=feed(S.create()); expect(M.FIELDS).not.toContain('fuel'); expect(s.latest).not.toHaveProperty('fuel');
  expect(field(s,'race_time').value).toBe('1:10.00'); expect(field(s,'current_lap').value).toBe('0:12.30');
  expect(field(s,'power')).toEqual({label:'HP',value:'300'}); expect(field(s,'torque').value).toBe('400');
  expect(field(s,'throttle').value).toBe('100'); expect(field(s,'brake').value).toBe('0'); expect(field(s,'position').value).toBe('2');
  feed(s,100,{RacePosition:0,BestLap:0,LastLap:0}); expect(field(s,'position').value).toBe('--'); expect(field(s,'best_lap').value).toBe('--:--.--');
 });
 it('converts source units once, keeps signed boost and canonical thresholds stable',()=>{
  const s=feed(S.create(),0,{Boost:-7.2519}); expect(field(s,'speed').value).toBe('180'); expect(field(s,'boost').value).toBe('-0.50');
  S.configure(s,{effectiveUnits:{speed:'mph',boostPressure:'psi',power:'kw',torque:'lbft'},stackSt8100TemperatureUnit:'f'});
  expect(field(s,'speed').value).toBe('112'); expect(field(s,'boost').value).toBe('-7.3'); expect(field(s,'tire_avg').value).toBe('208'); expect(field(s,'power').value).toBe('224'); expect(field(s,'torque').value).toBe('295');
  expect(s.settings.stackSt8100Alarms[0].threshold).toBe(120);
 });
 it.each([[0,'R'],[11,'N'],[10,'10'],[4,'4'],['2','--'],[null,'--']])('formats raw gear %s', (gear,value)=>expect(field(feed(S.create(),0,{Gear:gear}),'gear').value).toBe(value));
 it('does not invent measured channels from coordinator fill-zero aliases',()=>{
  const raw:any=packet(); for(const key of ['CurrentEngineRpm','EngineMaxRpm','SpeedMetersPerSecond','Gear','Boost','TireTemp','PowerWatts','TorqueNewtons','AccelInput','BrakeInput']) delete raw[key];
  Object.assign(raw,{rpm:0,maxRpm:7000,speed_kmh:0,gear:0,boost_bar:0,TireTemp:[0,0,0,0],tire_temp_f:[null,null,null,null]});
  const s=S.create(); S.ingest(s,raw,{},0); for(const key of ['rpm','speed','gear','boost','tire_avg','tire_max','power','torque','throttle','brake']) expect(field(s,key).value).toBe('--'); expect(s.shift).toBe(false);
 });
 it.each([null,'100',NaN,Infinity,[],{}])('rejects invalid numbers %s despite aliases',bad=>{
  const s=feed(S.create(),0,{CurrentEngineRpm:bad,SpeedMetersPerSecond:bad,Boost:bad,rpm:7000,speed_kmh:100}); for(const key of ['rpm','speed','boost']) expect(field(s,key).value).toBe('--');
 });
 it.each([[200,200,200],[200,null,200,200],['200',200,200,200],[200,NaN,200,200]])('requires four valid temperatures: %s',tires=>{
  const s=feed(S.create(),0,{tire_temp_f:tires}); expect(field(s,'tire_avg').value).toBe('--'); expect(field(s,'tire_max').value).toBe('--');
 });
 it('selects the smallest of four exact ceilings including10.5k and preserves manual selections',()=>{
  const c=M.config({}); for(const [max,id] of [[8000,'0-3-8'],[8001,'0-4-10'],[10000,'0-4-10'],[10001,'0-3-10.5'],[10500,'0-3-10.5'],[10501,'0-6-13'],[16000,'0-6-13']]) expect(M.dial(c,max).id).toBe(id);
  for(const d of Object.values(M.DIALS) as any[]) { expect(M.dial(M.config({stackSt8100Dial:d.id}),16000).id).toBe(d.id); expect(M.angle(d.max+1000,d)).toBe(M.angle(d.max,d)); expect((M.angle(d.knee,d)-M.angle(0,d))/(M.angle(d.max,d)-M.angle(0,d))).toBeCloseTo(.14); }
 });
 it('always bases shift percentage on reported engine maximum, including a fixed8k face',()=>{
  const s=S.create(); S.configure(s,{stackSt8100Dial:'0-3-8'}); feed(s,0,{CurrentEngineRpm:8000,EngineMaxRpm:10000,redlineRpm:7000}); expect(s.shift).toBe(false);
  feed(s,100,{CurrentEngineRpm:9000,EngineMaxRpm:10000}); expect(s.shift).toBe(true); feed(s,200,{CurrentEngineRpm:10000,EngineMaxRpm:null,maxRpm:7000}); expect(s.shift).toBe(false);
 });
 it('migrates old tyre/boost settings while removing fuel and preserving unrelated settings',()=>{
  const c=C.normalize({hudStyle:'stack_st8100',stackSt8100Field1:'fuel',stackSt8100FuelWarningEnabled:true,stackSt8100TireWarningEnabled:true,stackSt8100TireWarningC:110,stackSt8100BoostWarningEnabled:true,stackSt8100BoostWarningBar:2,future:7});
  expect(c.stackSt8100Field1).toBe('race_time'); expect(c).not.toHaveProperty('stackSt8100FuelWarningEnabled'); expect(c.stackSt8100Alarms[0]).toMatchObject({enabled:true,metric:'tire_max',threshold:110}); expect(c.stackSt8100Alarms[1].threshold).toBe(2); expect(c.future).toBe(7);
  expect(C.normalize({hudStyle:'simple',stackSt8100FuelWarningEnabled:true})).toEqual({hudStyle:'simple'});
  expect(C.normalize({hudStyle:'stack_st8100',stackSt8100Alarms:[{metric:['rpm'],enabled:'true'}]}).stackSt8100Alarms[0]).toMatchObject({metric:'tire_max',enabled:false});
 });
});
describe('Generic alarm source evidence and session continuity',()=>{
 it('migrates legacy enabled alarms at the actual configure boundary after default state creation',()=>{
  const s=S.create(); S.configure(s,{stackSt8100TireWarningEnabled:true,stackSt8100TireWarningC:115,stackSt8100BoostWarningEnabled:true,stackSt8100BoostWarningBar:2,stackSt8100FuelWarningEnabled:true});
  expect(s.settings.stackSt8100Alarms[0]).toMatchObject({enabled:true,metric:'tire_max',threshold:115}); expect(s.settings.stackSt8100Alarms[1]).toMatchObject({enabled:true,metric:'boost',threshold:2});
  expect(s.settings).not.toHaveProperty('stackSt8100FuelWarningEnabled'); sustained(s,{TireTemp:[300,300,300,300]}); expect(s.alarms[0].active).toBe(true);
  S.configure(s,{elements:{showGauge:true}}); expect(s.settings.stackSt8100Alarms[0].enabled).toBe(true);
 });
 it('is disabled by default and never keeps a hidden fuel alarm',()=>{const s=S.create(); sustained(s,{Fuel:0,Boost:70,TireTemp:[400,400,400,400]}); expect(s.warning).toBe(null);});
 it('supports high/low slots with persistence and metric-specific hysteresis',()=>{
  const s=S.create(); alarms(s,[{enabled:true,metric:'speed',direction:'low',threshold:40},{enabled:true,metric:'boost',direction:'high',threshold:1.5}]);
  for(let n=0;n<=400;n+=100) feed(s,n,{SpeedMetersPerSecond:10}); expect(s.warning).toBe(null);
  feed(s,500,{SpeedMetersPerSecond:10}); expect(s.alarms[0].active).toBe(true); feed(s,600,{SpeedMetersPerSecond:42/3.6}); expect(s.alarms[0].active).toBe(true);
  feed(s,700,{SpeedMetersPerSecond:44/3.6}); expect(s.alarms[0].active).toBe(false);
  sustained(s,{Boost:29.0076},800); expect(s.alarms[1].active).toBe(true); feed(s,1500,{Boost:21.03051}); expect(s.alarms[1].active).toBe(true); feed(s,1600,{Boost:19}); expect(s.alarms[1].active).toBe(false);
 });
 it('permits the same metric in multiple independent slots and clears missing sensors',()=>{
  const s=S.create(); alarms(s,[{enabled:true,metric:'rpm',direction:'high',threshold:6000},{enabled:true,metric:'rpm',direction:'high',threshold:6300},{enabled:true,metric:'throttle',direction:'high',threshold:90}]); sustained(s); expect(s.alarms.every((a:any)=>a.active)).toBe(true);
  feed(s,700,{CurrentEngineRpm:null,AccelInput:null}); expect(s.alarms.every((a:any)=>!a.active)).toBe(true);
 });
 it('requires sustained samples; short spikes and gaps reset alarm timers',()=>{
  const s=S.create(); alarms(s,[{enabled:true,metric:'rpm',threshold:6000}]); feed(s); feed(s,200,{CurrentEngineRpm:1000}); feed(s,400); feed(s,1000); expect(s.warning).toBe(null); sustained(s,{},1100); expect(s.warning).toBe('alarm');
 });
 it('duplicates cannot sustain warning timers or keep signal and popup alive',()=>{
  const s=S.create(); alarms(s,[{enabled:true,metric:'rpm',threshold:6000}]); feed(s); for(let n=100;n<=1800;n+=100) S.ingest(s,packet(),{},n);
  expect(s.status).toBe('NO SIGNAL'); expect(s.warning).toBe(null); expect(s.shift).toBe(false); expect(s.display.pendingLap).toBe(null); expect(field(s,'speed').value).toBe('--'); feed(s,1900); expect(s.status).toBe('LIVE');
 });
 it('rejects reordered reset-looking packets and requires a coherent second reset packet',()=>{
  const s=feed(S.create(),0,{CurrentEngineRpm:7900}); feed(s,16,{CurrentEngineRpm:7000});
  S.ingest(s,packet({TimestampMS:500,CurrentRaceTime:.1,LapNumber:0,CurrentEngineRpm:1000}),{},32); expect(s.timestamp).toBe(10016); expect(s.peakRpm).toBe(7900);
  feed(s,48); expect(s.peakRpm).toBe(7900);
  S.ingest(s,packet({TimestampMS:5,CurrentRaceTime:.01,LapNumber:0,CurrentEngineRpm:1200}),{},200);
  S.ingest(s,packet({TimestampMS:21,CurrentRaceTime:.026,LapNumber:0,CurrentEngineRpm:1200}),{},216); expect(s.peakRpm).toBe(1200); expect(s.display.pendingLap).toBe(null);
 });
 it('preserves peaks over uint32 wrap and resets for a changed car',()=>{
  const s=S.create(); S.ingest(s,packet({TimestampMS:0xfffffff0,CurrentEngineRpm:7900}),{},0); S.ingest(s,packet({TimestampMS:16,CurrentEngineRpm:1000}),{},32); expect(s.peakRpm).toBe(7900);
  S.ingest(s,packet({TimestampMS:32,CurrentEngineRpm:1200,CarOrdinal:13}),{},48); expect(s.peakRpm).toBe(1200);
 });
 it('clears clock/pending state on pause/error/missing data and does not replay LastLap on reconnect',()=>{
  const s=feed(S.create()); feed(s,100,{CurrentLap:12.4}); feed(s,200,{CurrentLap:.1,LastLap:57,LapNumber:2}); expect(s.display.phase).toBe('lap');
  feed(s,300,{IsRaceOn:0}); expect(s.status).toBe('PAUSED'); expect(s.display.pendingLap).toBe(null);
  feed(s,400,{LastLap:57,LapNumber:2}); expect(s.display.phase).toBe('info'); expect(s.display.timing).toBe(false);
  feed(s,500,{success:false}); expect(s.status).toBe('DATA ERROR'); feed(s,600,{TimestampMS:null}); expect(s.status).toBe('NO DATA');
 });
 it('recovers a new backward epoch after signal loss without session metadata',()=>{
  const s=feed(S.create(),0,{CurrentRaceTime:null,LapNumber:null}); S.tick(s,1700);
  const f={CurrentRaceTime:null,LapNumber:null,CurrentEngineRpm:1000}; S.ingest(s,packet({...f,TimestampMS:5}),{},1800); expect(s.status).toBe('NO SIGNAL');
  S.ingest(s,packet({...f,TimestampMS:5}),{},1900); expect(s.status).toBe('NO SIGNAL'); S.ingest(s,packet({...f,TimestampMS:21}),{},1916); expect(s.status).toBe('LIVE'); expect(s.peakRpm).toBe(1000);
 });
 it('uses actual source samples for peaks/alarms while preserving needle smoothing corrections',()=>{
  const a=packet({CurrentEngineRpm:6000}),b=packet({TimestampMS:10016,CurrentEngineRpm:7000}); const i=new FrameInterpolator(); i.pushSample({...a,sourceTelemetry:a},0); i.pushSample({...b,sourceTelemetry:b},16);
  const out=i.interpolate(20); expect(out.CurrentEngineRpm).toBe(7250); const s=S.create(); S.ingest(s,out,{},20); expect(s.visualRpm).toBe(7250); expect(s.peakRpm).toBe(7000); expect(s.shift).toBe(false);
  S.ingest(s,i.interpolate(200),{},200); expect(s.visualRpm).toBe(7000); expect(s.peakRpm).toBe(7000);
 });
 it('never triggers from repeated actual interpolator overshoot across alarm thresholds',()=>{
  const s=S.create(); alarms(s,[{enabled:true,metric:'tire_max',threshold:120},{enabled:true,metric:'boost',threshold:1.5}]);
  for(let n=0;n<=700;n+=100){const a=packet({TimestampMS:10000+n,Boost:1.3*14.5038,TireTemp:[239,239,239,239]}),b=packet({TimestampMS:10016+n,Boost:1.49*14.5038,TireTemp:[247,247,247,247]});const i=new FrameInterpolator();i.pushSample({...a,sourceTelemetry:a},n);i.pushSample({...b,sourceTelemetry:b},n+16);const f=i.interpolate(n+20);expect(f.Boost/14.5038).toBeGreaterThan(1.5);expect(f.TireTemp[0]).toBeGreaterThan(248);S.ingest(s,f,{},n+20);}
  expect(s.warning).toBe(null); expect(s.peakTireC).toBeLessThan(120);
 });
 it.each([null,[],'packet',{}])('rejects malformed source envelope %s',sourceTelemetry=>{const s=S.create();S.ingest(s,{...packet(),sourceTelemetry},{},0);expect(s.status).toBe('NO DATA');expect(s.peakRpm).toBe(null);});
});
