// @vitest-environment jsdom
import { act, StrictMode, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TelemetryCardShell, { type TelemetryCardId } from './TelemetryCardShell';
import { useTelemetryCardPaint } from './TelemetryCardVisibility';

class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  target: Element | null = null;
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) { VisibilityObserver.instances.push(this); }
  observe(target: Element) { this.target = target; }
  disconnect() { this.disconnected = true; }
  emit(visible: boolean) {
    this.callback([{ target: this.target, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const updates = new EventTarget();
const workload = new Map<TelemetryCardId, { received: number; painted: number }>();
const Probe = ({ id }: { id: TelemetryCardId }) => {
  const paint = useTelemetryCardPaint();
  const value = useRef(0);
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const counts = { received: 0, painted: 0 };
    workload.set(id, counts);
    const render = () => {
      if (paint.canPaint() && output.current) {
        output.current.textContent = String(value.current);
        counts.painted++;
      }
    };
    const receive = (event: Event) => { counts.received++; value.current = (event as CustomEvent<number>).detail; render(); };
    const stop = paint.subscribe(render);
    updates.addEventListener('sample', receive);
    return () => { stop(); updates.removeEventListener('sample', receive); };
  }, [paint, id]);
  return <output ref={output}>0</output>;
};
const Card = ({ id }: { id: TelemetryCardId }) => <TelemetryCardShell id={id} title={id} expanded={false}
  gridColumn="1" onClose={() => undefined} closeLabel="Close"><Probe id={id} /></TelemetryCardShell>;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  VisibilityObserver.instances = [];
  workload.clear();
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const sample = (value: number) => updates.dispatchEvent(new CustomEvent('sample', { detail: value }));

describe('card-local viewport painting', () => {
  it('keeps each card mounted and resumes retained values without waiting for another sample', async () => {
    await act(async () => root.render(<><Card id="driver" /><Card id="traces" /></>));
    const [driver, traces] = VisibilityObserver.instances;
    expect(driver.target).toBe(host.querySelector('[aria-labelledby="driver-card-title"]'));
    expect(traces.target).toBe(host.querySelector('[aria-labelledby="traces-card-title"]'));
    const outputs = Array.from(host.querySelectorAll('output'));
    sample(1);
    traces.emit(false);
    sample(2);
    expect(outputs.map(output => output.textContent)).toEqual(['2', '1']);
    traces.emit(true);
    expect(outputs.map(output => output.textContent)).toEqual(['2', '2']);
    expect(Array.from(host.querySelectorAll('output'))).toEqual(outputs);
  });

  it('limits paint work to intersecting cards while all five receive the same 120-frame stream', async () => {
    const ids: TelemetryCardId[] = ['driver', 'traces', 'dynamics', 'tires', 'suspension'];
    await act(async () => root.render(<>{ids.map(id => <Card key={id} id={id} />)}</>));
    VisibilityObserver.instances.slice(1).forEach(observer => observer.emit(false));
    for (let frame = 1; frame <= 120; frame++) sample(frame);
    expect(ids.map(id => workload.get(id)?.received)).toEqual([120, 120, 120, 120, 120]);
    expect(ids.map(id => workload.get(id)?.painted)).toEqual([120, 0, 0, 0, 0]);
    VisibilityObserver.instances[1].emit(true);
    expect(workload.get('traces')).toEqual({ received: 120, painted: 1 });
    expect(host.querySelectorAll('output')[1].textContent).toBe('120');
  });

  it('ignores stale StrictMode observers and cleans up on unmount/remount', async () => {
    await act(async () => root.render(<StrictMode><Card id="driver" /></StrictMode>));
    const stale = VisibilityObserver.instances[0];
    const current = VisibilityObserver.instances[VisibilityObserver.instances.length - 1];
    expect(stale.disconnected).toBe(true);
    stale.emit(false);
    sample(4);
    expect(host.querySelector('output')?.textContent).toBe('4');
    current.emit(false);
    sample(5);
    expect(host.querySelector('output')?.textContent).toBe('4');
    await act(async () => root.render(null));
    expect(current.disconnected).toBe(true);
    current.emit(true);
    await act(async () => root.render(<Card id="driver" />));
    sample(6);
    expect(host.querySelector('output')?.textContent).toBe('6');
  });

  it('does not rearm a queued DPR listener after cleanup', async () => {
    const active = new Set<() => void>();
    let previous: () => void = () => undefined;
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: (_type: string, listener: () => void) => { active.add(listener); previous = listener; },
      removeEventListener: (_type: string, listener: () => void) => { active.delete(listener); },
    }));
    await act(async () => root.render(<Card id="driver" />));
    expect(active.size).toBe(1);
    await act(async () => root.render(null));
    expect(active.size).toBe(0);
    previous();
    expect(active.size).toBe(0);
  });

  it('keeps rendering if IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    await act(async () => root.render(<Card id="driver" />));
    sample(7);
    expect(host.querySelector('output')?.textContent).toBe('7');
  });
});
