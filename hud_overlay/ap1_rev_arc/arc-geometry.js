// One geometric construction owns the upper bezel, LCD band and scale labels.
// The curve is parameterized by arc length; offsets follow its unit normal.
export const ARC = Object.freeze({
  centerX: 360, centerY: 183, radiusX: 290, radiusY: 113, endAngle: .23,
  rpmOffset: 24, bandTop: 18, labelCenter: -22, labelRadius: 14, faceEdge: 54, outerEdge: 64,
  segmentFill: .64, graduationStart: -1, majorEnd: -7, minorEnd: -3.5,
});
export const RPM_UNIT_REFERENCE = Object.freeze({ x: 109, y: 172 });
const TABLE_STEPS = 512;
const span = Math.PI - 2 * ARC.endAngle;
function frameAtAngle(angle) {
  const point = { x: ARC.centerX + ARC.radiusX * Math.cos(angle), y: ARC.centerY - ARC.radiusY * Math.sin(angle) };
  const dx = ARC.radiusX * Math.sin(angle), dy = ARC.radiusY * Math.cos(angle);
  const length = Math.hypot(dx, dy);
  const tangent = { x: dx / length, y: dy / length };
  return { point, tangent, normal: { x: tangent.y, y: -tangent.x } };
}
// Fascia sampling remains fixed. The moved RPM band has its own arc-length
// table on the same ellipse, preserving even cells around both shoulders.
function samplingTable(outward) {
  const at = angle => {
    const { point, normal } = frameAtAngle(angle);
    return { x: point.x + normal.x * outward, y: point.y + normal.y * outward };
  };
  const table = [{ angle: Math.PI - ARC.endAngle, length: 0 }];
  let prior = at(table[0].angle);
  for (let i = 1; i <= TABLE_STEPS; i++) {
    const angle = Math.PI - ARC.endAngle - span * i / TABLE_STEPS;
    const next = at(angle);
    table.push({ angle, length: table[i - 1].length + Math.hypot(next.x - prior.x, next.y - prior.y) });
    prior = next;
  }
  return table;
}
const table = samplingTable(ARC.bandTop / 2);
const rpmTable = samplingTable(ARC.rpmOffset + ARC.bandTop / 2);
export const ARC_LENGTH = table.at(-1).length;
export const RPM_ARC_LENGTH = rpmTable.at(-1).length;
const bounded = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function sampledFrame(ratio, table) {
  const target = bounded(ratio) * table.at(-1).length;
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

export const arcFrame = ratio => sampledFrame(ratio, table);
export const rpmFrame = ratio => sampledFrame(ratio, rpmTable);

export function rpmPoint(ratio, localOffset = 0) {
  const { point, normal } = rpmFrame(ratio);
  const outward = ARC.rpmOffset + localOffset;
  return { x: point.x + normal.x * outward, y: point.y + normal.y * outward };
}

export function rpmUnitPosition() {
  const { normal } = rpmFrame(0);
  return { x: RPM_UNIT_REFERENCE.x + normal.x * ARC.rpmOffset, y: RPM_UNIT_REFERENCE.y + normal.y * ARC.rpmOffset };
}

export function arcPoint(ratio, outward = 0) {
  const { point, normal } = arcFrame(ratio);
  return { x: point.x + normal.x * outward, y: point.y + normal.y * outward };
}

export function arcSegment(index, count, fill = ARC.segmentFill) {
  const start = index / count, end = (index + fill) / count;
  return [rpmPoint(start), rpmPoint(end), rpmPoint(end, ARC.bandTop), rpmPoint(start, ARC.bandTop)];
}

export function arcGraduation(ratio, major) {
  const inward = major ? ARC.majorEnd : ARC.minorEnd;
  return [rpmPoint(ratio, ARC.graduationStart), rpmPoint(ratio, inward)];
}

// Uniform inward label contour. The scale's unnumbered terminal interval keeps
// the last numeral clear of the unchanged auxiliary captions, like the OEM tail.
export function rpmLabelLayout(ratio, label) {
  const point = rpmPoint(ratio, ARC.labelCenter);
  return { ...point, ratio,
    textAnchor: 'middle', baseline: 'central', fontSize: label.length > 2 ? 13 : 16,
  };
}

export function arcSamples(outward, count = 180) {
  return Array.from({ length: count + 1 }, (_, i) => arcPoint(i / count, outward));
}
