// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EvEvidencePanel } from './EvEvidencePanel';
import { backendFetch } from '../../../services/backend';
const f=vi.hoisted(()=>({key:'A',connected:false,live:null as unknown,selectEvidence:vi.fn(),clearEvidence:vi.fn(),source:undefined as string|undefined}));
vi.mock('../../../hooks/useTelemetry',()=>({useTelemetry:()=>({isConnected:f.connected,data:f.live})}));
vi.mock('../TuneSessionProvider',()=>({useTuneSession:()=>({identity:{carId:'3445'},profile:{drivetrain:'AWD',maxHp:751,maxTorque:1050,evGearbox:{finalDrive:4.03,gearRatios:[null],gearAdjustable:[false],finalDriveAdjustable:true,allForwardGearsConfirmed:true}},evMeasurement:{key:f.key,phase:'idle',source:f.source,selectEvidence:f.selectEvidence,clearEvidence:f.clearEvidence}})}));
vi.mock('../../../services/backend',()=>({backendFetch:vi.fn()}));
let root:ReturnType<typeof createRoot>;const host=document.createElement('div');
const metadata={evidenceId:'saved-A',carId:'3445',identity:{ordinal:3445,performanceIndex:795,carClass:4},setup:{finalDrive:4.03,gearRatios:[null]},powertrain:null};
const change=async(element:HTMLInputElement|HTMLSelectElement,value:string)=>act(async()=>{const proto=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(element,value);element.dispatchEvent(new Event('change',{bubbles:true}));element.dispatchEvent(new Event('input',{bubbles:true}));});
afterEach(async()=>{await act(async()=>root?.unmount());vi.resetAllMocks();f.key='A';f.connected=false;f.live=null;f.source=undefined;});
it('keeps captured metadata separate from blank current PI/Class and confirmation before using raw evidence',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.mocked(backendFetch).mockImplementation(async path=>({ok:true,json:async()=>path.includes('?')?[metadata]:{metadata}} as Response));
  root=createRoot(host);await act(async()=>root.render(<EvEvidencePanel t={s=>s}/>));await change(host.querySelector('select')!,'saved-A');
  const pi=host.querySelector<HTMLInputElement>('#ev-current-pi')!;const cls=host.querySelector<HTMLInputElement>('#ev-current-class')!;
  expect(pi.value).toBe('');expect(cls.value).toBe('');expect(host.textContent).toContain('Historical EV capture has no recorded powertrain profile');
  await change(pi,'795');await change(cls,'4');await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Use confirmed EV evidence')!.click());
  expect(f.selectEvidence).toHaveBeenCalledWith('saved-A',expect.objectContaining({identity:{ordinal:3445,performanceIndex:795,carClass:4},powertrain:{drivetrain:'AWD',maxHp:751,maxTorque:1050}}));
});
it('does not restore a late selected metadata reply across setup A→B→A',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let resolve!:(r:Response)=>void;
  vi.mocked(backendFetch).mockImplementation(async path=>path.includes('?')?{ok:true,json:async()=>[metadata]} as Response:new Promise(r=>{resolve=r;}));
  root=createRoot(host);await act(async()=>root.render(<EvEvidencePanel t={s=>s}/>));await change(host.querySelector('select')!,'saved-A');
  f.key='B';await act(async()=>root.render(<EvEvidencePanel t={s=>s}/>));f.key='A';await act(async()=>root.render(<EvEvidencePanel t={s=>s}/>));
  await act(async()=>resolve({ok:true,json:async()=>({metadata})} as Response));
  expect(host.querySelector('input[type=checkbox]')).toBeNull();expect(f.selectEvidence).not.toHaveBeenCalled();
});
