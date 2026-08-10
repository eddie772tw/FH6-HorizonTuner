import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type BaseDrivingModule = {
  create: (options: { primitives: Record<string, (...args: unknown[]) => void> }) => {
    draw: (view: unknown, data: unknown, palette: unknown, region: unknown) => void;
  };
};

function loadBaseDrivingModule(): BaseDrivingModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_base_driving.js'),
    'utf8',
  );
  const window = {} as { S650HmiBaseDriving?: BaseDrivingModule };
  new Function('window', source)(window);

  if (!window.S650HmiBaseDriving) {
    throw new Error('S650 base-driving module did not register itself');
  }
  return window.S650HmiBaseDriving;
}

describe('S650 base driving layer', () => {
  it('renders speed and gear carousel without requiring center-info pages', () => {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const baseDriving = loadBaseDrivingModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => calls.push({ name: 'speed', args }),
        drawGearCarousel: (...args) => calls.push({ name: 'carousel', args }),
      },
    });

    baseDriving.draw(
      { showSpeed: true, showGear: true },
      { gear: 3 },
      { primary: '#c98d5a' },
      {
        speed: { centerX: 640, y: 190, size: 76 },
        carousel: { centerX: 640, y: 399 },
      },
    );

    expect(calls.map((call) => call.name)).toEqual(['speed', 'carousel']);
    expect(calls[0].args.slice(3, 8)).toEqual([640, 190, 190, 76, 76]);
    expect(calls[0].args[8]).toEqual({ showGear: false });
    expect(calls[1].args.slice(3)).toEqual([640, 399]);
  });

  it('allows a theme to disable a base sub-region without touching center-info', () => {
    const calls: string[] = [];
    const baseDriving = loadBaseDrivingModule().create({
      primitives: {
        drawGearAndSpeed: () => calls.push('speed'),
        drawGearCarousel: () => calls.push('carousel'),
      },
    });

    baseDriving.draw({}, {}, {}, {
      speed: { enabled: false },
      carousel: { centerX: 640, y: 399 },
    });

    expect(calls).toEqual(['carousel']);
  });
});
