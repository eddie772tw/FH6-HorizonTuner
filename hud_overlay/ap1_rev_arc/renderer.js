import { SEGMENT_COUNT, segmentState, tachometerTicks } from './model.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
const DIGITS = { '0': 'ab cdef'.replaceAll(' ', ''), '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
// Original seven-segment glyphs, no redistributed instrument font.
const GLYPHS = {
  a: '9,0 49,0 55,6 49,12 9,12 3,6',
  b: '51,14 57,8 61,12 61,37 55,43 49,37',
  c: '55,47 61,53 61,78 57,82 51,76 49,53',
  d: '9,78 49,78 55,84 49,90 9,90 3,84',
  e: '3,48 9,54 9,76 3,82 0,78 0,54',
  f: '3,8 9,14 9,36 3,42 0,36 0,12',
  g: '10,39 48,39 54,45 48,51 10,51 4,45',
};
const point = ratio => ({ x: 77 + ratio * 574, y: 157 - 87 * 4 * ratio * (1 - ratio) });

export function createRenderer(document, container) {
  const el = id => document.getElementById(id);
  const create = (tag, attrs, parent) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent.appendChild(node);
    return node;
  };
  const set = (node, key, value) => { if (node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value)); };
  const text = (id, value) => { const node = el(id); if (node.textContent !== value) node.textContent = value; };
  const bars = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    const left = point(i / SEGMENT_COUNT);
    const right = point((i + .72) / SEGMENT_COUNT);
    return create('polygon', { points: `${left.x},${left.y} ${right.x},${right.y} ${right.x},${right.y - 18} ${left.x},${left.y - 18}`, class: 'ap1-segment' }, el('rpmSegments'));
  });
  const digits = Array.from({ length: 3 }, (_, i) => {
    const group = create('g', { transform: `translate(${i * 73} 0)` }, el('speedDigits'));
    return Object.fromEntries(Object.entries(GLYPHS).map(([key, points]) => [key, create('polygon', { points, class: 'ap1-digit' }, group)]));
  });
  const fuel = Array.from({ length: 8 }, (_, i) => create('rect', { x: 565 + i * 12, y: 189 - i * .4, width: 9, height: 15 + i * .4, class: 'ap1-segment' }, el('fuelSegments')));
  let lastTickKey = '';
  let lastFrame = '';
  return {
    render(frame, sweep = null) {
      const tickKey = `${frame.maxRpm}:${frame.redlineRpm}`;
      if (tickKey !== lastTickKey) {
        lastTickKey = tickKey;
        el('rpmTicks').replaceChildren();
        for (const tick of tachometerTicks(frame.maxRpm)) {
          const p = point(tick.ratio);
          const hot = frame.redlineRpm !== null && tick.rpm >= frame.redlineRpm;
          const node = create('text', { x: p.x + 2, y: p.y - 27, 'text-anchor': 'middle', class: `ap1-tick-label${hot ? ' ap1-redline-tick' : ''}` }, el('rpmTicks'));
          node.textContent = tick.label;
        }
      }
      const barState = segmentState(sweep ?? frame.rpmRatio, sweep === null ? frame.redlineRatio : null);
      bars.forEach((bar, i) => set(bar, 'class', `ap1-segment${barState[i].lit ? ' is-lit' : ''}${barState[i].hot ? ' is-hot' : ''}`));
      const signature = `${frame.speedText}/${frame.gear}/${frame.unit}/${frame.rpm}/${frame.fuelRatio}/${frame.status}/${frame.shift}/${sweep !== null}`;
      if (signature === lastFrame) return;
      lastFrame = signature;
      const value = frame.speedText.padStart(3, ' ');
      digits.forEach((glyph, i) => Object.entries(glyph).forEach(([key, node]) => set(node, 'class', `ap1-digit${DIGITS[value[i]]?.includes(key) ? ' is-lit' : ''}`)));
      text('speedUnit', frame.unit === 'mph' ? 'mph' : 'km/h');
      text('gearValue', frame.gear);
      text('fuelValue', frame.fuelRatio === null ? '--' : `${Math.round(frame.fuelRatio * 100)}%`);
      fuel.forEach((bar, i) => set(bar, 'class', `ap1-segment${frame.fuelRatio !== null && i < Math.ceil(frame.fuelRatio * 8) ? ' is-lit' : ''}${frame.fuelRatio !== null && frame.fuelRatio <= .125 ? ' is-hot' : ''}`));
      text('rpmValue', frame.rpm === null ? 'RPM ----' : `RPM ${Math.round(frame.rpm)}`);
      text('signalStatus', sweep !== null ? 'DISPLAY CHECK' : frame.status);
      text('shiftLamp', frame.shift && sweep === null ? 'SHIFT' : '');
      container.classList.toggle('is-unavailable', !frame.live && sweep === null);
      container.dataset.status = frame.status || 'LIVE';
      container.dataset.speed = frame.speedText;
      container.dataset.gear = frame.gear;
      set(container, 'aria-label', `AP1 Rev Arc. ${frame.status || 'Live telemetry'}. Speed ${frame.speedText} ${frame.unit === 'mph' ? 'mph' : 'kilometres per hour'}. Gear ${frame.gear}. RPM ${frame.rpm ?? 'unavailable'}. Fuel ${frame.fuelRatio === null ? 'unavailable' : `${Math.round(frame.fuelRatio * 100)} percent`}`);
    },
  };
}
