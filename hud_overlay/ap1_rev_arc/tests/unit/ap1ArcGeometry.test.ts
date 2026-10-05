import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone HUD geometry is shared with the asset generator.
import { ARC, ARC_LENGTH, arcFrame, arcPoint, arcSamples, arcSegment, arcGraduation, rpmLabelLayout, rpmPoint, rpmFrame, rpmUnitPosition, RPM_UNIT_REFERENCE, RPM_ARC_LENGTH } from '../../arc-geometry.js';
// @ts-expect-error Standalone HUD model supplies semantic RPM scale values.
import { SEGMENT_COUNT, tachometerTicks } from '../../model.js';
const ratios = Array.from({ length: 101 }, (_, i) => i / 100);
const dot = (a: any, b: any) => a.x * b.x + a.y * b.y;
const difference = (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y });
const magnitude = (p: any) => Math.hypot(p.x, p.y);

describe('AP1 shared upper arc geometry', () => {
  it('uses orthonormal frames and arc-length progression across the full curve', () => {
    for (const ratio of ratios) {
      const { normal, tangent } = arcFrame(ratio);
      expect(magnitude(normal)).toBeCloseTo(1, 10);
      expect(magnitude(tangent)).toBeCloseTo(1, 10);
      expect(dot(normal, tangent)).toBeCloseTo(0, 10);
    }
    const lengths = ratios.slice(1).map((ratio, i) => magnitude(difference(arcPoint(ratio, ARC.bandTop / 2), arcPoint(ratios[i], ARC.bandTop / 2))));
    expect(Math.min(...lengths) / Math.max(...lengths)).toBeGreaterThan(.99);
    expect(lengths.reduce((a, b) => a + b, 0) / ARC_LENGTH).toBeCloseTo(1, 3);
  });
  it('keeps base contours at constant normal gaps including endpoints', () => {
    for (const ratio of ratios) {
      const { point, normal, tangent } = arcFrame(ratio);
      for (const offset of [ARC.bandTop, ARC.labelCenter, ARC.faceEdge, ARC.outerEdge]) {
        const delta = difference(arcPoint(ratio, offset), point);
        expect(dot(delta, normal)).toBeCloseTo(offset, 9);
        expect(dot(delta, tangent)).toBeCloseTo(0, 9);
      }
      const gap = difference(arcPoint(ratio, ARC.faceEdge), arcPoint(ratio, ARC.bandTop));
      expect(magnitude(gap)).toBeCloseTo(ARC.faceEdge - ARC.bandTop, 9);
      const rim = difference(arcPoint(ratio, ARC.outerEdge), arcPoint(ratio, ARC.faceEdge));
      expect(magnitude(rim)).toBeCloseTo(ARC.outerEdge - ARC.faceEdge, 9);
    }
  });
  it('has parallel local tangents on every offset contour without shoulder distortion', () => {
    for (const ratio of ratios.slice(1, -1)) {
      const { tangent } = arcFrame(ratio);
      for (const offset of [0, ARC.bandTop, ARC.faceEdge, ARC.outerEdge]) {
        const derivative = difference(arcPoint(ratio + .0001, offset), arcPoint(ratio - .0001, offset));
        expect(dot(derivative, tangent) / magnitude(derivative)).toBeGreaterThan(.99999);
      }
    }
  });
  it('places numbered scales on the shared inward contour below the strip', () => {
    expect(ARC.labelCenter + ARC.labelRadius).toBeLessThan(0);
    for (const maximum of [4500, 6000, 9000, 9500, 12000, 20000]) {
      for (const tick of tachometerTicks(maximum)) {
        const label = rpmLabelLayout(tick.ratio, tick.label);
        const { point, normal, tangent } = rpmFrame(tick.ratio);
        const delta = difference(label, point);
        expect(dot(delta, normal)).toBeCloseTo(ARC.rpmOffset + ARC.labelCenter, 9);
        expect(dot(delta, tangent)).toBeCloseTo(0, 9);
        expect(label.y).toBeGreaterThan(rpmPoint(tick.ratio).y);
        expect(label.textAnchor).toBe('middle');
        expect(label.fontSize).toBeGreaterThan(0);
      }
    }
  });
  it('puts major and minor graduations inward of the strip with distinct lengths', () => {
    for (const ratio of ratios) {
      const { point, normal, tangent } = rpmFrame(ratio);
      const major = arcGraduation(ratio, true), minor = arcGraduation(ratio, false);
      expect(magnitude(difference(major[1], major[0]))).toBeGreaterThan(magnitude(difference(minor[1], minor[0])));
      for (const p of [...major, ...minor]) {
        expect(dot(difference(p, point), normal)).toBeLessThan(ARC.rpmOffset);
        expect(dot(difference(p, point), tangent)).toBeCloseTo(0, 9);
      }
    }
  });
  it('moves the whole RPM assembly along normals with constant crest/shoulder bezel clearance', () => {
    const clearance = ARC.faceEdge - ARC.rpmOffset - ARC.bandTop;
    expect(clearance).toBeGreaterThan(ARC.bandTop / 2);
    for (const ratio of ratios) {
      const { point, normal, tangent } = rpmFrame(ratio);
      for (const local of [0, ARC.bandTop, ARC.labelCenter, ARC.graduationStart, ARC.majorEnd, ARC.minorEnd]) {
        const delta = difference(rpmPoint(ratio, local), point);
        expect(dot(delta, normal)).toBeCloseTo(ARC.rpmOffset + local, 9);
        expect(dot(delta, tangent)).toBeCloseTo(0, 9);
      }
      const bezel = { x: point.x + normal.x * ARC.faceEdge, y: point.y + normal.y * ARC.faceEdge };
      expect(magnitude(difference(bezel, rpmPoint(ratio, ARC.bandTop)))).toBeCloseTo(clearance, 9);
    }
    const delta = difference(rpmUnitPosition(), RPM_UNIT_REFERENCE), frame = rpmFrame(0);
    expect(dot(delta, frame.normal)).toBeCloseTo(ARC.rpmOffset, 9);
    expect(dot(delta, frame.tangent)).toBeCloseTo(0, 9);
  });
  it('resamples the moved strip by its own arc length while preserving bilateral symmetry', () => {
    const points = ratios.map(ratio => rpmPoint(ratio, ARC.bandTop / 2));
    const lengths = points.slice(1).map((point,i)=>magnitude(difference(point,points[i])));
    expect(Math.min(...lengths) / Math.max(...lengths)).toBeGreaterThan(.99);
    expect(lengths.reduce((a,b)=>a+b,0) / RPM_ARC_LENGTH).toBeCloseTo(1,3);
    for (const ratio of ratios) {
      for (const offset of [0, ARC.bandTop, ARC.labelCenter]) {
        const left=rpmPoint(ratio,offset),right=rpmPoint(1-ratio,offset);
        expect(left.x+right.x).toBeCloseTo(2*ARC.centerX,7);
        expect(left.y).toBeCloseTo(right.y,7);
      }
    }
  });
  it('keeps dense cells slender with a meaningful dark gap along the arc', () => {
    for (let index = 0; index < SEGMENT_COUNT - 1; index++) {
      const [a, b, c, d] = arcSegment(index, SEGMENT_COUNT);
      const next = arcSegment(index + 1, SEGMENT_COUNT)[0];
      const width = Math.max(magnitude(difference(b, a)), magnitude(difference(c, d)));
      const gap = magnitude(difference(next, b));
      expect(width / ARC.bandTop).toBeLessThan(.25);
      expect(gap / (width + gap)).toBeGreaterThan(.3);
    }
  });
  it('makes every segment span the same radial thickness and preserves bilateral symmetry', () => {
    const count = SEGMENT_COUNT;
    for (let i = 0; i < count; i++) {
      const [a, b, c, d] = arcSegment(i, count);
      expect(magnitude(difference(d, a))).toBeCloseTo(ARC.bandTop, 9);
      expect(magnitude(difference(c, b))).toBeCloseTo(ARC.bandTop, 9);
    }
    for (const offset of [0, ARC.faceEdge, ARC.outerEdge]) {
      for (const ratio of ratios) {
        const left = arcPoint(ratio, offset), right = arcPoint(1 - ratio, offset);
        expect(left.x + right.x).toBeCloseTo(2 * ARC.centerX, 7);
        expect(left.y).toBeCloseTo(right.y, 7);
      }
    }
    expect(arcSamples(ARC.faceEdge)[0]).toEqual(arcPoint(0, ARC.faceEdge));
    expect(arcSamples(ARC.faceEdge).at(-1)).toEqual(arcPoint(1, ARC.faceEdge));
  });
});
