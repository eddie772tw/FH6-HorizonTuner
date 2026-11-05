// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { DecimalInput } from './components/common/DecimalInput';
import { Step1GoalSetup } from './features/tuning/components/Step1GoalSetup';
vi.mock('./context/SettingsContext',()=>({useSettings:()=>({settings:{units:{weight:'kg',power:'hp',torque:'nm'}},t:(x:string)=>x,convertSpringRate:(value:number)=>({value,label:'kgf/mm'}),convertSpringRateToKgfmm:(x:number)=>x,convertHeight:(value:number)=>({value,label:'cm'}),convertHeightToCm:(x:number)=>x,convertForce:(value:number)=>({value,label:'kgf'}),convertForceToKgf:(x:number)=>x,convertPower:(value:number)=>({value:value/745.7,label:'hp'}),convertTorque:(value:number)=>({value,label:'Nm'}),convertTirePressureFromPsi:(value:number)=>({value,label:'psi'})})}));
it('labels Step1 numeric fields and exposes configured bounds without inventing game steps',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<Step1GoalSetup measuredEngineInputs selectedRaceGoal="Road" setSelectedRaceGoal={()=>{}} season="Summer" setSeason={()=>{}} carParams={null} updateParam={()=>{}} hasCoreParams={false} onOpenUnitSettings={()=>{}} onProceed={async()=>{}}/>));
 const weight=host.querySelector<HTMLInputElement>('input[placeholder="e.g. 1350"]')!;
 expect(weight.labels?.length).toBe(1);expect(weight.getAttribute('aria-label')).toBe('Weight (kg)');
 expect(weight.min).toBe('200');expect(weight.max).toBe('10000');expect(weight.step).toBe('any');
 const numeric=[...host.querySelectorAll<HTMLInputElement>('input[type=number]')];
 expect(numeric.filter(i=>!i.labels?.length&&!i.getAttribute('aria-label'))).toEqual([]);
 expect(host.querySelector('#step1-spring_front_min')?.getAttribute('aria-label')).toBe('Front Spring Range — Min (kgf/mm)');
 expect(host.querySelector('#step1-height_rear_max')?.getAttribute('aria-label')).toBe('Rear Height Range — Max (cm)');
 await act(async()=>root.unmount());host.remove();
});
it('preserves imported precision through untouched focus and blur',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let stored=12.56;
 function Harness(){const [value,setValue]=useState(stored);return <DecimalInput value={value} onChange={v=>{stored=v!;setValue(v!)}} precision={1} min={0.1} max={100}/>;}
 await act(async()=>root.render(<Harness/>));const input=host.querySelector('input')!;
 expect(input.value).toBe('12.6');expect(stored).toBe(12.56);
 await act(async()=>input.focus());await act(async()=>input.blur());
 expect(stored).toBe(12.56);expect(input.value).toBe('12.6');
 await act(async()=>root.unmount());host.remove();
});
it('keeps raw precision editable, commits edits and native bounds, and clears on Enter', async () => {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let stored:number|undefined=12.56;
 function Harness(){const [value,setValue]=useState<number|undefined>(stored);return <><span id="quantity-help">Measured value</span><DecimalInput aria-describedby="quantity-help" value={value} onChange={v=>{stored=v;setValue(v)}} precision={1} min={1} max={20} step={.5}/></>;}
 await act(async()=>root.render(<Harness/>));const input=host.querySelector('input')!;
 await act(async()=>input.focus());expect(input.value).toBe('12.56');
 expect(input.min).toBe('1');expect(input.max).toBe('20');expect(input.step).toBe('0.5');expect(input.getAttribute('aria-describedby')).toBe('quantity-help');
 const enter=async(value:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});};
 await enter('25');expect(input.validity.rangeOverflow).toBe(true);await act(async()=>input.blur());expect(stored).toBe(20);
 await act(async()=>input.focus());await enter('');await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(stored).toBeUndefined();expect(input.value).toBe('');
 await act(async()=>root.unmount());host.remove();
});
it('does not write rounded converted values after display-unit changes',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onChange=vi.fn();const raw=3.11;
 for(const value of [raw,raw*55.9974,raw]){
  await act(async()=>root.render(<DecimalInput value={value} onChange={onChange} precision={1}/>));const input=host.querySelector('input')!;
  await act(async()=>input.focus());await act(async()=>input.blur());
 }
 expect(onChange).not.toHaveBeenCalled();await act(async()=>root.unmount());host.remove();
});
it.each(['Road','Rally','Drift','Drag'])('names every Step1 numeric/select control for %s',async goal=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<Step1GoalSetup selectedRaceGoal={goal} setSelectedRaceGoal={()=>{}} season="Summer" setSeason={()=>{}} carParams={null} updateParam={()=>{}} hasCoreParams={false} onOpenUnitSettings={()=>{}} onProceed={async()=>{}}/>));
 for(const input of host.querySelectorAll<HTMLInputElement>('input[type=number],select')) expect(Boolean(input.labels?.length||input.getAttribute('aria-label'))).toBe(true);
 await act(async()=>root.unmount());host.remove();
});
