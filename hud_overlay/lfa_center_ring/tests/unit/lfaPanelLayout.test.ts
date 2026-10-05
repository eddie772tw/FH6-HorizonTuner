import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const scope: any = {};
runInNewContext(readFileSync(resolve(process.cwd(), '../hud_overlay/lfa_center_ring/lfa-panel-layout.js'), 'utf8'), scope);
const P = scope.LfaPanelLayout;
describe('LFA expanded panel circle-derived layout', () => {
  const circle = { x: 300, y: 200, radius: 100 };
  it('uses the complete glyph height and leaves clearance from the ring', () => {
    for (const [top,bottom] of [[120,140],[175,190],[190,215],[230,250],[270,285]]) {
      const x = P.rightEdge(circle, top, bottom, 2);
      for (let y = top; y <= bottom; y++) expect(Math.hypot(circle.x-x,circle.y-y)).toBeGreaterThan(circle.radius);
      expect(P.rightEdge(circle, top-5, bottom+5, 2)).toBeLessThanOrEqual(x);
    }
  });
  it('follows the curve instead of holding a fixed value column', () => {
    const middle = P.rightEdge(circle,195,205), upper = P.rightEdge(circle,125,140), lower = P.rightEdge(circle,260,275);
    expect(upper).toBeGreaterThan(middle); expect(lower).toBeGreaterThan(middle);
  });
  it('keeps solid track geometry fixed while proportionally filling valid ratios and preserving unavailable', () => {
    const label = { x: 50, y: 240, width: 20, height: 12 }, reservedValue = { x: 200, y: 240, width: 35, height: 12 };
    let previous = -1;
    for (const value of [0,.25,.5,.801,.804,1]) {
      const g = P.pedalGeometry(circle,label,reservedValue,244,6,value);
      expect(g.width).toBeGreaterThan(0); expect(g.fillWidth/g.width).toBeCloseTo(value); expect(g.fillWidth).toBeGreaterThan(previous); previous=g.fillWidth;
    }
    const zero=P.pedalGeometry(circle,label,reservedValue,244,6,0), missing=P.pedalGeometry(circle,label,reservedValue,244,6,null);
    expect(zero.available).toBe(true); expect(missing.available).toBe(false); expect(missing.fillWidth).toBe(0); expect(missing.width).toBe(zero.width);
    expect(P.pedalGeometry(circle,label,reservedValue,244,6,-1).fillWidth).toBe(0);
    const high=P.pedalGeometry(circle,label,reservedValue,244,6,2); expect(high.fillWidth).toBe(high.width);
  });
});
