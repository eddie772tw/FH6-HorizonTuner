import type { HudConfig } from './hudConfig';

type Edge = NonNullable<HudConfig['audioHeadEdge']>;
type Config = Pick<HudConfig, 'audioHeadEdge' | 'audioHeadOffset' | 'audioHeadCenterOffset'>;
const LIMIT = 4000;

export function audioHeadOffsetBounds(edge: Edge) {
  return {
    minX: edge === 'left' ? 0 : -LIMIT,
    maxX: edge === 'right' ? 0 : LIMIT,
    minY: edge === 'top' ? 0 : -LIMIT,
    maxY: edge === 'bottom' ? 0 : LIMIT,
  };
}

// Project the existing inward/along-edge storage onto screen X/Y without migrating it.
export function readAudioHeadPosition(config: Config) {
  const edge = config.audioHeadEdge ?? 'left';
  const inward = config.audioHeadOffset ?? 0;
  const along = config.audioHeadCenterOffset ?? 0;
  const verticalEdge = edge === 'left' || edge === 'right';
  return {
    edge,
    x: verticalEdge ? (edge === 'right' && inward !== 0 ? -inward : inward) : along,
    y: verticalEdge ? along : (edge === 'bottom' && inward !== 0 ? -inward : inward),
  };
}

export function writeAudioHeadPosition(edge: Edge, x: number, y: number): Required<Config> {
  const { minX, maxX, minY, maxY } = audioHeadOffsetBounds(edge);
  const clampedX = Math.max(minX, Math.min(maxX, x));
  const clampedY = Math.max(minY, Math.min(maxY, y));
  const verticalEdge = edge === 'left' || edge === 'right';
  return {
    audioHeadEdge: edge,
    audioHeadOffset: Math.abs(verticalEdge ? clampedX : clampedY),
    audioHeadCenterOffset: verticalEdge ? clampedY : clampedX,
  };
}
