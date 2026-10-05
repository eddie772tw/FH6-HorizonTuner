import { describe, expect, it } from 'vitest';
// @ts-expect-error HUD-native JavaScript is intentionally outside the TS build.
import { createRenderer } from '../../renderer.js';
// @ts-expect-error HUD-native JavaScript is intentionally outside the TS build.
import { normalizeFrame } from '../../model.js';

function fixture() {
  const node = () => ({
    attributes: {} as Record<string, string>, children: [] as any[], textContent: '', dataset: {} as Record<string, string>,
    setAttribute(key: string, value: string) { this.attributes[key] = value; },
    getAttribute(key: string) { return this.attributes[key] ?? null; },
    appendChild(child: any) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    classList: { toggle() {} },
  });
  const ids = Object.fromEntries(['rpmTicks','rpmSegments','speedDigits','boostSegments','speedUnit','gearValue','boostValue','boostMinLabel','boostMaxLabel','signalStatus','shiftLamp'].map(id => [id, node()]));
  const container = node();
  const renderer = createRenderer({ getElementById: (id: string) => {
    if (!ids[id]) throw new Error('Renderer accessed an absent or removed readout: ' + id);
    return ids[id];
  }, createElementNS: node }, container);
  const render = (boost_bar: number) => renderer.render({ ...normalizeFrame({ rpm: 4500, maxRpm: 9000, speed_kmh: 100, gear: 4, boost_bar }), live: true, status: '' });
  return { render, ids, container, lit: () => ids.boostSegments.children.filter((n: any) => n.attributes.class.includes('is-lit')).length };
}

describe('AP1 boost rendering cache', () => {
  it('updates the bar across a zero boundary even when rounded value text stays identical', () => {
    const f = fixture();
    f.render(-.0001);
    const before = f.lit(), value = f.ids.boostValue.textContent;
    f.render(.0001);
    expect(f.ids.boostValue.textContent).toBe(value);
    expect(f.lit()).toBeGreaterThan(before);
  });
  it('updates overflow metadata independently of rounded display text', () => {
    const f = fixture();
    f.render(1.9999);
    expect(f.container.dataset.boostRange).toBe('within');
    f.render(2.0001);
    expect(f.ids.boostValue.textContent).toBe('2.00 bar');
    expect(f.container.dataset.boostRange).toBe('high');
  });
});
