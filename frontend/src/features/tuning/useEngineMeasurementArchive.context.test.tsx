// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { backendFetch } from '../../services/backend';
import { useEngineMeasurementArchive } from './useEngineMeasurementArchive';
import { createEngineCalculation } from './measurementInitialState';
import { defaultTuneCaptureMetadata } from './tuneSessionController';
import type { CarParams } from '../../context/CarParamsContext';
import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';
vi.mock('../../services/backend',()=>({backendFetch:vi.fn()}));

it('a setup edit invalidates an in-flight archive save even when engine dependencies are unchanged',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();
  const host=document.createElement('div');const root=createRoot(host);
  let archive!:ReturnType<typeof useEngineMeasurementArchive>;let resolve!:(response:Response)=>void;let saved!:Promise<boolean>;
  const response=(value:unknown)=>({ok:true,json:async()=>value}) as Response;
  vi.mocked(backendFetch).mockImplementation(async(path,options)=>{
    if(path==='/api/road/engine-observations' && options?.method==='POST') return new Promise(r=>{resolve=r;});
    return response([]);
  });
  const profile={weight:1400,weight_distribution:48,drivetrain:'RWD',maxHp:300,maxTorque:400} as CarParams;
  function Probe({setup}:{setup:string}) {archive=useEngineMeasurementArchive('42',profile,0,setup);return <output>{archive.observation?.id??'none'}</output>;}
  // Synthetic UI capture; qualification is mocked here and covered by Rust contracts.
  const capture:TuningCaptureFile={schemaVersion:'tuning-capture/v1',capturedAt:'fixture',metadata:defaultTuneCaptureMetadata('42'),samples:[]};
  try {
    await act(async()=>root.render(<Probe setup="setupA"/>));
    await act(async()=>{saved=archive.complete(createEngineCalculation('42'),capture);});
    expect(archive.pendingSave).toBe(true);
    await act(async()=>root.render(<Probe setup="setupB"/>));
    expect(archive.pendingSave).toBe(false);
    await act(async()=>{resolve(response({}));await saved;});
    expect(host.textContent).toBe('none');
    await act(async()=>root.render(<Probe setup="setupA"/>));expect(host.textContent).toBe('none');
  } finally {await act(async()=>root.unmount());vi.mocked(backendFetch).mockReset();}
});
