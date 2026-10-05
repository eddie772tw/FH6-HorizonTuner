import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone HUD geometry is shared with the asset generator.
import { ARC, ARC_LENGTH, arcFrame, arcPoint, arcSamples, arcSegment } from '../../arc-geometry.js';
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
  it('keeps band, labels and both bezel contours at constant normal gaps including endpoints', () => {
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
  it('keeps glyph envelopes between the band and fascia at both ends and the crown', () => {
    const clearance = Math.min(ARC.labelCenter - ARC.bandTop, ARC.faceEdge - ARC.labelCenter);
    // Label radius includes the narrow typeface two-digit width; compare margins,
    // not hardcoded draw coordinates or Canvas calls.
    expect(ARC.faceEdge - ARC.labelCenter).toBeGreaterThan(ARC.labelRadius);
    expect(clearance).toBeGreaterThan(ARC.labelRadius);
    for (const ratio of [0, .5, 1]) {
      const a = arcPoint(ratio, ARC.labelCenter);
      expect(a.x - ARC.labelRadius).toBeGreaterThan(0);
      expect(a.x + ARC.labelRadius).toBeLessThan(2 * ARC.centerX);
      expect(a.y - ARC.labelRadius).toBeGreaterThan(0);
    }
  });
  it('makes every segment span the same radial thickness and preserves bilateral symmetry', () => {
    const count = 60;
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
