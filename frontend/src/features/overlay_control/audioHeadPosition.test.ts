import { describe, expect, it } from 'vitest';
import { audioHeadOffsetBounds, readAudioHeadPosition, writeAudioHeadPosition } from './audioHeadPosition';

describe('Audio Head screen-axis controls over legacy storage', () => {
  it.each([
    ['left', 120, -45], ['right', -120, -45],
    ['top', -45, 120], ['bottom', -45, -120],
  ] as const)('preserves saved %s placement through a read/write round trip', (edge, x, y) => {
    const saved = { audioHeadEdge: edge, audioHeadOffset: 120, audioHeadCenterOffset: -45 };
    expect(readAudioHeadPosition(saved)).toEqual({ edge, x, y });
    expect(writeAudioHeadPosition(edge, x, y)).toEqual(saved);
  });

  it.each([
    ['left', -80, -35, 0, -35], ['right', 80, -35, 0, -35],
    ['top', -80, -35, -80, 0], ['bottom', -80, 35, -80, 0],
  ] as const)('clamps the outward %s axis without changing the other axis', (edge, x, y, expectedX, expectedY) => {
    expect(readAudioHeadPosition(writeAudioHeadPosition(edge, x, y)))
      .toEqual({ edge, x: expectedX, y: expectedY });
    const bounds = audioHeadOffsetBounds(edge);
    expect(expectedX).toBeGreaterThanOrEqual(bounds.minX);
    expect(expectedX).toBeLessThanOrEqual(bounds.maxX);
    expect(expectedY).toBeGreaterThanOrEqual(bounds.minY);
    expect(expectedY).toBeLessThanOrEqual(bounds.maxY);
  });

  it('keeps screen-axis meaning when switching between vertical and horizontal edges', () => {
    const right = readAudioHeadPosition({ audioHeadEdge: 'right', audioHeadOffset: 80, audioHeadCenterOffset: 35 });
    const top = writeAudioHeadPosition('top', right.x, right.y);
    expect(top).toEqual({ audioHeadEdge: 'top', audioHeadOffset: 35, audioHeadCenterOffset: -80 });
    const { x, y } = readAudioHeadPosition(top);
    expect(writeAudioHeadPosition('right', x, y))
      .toEqual({ audioHeadEdge: 'right', audioHeadOffset: 80, audioHeadCenterOffset: 35 });
  });

  it('retains the existing maximum distances and defaults without requiring migration', () => {
    expect(readAudioHeadPosition({})).toEqual({ edge: 'left', x: 0, y: 0 });
    expect(writeAudioHeadPosition('right', -5000, 5000))
      .toEqual({ audioHeadEdge: 'right', audioHeadOffset: 4000, audioHeadCenterOffset: 4000 });
    expect(writeAudioHeadPosition('top', -5000, 5000))
      .toEqual({ audioHeadEdge: 'top', audioHeadOffset: 4000, audioHeadCenterOffset: -4000 });
  });
});
