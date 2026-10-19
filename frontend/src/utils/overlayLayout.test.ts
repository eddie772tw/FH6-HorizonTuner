// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { layoutOverlayItems, positionOverlay } from '../../../hud_overlay/shared/overlay-layout.js';

describe('shared independent overlay layout', () => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
        it.each(['left', 'right'] as const)(`${orientation} keeps incomplete rows aligned %s`, edge => {
            const layout = layoutOverlayItems(['a', 'b', 'c', 'd', 'e'], 3, orientation, 1, 1, edge);
            const rows = new Set(layout.items.map(item => item.y));
            for (const y of rows) {
                const row = layout.items.filter(item => item.y === y);
                if (edge === 'right') expect(Math.max(...row.map(item => item.x)) + 1).toBe(layout.width);
                else expect(Math.min(...row.map(item => item.x))).toBe(0);
            }
        });

        it.each(['top', 'bottom'] as const)(`${orientation} grows inward from %s`, edge => {
            const layout = layoutOverlayItems(['a', 'b', 'c', 'd', 'e'], 3, orientation, 1, 1, edge);
            const [first, second] = layout.items;
            const nextLine = layout.items[orientation === 'horizontal' ? 3 : 1];
            expect(first.y).toBe(edge === 'top' ? 0 : layout.height - 1);
            if (edge === 'top') expect(nextLine.y).toBeGreaterThan(first.y);
            else expect(nextLine.y).toBeLessThan(first.y);
            if (orientation === 'horizontal') expect(second.x).toBeGreaterThan(first.x);
        });
    }

    it.each(['left', 'right'] as const)('vertical columns grow inward from %s', edge => {
        const layout = layoutOverlayItems(['a', 'b', 'c', 'd', 'e'], 2, 'vertical', 1, 1, edge);
        if (edge === 'right') expect(layout.items[3].x).toBeLessThan(layout.items[0].x);
        else expect(layout.items[3].x).toBeGreaterThan(layout.items[0].x);
    });

    it('keeps every item inside the bounded grid for either orientation and any edge', () => {
        for (const count of [0, 1, 2, 5, 7]) for (const max of [1, 2, 3, 5]) {
            for (const orientation of ['horizontal', 'vertical'] as const) for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
                const ids = Array.from({ length: count }, (_, index) => index);
                const layout = layoutOverlayItems(ids, max, orientation, 1, 1, edge);
                expect(layout.items.map(item => item.id)).toEqual(ids);
                expect(new Set(layout.items.map(item => `${item.x},${item.y}`)).size).toBe(count);
                for (const item of layout.items) {
                    expect(item.x).toBeGreaterThanOrEqual(0);
                    expect(item.y).toBeGreaterThanOrEqual(0);
                    expect(item.x + 1).toBeLessThanOrEqual(layout.width);
                    expect(item.y + 1).toBeLessThanOrEqual(layout.height);
                }
            }
        }
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
