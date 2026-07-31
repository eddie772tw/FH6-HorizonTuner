import { describe, expect, it } from 'vitest';
import { formatDegree } from './unitFormatter';

describe('unitFormatter', () => {
  it('should format degree symbol with degree unit', () => {
    expect(formatDegree(1.5)).toBe('1.5\u00B0');
    expect(formatDegree(-2.0, '')).toBe('-2\u00B0');
  });

  it('should format degree symbol with temperature unit C or F', () => {
    expect(formatDegree(85, 'C')).toBe('85\u00B0C');
    expect(formatDegree(185, 'F')).toBe('185\u00B0F');
  });
});
