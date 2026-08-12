import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('S650 HUD launcher config contract', () => {
  it('preserves every renderer-supported theme when forwarding main-GUI changes', () => {
    const source = readFileSync(resolve(process.cwd(), '../hud_overlay/index.html'), 'utf8');
    const themeSet = source.match(/const S650_HMI_THEMES = new Set\(\[([\s\S]*?)\]\);/);

    expect(themeSet?.[1].match(/'[^']+'/g)?.map((entry) => entry.slice(1, -1))).toEqual([
      'normal',
      'heritage67',
      'foxbody',
      'sport',
      'svt_cobra',
      'track',
    ]);
  });
});
