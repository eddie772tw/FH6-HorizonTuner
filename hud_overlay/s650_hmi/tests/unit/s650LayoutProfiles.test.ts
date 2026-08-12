import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ProfilesModule = {
  create: (options: Record<string, unknown>) => {
    type: string;
    geometry: {
      centerInfo: { x: number; y: number; width: number; height: number };
      mainGauge: { leftCenterX: number; rightCenterX: number; outerRadius: number };
    };
    profiles: Record<string, { type: string; dial: { renderer: string; outerInset: number } }>;
  };
};

function loadProfilesModule(): ProfilesModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_layout_profiles.js'),
    'utf8',
  );
  const window = {} as { S650HmiLayoutProfiles?: ProfilesModule };
  new Function('window', source)(window);

  if (!window.S650HmiLayoutProfiles) {
    throw new Error('S650 layout profiles module did not register itself');
  }
  return window.S650HmiLayoutProfiles;
}

describe('S650 layout profiles', () => {
  it('keeps dual-ring themes on their shared outer gauge boundary and declares Track independently', () => {
    const layout = loadProfilesModule().create({
      width: 1280,
      height: 480,
      gauge: { leftCenterX: 256, rightCenterX: 1024, centerY: 250, radius: 180 },
    });

    expect(layout.type).toBe('dual');
    expect(Object.values(layout.profiles).map((profile) => profile.type)).toEqual(['dual', 'dual', 'dual', 'track']);
    expect(layout.geometry.centerInfo).toEqual({ x: 425, y: 126, width: 430, height: 230 });
    expect(layout.geometry.mainGauge).toMatchObject({
      leftCenterX: 256,
      rightCenterX: 1024,
      outerRadius: 188,
    });
    expect(new Set(Object.values(layout.profiles).filter((profile) => profile.type === 'dual').map((profile) => profile.dial.outerInset))).toEqual(new Set([7, 8]));
    expect(layout.profiles.foxbody.dial.renderer).toBe('foxbodyAnalog');
    expect(layout.profiles.track).toMatchObject({
      type: 'track',
      sideGauges: false,
      dial: { renderer: 'trackPerformance', outerInset: 0 },
    });
    expect(layout.profiles.sport).toBeUndefined();
    expect(layout.profiles.svt_cobra).toBeUndefined();
  });
});
