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
  const ids = Object.fromEntries(['rpmTicks','rpmSegments','speedDigits','boostSegments','speedUnit','gearValue','boostValue','boostModeLabel','boostTicks','signalStatus','shiftLamp'].map(id => [id, node()]));
  const container = node();
  const renderer = createRenderer({ getElementById: (id: string) => {
    if (!ids[id]) throw new Error('Renderer accessed an absent or removed readout: ' + id);
    return ids[id];
  }, createElementNS: node }, container);
  const render = (boost_bar: number | undefined) => renderer.render({ ...normalizeFrame({ rpm: 4500, maxRpm: 9000, speed_kmh: 100, gear: 4, boost_bar }), live: true, status: '' });
  return { render, ids, container, lit: () => ids.boostSegments.children.filter((n: any) => n.attributes.class.includes('is-lit')), fillWidth: () => ids.boostSegments.children.filter((n: any) => n.attributes.class.includes('is-lit')).reduce((sum: number, n: any) => sum + Number(n.attributes.width), 0) };
}

describe('AP1 boost rendering cache', () => {
  it('updates partial-cell fill even when rounded value text stays identical', () => {
    const f = fixture();
    f.render(.2499);
    const before = f.fillWidth(), value = f.ids.boostValue.textContent;
    f.render(.2501);
    expect(f.ids.boostValue.textContent).toBe(value);
    expect(f.fillWidth()).toBeGreaterThan(before);
  });
  it('switches only the VAC caption and numeric sign while paint classes and scale stay identical', () => {
    const f = fixture();
    f.render(1 / 1024);
    const text = f.ids.boostValue.textContent, ratio = f.container.dataset.boostRatio;
    expect(f.ids.boostModeLabel.textContent).toBe('BOOST');
    f.render(-1 / 1024);
    expect(f.ids.boostValue.textContent).toBe('-' + text);
    expect(f.container.dataset.boostRatio).toBe(ratio);
    expect(f.container.dataset.boostMode).toBe('vacuum');
    expect(f.ids.boostModeLabel.textContent).toBe('VAC');
    expect(f.ids.boostValue.attributes.class).toBeUndefined();
    expect(f.lit().every((n: any) => n.attributes.class === 'ap1-segment is-lit')).toBe(true);
    expect(f.ids.boostTicks.children.filter((n: any) => n.attributes.class === 'ap1-boost-scale').map((n: any) => n.textContent)).toEqual(['0','0.5','1','2']);
  });
  it.each([.5,1])('preserves the complete lit geometry and paint attributes for positive/negative%sbar', bar => {
    const f = fixture();
    f.render(bar);
    const positive = f.lit().map((n: any) => ({ ...n.attributes }));
    f.render(-bar);
    expect(f.lit().map((n: any) => n.attributes)).toEqual(positive);
    expect(f.ids.boostModeLabel.textContent).toBe('VAC');
    expect(f.ids.boostValue.textContent.startsWith('-')).toBe(true);
  });
  it('shows zero as empty neutral and missing as unavailable without fill', () => {
    const f = fixture();
    f.render(-.5);
    expect(f.lit().length).toBeGreaterThan(0);
    f.render(0);
    expect(f.fillWidth()).toBe(0);
    expect(f.container.dataset.boostMode).toBe('neutral');
    expect(f.ids.boostModeLabel.textContent).toBe('BOOST');
    expect(f.ids.boostValue.textContent).toBe('0.00 bar');
    f.render(undefined);
    expect(f.fillWidth()).toBe(0);
    expect(f.container.dataset.boostMode).toBe('unavailable');
    expect(f.ids.boostValue.textContent).toBe('-- bar');
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
