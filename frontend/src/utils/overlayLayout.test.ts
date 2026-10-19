// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { layoutOverlayItems, positionOverlay } from '../../../hud_overlay/shared/overlay-layout.js';

describe('shared independent overlay layout', () => {
  it('caps a row and grows upward, or fills columns upward when vertical', () => {
    expect(layoutOverlayItems(['a', 'b', 'c', 'd', 'e'], 2, 'horizontal', 10, 20)).toEqual({ width: 20, height: 60, items: [
      { id: 'a', x: 0, y: 40 }, { id: 'b', x: 10, y: 40 },
      { id: 'c', x: 0, y: 20 }, { id: 'd', x: 10, y: 20 }, { id: 'e', x: 0, y: 0 },
    ] });
    expect(layoutOverlayItems(['a', 'b', 'c', 'd', 'e'], 2, 'vertical', 10, 20).items).toEqual([
      { id: 'a', x: 0, y: 40 }, { id: 'b', x: 0, y: 20 }, { id: 'c', x: 0, y: 0 },
      { id: 'd', x: 10, y: 40 }, { id: 'e', x: 10, y: 20 },
    ]);
    expect(layoutOverlayItems([], 3, 'vertical', 10, 20).items).toEqual([]);
  });
  it('switches four edge centers, clears the previous edge and preserves signed offsets', () => {
    const anchor = document.createElement('div');
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      positionOverlay(anchor, edge, 24, -32);
      expect(anchor.style[edge]).toBe('24px');
      const vertical = edge === 'left' || edge === 'right';
      expect(anchor.style[vertical ? 'top' : 'left']).toBe('calc(50% - 32px)');
      expect(anchor.style.transform).toBe(vertical ? 'translateY(-50%)' : 'translateX(-50%)');
      expect(anchor.style[edge === 'right' ? 'left' : edge === 'left' ? 'right' : edge === 'top' ? 'bottom' : 'top']).toBe('auto');
    }
  });
});
