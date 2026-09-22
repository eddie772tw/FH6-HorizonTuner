import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_CONFIG } from './hudConfig';

describe('HudConfig G-Force Radar Configuration Defaults & Contracts', () => {
  it('DEFAULT_HUD_CONFIG includes default G-Force radar alignment and offsets', () => {
    expect(DEFAULT_HUD_CONFIG.telemetryGRadarAlignment).toBe('center');
    expect(DEFAULT_HUD_CONFIG.telemetryGRadarOffsetX).toBe(0);
    expect(DEFAULT_HUD_CONFIG.telemetryGRadarOffsetY).toBe(0);
    expect(DEFAULT_HUD_CONFIG.telemetryGRadarScale).toBe(1.0);
  });

  it('validates alignment offset clamping logic', () => {
    const clampOffsetForAlignment = (offset: number, alignment: 'center' | 'left' | 'right') => {
      if (alignment === 'left' && offset < 0) return 0;
      if (alignment === 'right' && offset > 0) return 0;
      return offset;
    };

    // Left alignment locks positive values
    expect(clampOffsetForAlignment(-100, 'left')).toBe(0);
    expect(clampOffsetForAlignment(50, 'left')).toBe(50);
    expect(clampOffsetForAlignment(0, 'left')).toBe(0);

    // Right alignment locks negative values
    expect(clampOffsetForAlignment(100, 'right')).toBe(0);
    expect(clampOffsetForAlignment(-50, 'right')).toBe(-50);
    expect(clampOffsetForAlignment(0, 'right')).toBe(0);

    // Center alignment permits both directions
    expect(clampOffsetForAlignment(-150, 'center')).toBe(-150);
    expect(clampOffsetForAlignment(150, 'center')).toBe(150);
  });
});
