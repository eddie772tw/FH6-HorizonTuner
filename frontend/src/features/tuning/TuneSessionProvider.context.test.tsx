// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TuneSessionProvider, useTuneSession } from './TuneSessionProvider';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { CarParams } from '../../context/CarParamsContext';

const fixture=vi.hoisted(()=>({profile:{weight:1400,weight_distribution:48,drivetrain:'RWD',maxHp:300,maxTorque:400,spring_front_min:30},listener:undefined as undefined|((frame:TelemetryData)=>void)}));
vi.mock('../../context/CarParamsContext',()=>({useCarParams:()=>({carId:'42',loadedCarId:'42',carParams:fixture.profile as CarParams})}));
vi.mock('../../hooks/useTelemetry',()=>({useTelemetry:()=>({data:null,isConnected:true}),subscribeToDecodedTelemetry:(listener:(frame:TelemetryData)=>void)=>{fixture.listener=listener;return()=>{fixture.listener=undefined;};}}));
vi.mock('./useEngineMeasurementArchive',()=>({useEngineMeasurementArchive:()=>({observation:null,current:null,calculation:null,invalidate:vi.fn(),complete:vi.fn()})}));
vi.mock('./useEvMeasurementSession',()=>({useEvMeasurementSession:()=>({state:{gears:[]},result:null})}));
vi.mock('./useWorkflowCalculation',()=>({useWorkflowCalculation:()=>({result:null,status:'pending'})}));
vi.mock('./engineBatch',()=>({requestEngineBatch:()=>new Promise(()=>{})}));

it('a suspension edit invalidates the existing capture and measurement instead of mixing configurations',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.createElement('div'));
  let session!:ReturnType<typeof useTuneSession>;
  function Probe(){session=useTuneSession();return null;}
  // Synthetic decoded frames test lifecycle only, not telemetry qualification.
  const frame={CarOrdinal:42,CarPerformanceIndex:700,CarClass:3,TimestampMS:0} as TelemetryData;
  try {
    await act(async()=>root.render(<TuneSessionProvider><Probe/></TuneSessionProvider>));
    await act(async()=>{session.capture.start();session.engineMeasurement.ensureStarted(true);fixture.listener!(frame);session.capture.stop();});
    expect(session.capture.status).toBe('complete');expect(session.capture.capture!.samples).toHaveLength(1);
    fixture.profile={...fixture.profile,spring_front_min:35};
    await act(async()=>root.render(<TuneSessionProvider><Probe/></TuneSessionProvider>));
    expect(session.capture.status).toBe('invalidated');expect(session.engineMeasurement.phase).toBe('invalidated');
    await act(async()=>fixture.listener!({...frame,TimestampMS:100}));
    expect(session.engineMeasurement.captureSnapshot().samples).toHaveLength(0);
    expect(session.capture.capture!.samples).toHaveLength(1);
    await act(async()=>{session.engineMeasurement.restart(true);fixture.listener!({...frame,TimestampMS:200});});
    expect(session.engineMeasurement.captureSnapshot().samples.map(s=>s.timestampMS)).toEqual([200]);
  } finally {await act(async()=>root.unmount());fixture.profile={...fixture.profile,spring_front_min:30};}
});
