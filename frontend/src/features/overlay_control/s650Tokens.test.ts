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

  it('selects the Fox Body palette from the GUI appearance mode', () => {
    const tokens = loadTokensModule();
    expect(tokens.paletteFor('foxbody', { customColor: '#ff00aa', useDefaultColors: false, guiThemeMode: 'light' })).toMatchObject({
      primary: '#F3F6F1',
      secondary: '#B9C0B8',
    });
    expect(tokens.paletteFor('foxbody', { guiThemeMode: 'dark' })).toMatchObject({
      primary: '#9CFF88',
      secondary: '#71C866',
      text: '#D5FFD0',
    });
  });

  it('uses the Normal blue by default and accepts the general custom gauge color for Track', () => {
    const tokens = loadTokensModule();
    expect(tokens.paletteFor('track')).toMatchObject({
      background: '#050608',
      primary: '#1351D8',
      secondary: '#9AA3AD',
      danger: '#FF3B30',
    });
    expect(tokens.paletteFor('track', {
      customColor: '#ff00aa',
      useDefaultColors: false,
    }).primary).toBe('#ff00aa');
  });

  it('keeps Sport warm by default while allowing the established custom primary override', () => {
    const tokens = loadTokensModule();
    expect(tokens.paletteFor('sport')).toMatchObject({
      background: '#090807',
      primary: '#E78B3F',
      secondary: '#B8AAA0',
    });
    expect(tokens.paletteFor('sport', { customColor: '#ff00aa', useDefaultColors: false }).primary).toBe('#ff00aa');
  });

  it('keeps SVT Cobra monochrome when the general custom gauge color is set', () => {
    expect(loadTokensModule().paletteFor('svt_cobra', {
      customColor: '#ff00aa',
      useDefaultColors: false,
    })).toMatchObject({
      primary: '#E8ECE7',
      secondary: '#A7AFA7',
      danger: '#E33B3B',
    });
  });
});
