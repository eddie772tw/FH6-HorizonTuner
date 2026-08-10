import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Palette = {
  primary: string;
  danger: string;
  warning: string;
};

type TokensModule = {
  paletteFor: (theme: string, options?: { customColor?: string; useDefaultColors?: boolean }) => Palette;
};

function loadTokensModule(): TokensModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_tokens.js'),
    'utf8',
  );
  const window = {} as { S650HmiTokens?: TokensModule };
  new Function('window', source)(window);

  if (!window.S650HmiTokens) {
    throw new Error('S650 tokens module did not register itself');
  }
  return window.S650HmiTokens;
}

describe('S650 HMI palette', () => {
  it('keeps the Normal default blue when default gauge colors are enabled', () => {
    expect(loadTokensModule().paletteFor('normal', {
      customColor: '#ff00aa',
      useDefaultColors: true,
    })).toMatchObject({
      primary: '#1351D8',
      danger: '#FF3B30',
      warning: '#FFCC00',
    });
  });

  it('uses the main GUI custom gauge color as the primary HMI color', () => {
    expect(loadTokensModule().paletteFor('normal', {
      customColor: '#ff00aa',
      useDefaultColors: false,
    }).primary).toBe('#ff00aa');
  });

  it('ignores malformed custom colors and preserves the default palette', () => {
    expect(loadTokensModule().paletteFor('normal', {
      customColor: 'not-a-color',
      useDefaultColors: false,
    }).primary).toBe('#1351D8');
  });
});
