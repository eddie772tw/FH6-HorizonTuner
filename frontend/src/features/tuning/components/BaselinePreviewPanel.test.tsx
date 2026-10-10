// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../../../../lang/en-us.json';
import zh from '../../../../../lang/zh-tw.json';
import { BaselinePreviewPanel } from './BaselinePreviewPanel';
import { TireEvidencePanel } from './TireEvidencePanel';
import { useBaselineDraft } from '../useBaselineDraft';
import type { BaselinePreview, EvidenceProvenance, TireEvidenceResult } from '../../../domain/tuning/types';
import type { CarParams } from '../../../context/CarParamsContext';
import { kgfMmToLbsIn } from '../../../utils/units';

const options = vi.hoisted(() => ({ language: 'en', imperial: false }));
const applied = vi.fn();
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (s: string) => ((options.language === 'en' ? en : zh) as Record<string, string>)[s] ?? s,
  settings: { units: { temperature: 'F' } },
  convertTemp: (value: number) => ({ value, label: 'F' }),
  convertSpringRate: (value: number) => ({ value: options.imperial ? kgfMmToLbsIn(value) : value, label: options.imperial ? 'lb/in' : 'kgf/mm' }),
  convertHeight: (value: number) => ({ value, label: 'cm' }),
  convertTirePressureFromPsi: (value: number) => ({ value, label: 'psi' }),
}) }));
vi.mock('../useWorkflowCalculation', () => ({ useWorkflowCalculation: (_car: string, goal: string) => ({ status: 'ready', result: { baselinePreview: preview(goal) } }) }));
const preview = (goal: string): BaselinePreview => ({ schemaVersion: 'tuning-baseline-preview/v1', modelVersion: 'rust/chassis-alignment-neutral/v1', goal, stiffness: 'neutral', balance: 'neutral', missingInputs: [], canApply: true, affectedFields: ['spring.front'], fields: [
  { key: 'spring.front', unit: 'kgf/mm', current: 0, recommended: 50, delta: 50, status: 'available', reason: null },
  { key: 'height.front', unit: 'cm', current: null, recommended: null, delta: null, status: 'locked', reason: 'capability-locked' },
] });
function Probe({ context }: { context: string }) {
  const [goal, setGoal] = useState('Road');
  const draft = useBaselineDraft(context, goal, value => { applied(value); setGoal(value); });
  return <><BaselinePreviewPanel carId="42" profile={{} as CarParams} season="Summer" draft={draft} /><output>{goal}:{JSON.stringify(draft.fields)}</output></>;
}

it('target changes remain drafts; cancellation, explicit apply, repeated apply and context changes preserve the contract', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); options.language = 'en'; options.imperial = false; applied.mockClear();
  const host=document.createElement('div'); const root=createRoot(host);
  const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
  const select=(goal:string)=>{ const element=host.querySelector('select')!;element.value=goal;element.dispatchEvent(new Event('change',{bubbles:true})); };
  try {
    await act(async()=>root.render(<Probe context="car42/setupA" />));
    await act(async()=>select('Rally'));
    expect(host.querySelector('output')!.textContent).toBe('Road:{}');
    await act(async()=>button('Cancel draft').click());
    expect(host.querySelector('select')!.value).toBe('Road');expect(applied).not.toHaveBeenCalled();
    expect(button('Apply local baseline').disabled).toBe(true);
    await act(async()=>select('Rally'));
    await act(async()=>{button('Apply local baseline').click();button('Apply local baseline').click();});
    expect(applied).toHaveBeenCalledTimes(1);
    expect(host.querySelector('output')!.textContent).toBe('Rally:{"spring.front":{"value":50,"unit":"kgf/mm"}}');
    expect(button('Apply local baseline').disabled).toBe(true);
    await act(async()=>select('Drag'));await act(async()=>button('Cancel draft').click());
    expect(host.querySelector('select')!.value).toBe('Rally');expect(host.querySelector('output')!.textContent).toContain('"value":50');
    await act(async()=>root.render(<Probe context="car43/setupB" />));expect(host.querySelector('output')!.textContent).toBe('Rally:{}');
  } finally {await act(async()=>root.unmount());}
});

it('renders translated values, locks, source, samples and limits, distinguishing zero from unavailable', async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const evidence:TireEvidenceResult={status:'observed',acceptedSampleCount:2,observedLongitudinalAccelerationMps2:0,maxObservedNormalizedSlip:0,observedTireTemperature:null,unavailableReasons:['temperature-unavailable']};
  const provenance:EvidenceProvenance={schemaVersion:'tuning-evidence-provenance/v1',evidenceId:'capture-42',source:'saved-capture',analysisVersion:'engine-loaded-sweep/v4',carId:'42',powertrain:'ice',identity:{ordinal:42,performanceIndex:700,carClass:3},dependencyKey:'[42,"RWD"]',observationRecordedAt:0,observationId:'observation42',capturedAt:null,sessionId:null,setupVersion:null,upgradeVersion:null,lapWindow:null,timeWindow:null};
  try {
    for(const language of ['en','zh']) {options.language=language;options.imperial=language==='en';
      await act(async()=>root.render(<><Probe context="fixture" /><TireEvidencePanel evidence={evidence} provenance={provenance} /></>));
      const translate=(s:string)=>((language==='en'?en:zh) as Record<string,string>)[s]??s;
      expect(host.textContent).toContain(`${translate('Accepted samples')}: 2`);expect(host.textContent).toContain('0.00 m/s²');
      expect(host.textContent).toContain(`0.000 · ${translate('Dimensionless')}`);expect(host.textContent).toContain(translate('temperature-unavailable'));
      expect(host.textContent).toContain(`${translate('Setup version')}:${translate('Unknown')}`);expect(host.textContent).toContain('engine-loaded-sweep/v4');expect(host.textContent).toContain('capture-42');
      expect(host.textContent).toContain(translate('Observation is conditional telemetry evidence, not friction or maximum grip identification.'));
      expect(host.textContent).toContain(language==='en'?'2799.87 lb/in':'50 kgf/mm');
      expect(host.textContent).toContain(translate('capability-locked'));
      const select=host.querySelector('select')!;select.focus();expect(document.activeElement).toBe(select);
      expect(select.closest('label')!.textContent).toContain(translate('Draft target'));
    }
    options.language='en';await act(async()=>root.render(<TireEvidencePanel evidence={{...evidence,status:'unavailable',acceptedSampleCount:0,observedLongitudinalAccelerationMps2:null,maxObservedNormalizedSlip:null}} />));
    expect(host.textContent).toContain('Accepted samples: 0');expect(host.textContent).toContain('Observed longitudinal acceleration: Unavailable');expect(host.textContent).not.toContain('0.00 m/s²');
  } finally {await act(async()=>root.unmount());host.remove();options.language='en';options.imperial=false;}
});
