// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import type { TelemetryData } from '../../hooks/useTelemetry';
import replay from '../../../../tests/fixtures/ev_taycan_replay.json';
import channels from '../../../../tests/fixtures/ev_desktop_transport_channels.json';
import { useEvMeasurementSession } from './useEvMeasurementSession';
import { backendFetch } from '../../services/backend';
const telemetry = vi.hoisted(() => ({ listener: undefined as undefined | ((frame: TelemetryData) => void) }));
vi.mock('../../hooks/useTelemetry', () => ({ subscribeToDecodedTelemetry: (listener: (frame: TelemetryData) => void) => {
  telemetry.listener = listener; return () => { telemetry.listener = undefined; };
} }));
vi.mock('../../services/backend', () => ({ backendFetch: vi.fn(() => new Promise(() => {})) }));

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
