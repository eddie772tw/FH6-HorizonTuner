// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import type { TelemetryData } from '../../hooks/useTelemetry';
import replay from '../../../../tests/fixtures/ev_taycan_replay.json';
import channels from '../../../../tests/fixtures/ev_desktop_transport_channels.json';
import { useEvMeasurementSession } from './useEvMeasurementSession';
import { backendFetch } from '../../services/backend';
import type { EvEvidenceConfirmation } from '../../domain/tuning/ev/types';
const telemetry = vi.hoisted(() => ({ listener: undefined as undefined | ((frame: TelemetryData) => void) }));
vi.mock('../../hooks/useTelemetry', () => ({ subscribeToDecodedTelemetry: (listener: (frame: TelemetryData) => void) => {
  telemetry.listener = listener; return () => { telemetry.listener = undefined; };
} }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn(() => new Promise(() => {})) }));
afterEach(() => { vi.mocked(backendFetch).mockReset(); vi.mocked(backendFetch).mockImplementation(() => new Promise(() => {})); vi.useRealTimers(); });

const savedContext: EvEvidenceConfirmation = { schemaVersion:'ev-context/v1', carId:'3445', identity:{ordinal:3445,performanceIndex:795,carClass:4}, setup:{finalDrive:4.03,gearRatios:[4,2],gearAdjustable:[false,false],finalDriveAdjustable:true,allForwardGearsConfirmed:true}, powertrain:{drivetrain:'AWD',maxHp:751,maxTorque:1050} };
const savedReply = (id: string) => ({ evidenceId:id,state:{schema:'ev-measurement/v1',carId:'3445',status:'collecting',guidance:'collecting',frameCount:100,gears:[],identity:savedContext.identity}, readyGears:[1,2],diagnostics:[],capture:{frames:[],powertrain:savedContext.powertrain} });
it('cancels a pending EV selection across live A→B→A and permits a fresh explicit confirmation lifetime', async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); const root=createRoot(document.createElement('div'));
  let session!:ReturnType<typeof useEvMeasurementSession>; let resolve!:(r:Response)=>void;
  const profile={isElectric:true,evGearbox:savedContext.setup,...savedContext.powertrain} as CarParams;
  const live=(pi:number)=>({CarOrdinal:3445,CarPerformanceIndex:pi,CarClass:4}) as TelemetryData;
  function Probe({pi,connected=true}:{pi:number;connected?:boolean}) { session=useEvMeasurementSession('3445',profile,live(pi),'',connected); return null; }
  vi.mocked(backendFetch).mockImplementation(async path=>path==='/api/tuning/ev-selection' ? new Promise(r=>{resolve=r;}) : {ok:true,json:async()=>({model:'ev/v1'})} as Response);
  try {
    await act(async()=>root.render(<Probe pi={795}/>));
    let pending!:Promise<void>; await act(async()=>{pending=session.selectEvidence('old-A',savedContext);});
    await act(async()=>root.render(<Probe pi={800}/>)); await act(async()=>root.render(<Probe pi={795}/>));
    await act(async()=>{resolve({ok:true,json:async()=>savedReply('old-A')} as Response);await pending;});
    expect(session.evidenceId).toBeUndefined();expect(session.confirmation).toBeUndefined();expect(session.result).toBeNull();
    vi.mocked(backendFetch).mockImplementation(async path=>({ok:true,json:async()=>path==='/api/tuning/ev-selection'?savedReply('old-A'):{model:'ev/v1'}} as Response));
    await act(async()=>session.selectEvidence('old-A',savedContext)); const firstLifetime=session.evidenceLifetime;
    expect(session.source).toBe('saved');
    await act(async()=>session.pauseOrResume()); expect(session.phase).toBe('paused');
    await act(async()=>session.calculate()); expect(session.phase).toBe('complete');
    await act(async()=>session.clearEvidence()); await act(async()=>session.selectEvidence('old-A',savedContext));
    expect(session.evidenceLifetime).not.toBe(firstLifetime);expect(session.confirmation).toEqual(savedContext);
    expect(session.snapshot().recording).toBeNull();
    // Provider-scope connectivity invalidates evidence even with unchanged cached data,
    // without mounting the Step 3 panel.
    await act(async()=>root.render(<Probe pi={795} connected={false}/>));
    expect(session.evidenceId).toBeUndefined();expect(session.confirmation).toBeUndefined();
    await act(async()=>root.render(<Probe pi={795}/>));expect(session.evidenceId).toBeUndefined();
    vi.mocked(backendFetch).mockImplementation(async path=>path==='/api/tuning/ev-selection' ? new Promise(r=>{resolve=r;}) : {ok:true,json:async()=>({model:'ev/v1'})} as Response);
    await act(async()=>{pending=session.selectEvidence('old-A',savedContext);});
    await act(async()=>{telemetry.listener!(live(800));telemetry.listener!(live(795));});
    await act(async()=>{resolve({ok:true,json:async()=>savedReply('old-A')} as Response);await pending;});
    expect(session.evidenceId).toBeUndefined();expect(session.confirmation).toBeUndefined();
  } finally { await act(async()=>root.unmount()); }
});
it('retains pending EV frames on a transport failure and clears the error after recovery', async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();const root=createRoot(document.createElement('div'));
  let session!:ReturnType<typeof useEvMeasurementSession>;let fail=true;
  const profile={isElectric:true,evGearbox:savedContext.setup} as CarParams;
  function Probe(){session=useEvMeasurementSession('3445',profile,null);return null;}
  vi.mocked(backendFetch).mockImplementation(async()=>fail?{ok:false} as Response:{ok:true,json:async()=>({state:session.state,readyGears:[],diagnostics:[]})} as Response);
  try {
    await act(async()=>root.render(<Probe/>));await act(async()=>session.restart());
    await act(async()=>telemetry.listener!({TimestampMS:10} as TelemetryData));
    await act(async()=>vi.advanceTimersByTimeAsync(250));expect(session.transportError).toBe(true);expect(session.pendingSamples).toBe(1);
    fail=false;await act(async()=>vi.advanceTimersByTimeAsync(250));expect(session.transportError).toBe(false);expect(session.pendingSamples).toBe(0);
  }finally{await act(async()=>root.unmount());}
});

it('preserves the frozen EV capture projection consumed by Rust qualification, including steering and missing channels', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement('div'));
  let session!: ReturnType<typeof useEvMeasurementSession>;
  const profile = { isElectric: true, evGearbox: { allForwardGearsConfirmed: true } } as CarParams;
  function Probe() { session = useEvMeasurementSession('3445', profile, null); return null; }
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => session.restart());
    const frames = replay.runs[0].rows.map(row => Object.fromEntries(replay.columns.map((key, i) => [key, row[i]])));
    await act(async () => { for (const frame of frames) telemetry.listener!(frame as unknown as TelemetryData); });
    // Rust's workflow contract replays this same frozen projection through ev-evidence and persistence.
    expect(JSON.parse(JSON.stringify(session.snapshot().frames))).toEqual(frames.map(frame =>
      Object.fromEntries(channels.map(key => [key, frame[key]]))));
    const missingSteering = { ...frames[0] }; delete missingSteering.SteerInput;
    await act(async () => telemetry.listener!(missingSteering as unknown as TelemetryData));
    expect(JSON.parse(JSON.stringify(session.snapshot().frames)).at(-1)).not.toHaveProperty('SteerInput');
  } finally { await act(async () => root.unmount()); }
});
it('never collects CVT through the EV reducer, including an unsupported EV plus CVT selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement('div'));
  let session!: ReturnType<typeof useEvMeasurementSession>;
  const profile = { isElectric: true, transmission: { type: 'cvt', capability: 'final-drive-only' }, evGearbox: { allForwardGearsConfirmed: true } } as CarParams;
  function Probe() { session = useEvMeasurementSession('3445', profile, null); return null; }
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => session.restart());
    const frame = Object.fromEntries(replay.columns.map((key, i) => [key, replay.runs[0].rows[0][i]]));
    await act(async () => telemetry.listener!(frame as unknown as TelemetryData));
    expect(session.phase).toBe('idle');
    expect(session.snapshot().frames).toEqual([]);
    expect(session.result).toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it('setup edits reject a late qualified EV response and require fresh collection',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.createElement('div'));
  const profile={isElectric:true,evGearbox:{allForwardGearsConfirmed:true}} as CarParams;
  let session!:ReturnType<typeof useEvMeasurementSession>;let resolve!:(response:Response)=>void;let calculating!:Promise<void>;
  vi.mocked(backendFetch).mockImplementation(async(path)=>{
    if(path==='/api/tuning/ev-evidence')return new Promise(r=>{resolve=r;});
    return {ok:true,json:async()=>({model:'synthetic-qualified-reply'})} as Response;
  });
  function Probe({setup}:{setup:string}) {session=useEvMeasurementSession('3445',profile,null,setup);return null;}
  try {
    await act(async()=>root.render(<Probe setup="A"/>));
    await act(async()=>{calculating=session.calculate();});
    await act(async()=>root.render(<Probe setup="B"/>));
    await act(async()=>{resolve({ok:true,json:async()=>({evidenceId:'stale-A',state:session.state})} as Response);await calculating;});
    expect(session.evidenceId).toBeUndefined();expect(session.result).toBeNull();expect(session.phase).toBe('idle');
    await act(async()=>root.render(<Probe setup="A"/>));expect(session.evidenceId).toBeUndefined();
  } finally {await act(async()=>root.unmount());vi.mocked(backendFetch).mockReset();}
});
