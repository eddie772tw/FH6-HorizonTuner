// One geometric construction owns the upper bezel, LCD band and scale labels.
// The curve is parameterized by arc length; offsets follow its unit normal.
export const ARC = Object.freeze({
  centerX: 360, centerY: 183, radiusX: 290, radiusY: 113, endAngle: .23,
  bandTop: 18, labelCenter: 34, labelRadius: 15, faceEdge: 54, outerEdge: 64,
});
const TABLE_STEPS = 512;
const span = Math.PI - 2 * ARC.endAngle;
function frameAtAngle(angle) {
  const point = { x: ARC.centerX + ARC.radiusX * Math.cos(angle), y: ARC.centerY - ARC.radiusY * Math.sin(angle) };
  const dx = ARC.radiusX * Math.sin(angle), dy = ARC.radiusY * Math.cos(angle);
  const length = Math.hypot(dx, dy);
  const tangent = { x: dx / length, y: dy / length };
  return { point, tangent, normal: { x: tangent.y, y: -tangent.x } };
}
// Equal-length sampling follows the middle of the illuminated strip, keeping
// segment density even instead of crowding the steeper shoulders.
function stripMiddleAtAngle(angle) {
  const { point, normal } = frameAtAngle(angle);
  return { x: point.x + normal.x * ARC.bandTop / 2, y: point.y + normal.y * ARC.bandTop / 2 };
}
const table = [{ angle: Math.PI - ARC.endAngle, length: 0 }];
let prior = stripMiddleAtAngle(table[0].angle);
for (let i = 1; i <= TABLE_STEPS; i++) {
  const angle = Math.PI - ARC.endAngle - span * i / TABLE_STEPS;
  const next = stripMiddleAtAngle(angle);
  table.push({ angle, length: table[i - 1].length + Math.hypot(next.x - prior.x, next.y - prior.y) });
  prior = next;
}
export const ARC_LENGTH = table.at(-1).length;
const bounded = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function arcFrame(ratio) {
  const target = bounded(ratio) * ARC_LENGTH;
  let low = 0, high = TABLE_STEPS;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (table[middle].length < target) low = middle;
    else high = middle;
  }
  const fraction = (target - table[low].length) / (table[high].length - table[low].length);
  const angle = table[low].angle + (table[high].angle - table[low].angle) * fraction;
  return frameAtAngle(angle);
}

export function arcPoint(ratio, outward = 0) {
  const { point, normal } = arcFrame(ratio);
  return { x: point.x + normal.x * outward, y: point.y + normal.y * outward };
}

export function arcSegment(index, count, fill = .72) {
  const start = index / count, end = (index + fill) / count;
  return [arcPoint(start), arcPoint(end), arcPoint(end, ARC.bandTop), arcPoint(start, ARC.bandTop)];
}

export function arcSamples(outward, count = 180) {
  return Array.from({ length: count + 1 }, (_, i) => arcPoint(i / count, outward));
}
