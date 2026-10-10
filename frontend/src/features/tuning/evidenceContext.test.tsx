// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useEvidenceContext } from './evidenceContext';

function Probe({ context, capture }: { context: string; capture: string | null }) {
  return <output>{String(useEvidenceContext(context,capture))}</output>;
}
it('clears evidence on setup changes and does not rebind an old selection through null or A→B→A',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');const root=createRoot(host);
  try {
    for(const [context,capture,expected] of [
      ['A','ice-1',true],['B','ice-1',false],['B',null,false],['B','ice-1',false],['A','ice-1',false],['A','ice-2',true],['EV','ice-2',false],['EV','ev-1',true],['other-car','ev-1',false],['other-car','ev-2',true],
    ] as const) {
      await act(async()=>root.render(<Probe context={context} capture={capture} />));expect(host.textContent).toBe(String(expected));
    }
  } finally {await act(async()=>root.unmount());}
});
