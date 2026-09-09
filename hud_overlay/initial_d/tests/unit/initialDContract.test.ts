import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudDir = resolve(process.cwd(), '../hud_overlay/initial_d');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');

describe('Initial D AE86 TRD HUD contract', () => {
  it('has a valid author.json signed by "eddie772tw ft. crosXover"', () => {
    expect(existsSync(authorPath)).toBe(true);
    const authorData = JSON.parse(readFileSync(authorPath, 'utf8'));
    expect(authorData.author).toBe('eddie772tw ft. crosXover');
    expect(typeof authorData.description).toBe('string');
  });

  it('contains valid HTML and registers "initial_d" via HUDCore', () => {
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    expect(html).toContain('id="initialDContainer"');
    expect(html).toContain('id="initialDCanvas"');
    expect(html).toContain("HUDCore.registerStyle('initial_d'");
    expect(html).toContain("HUDCore.init('initial_d')");
    expect(html).toContain('scaleMultiplier: 0.95');
  });

  it('keeps inline JavaScript syntactically valid', () => {
    const html = readFileSync(indexPath, 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi)]
      .map((m) => m[1])
      .filter((s) => s.trim().length > 0 && !s.includes('src='));

    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('invokes onFrame safely with canonical telemetry data', () => {
    const html = readFileSync(indexPath, 'utf8');
    const scriptMatch = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1])
      .find((s) => s.includes("HUDCore.registerStyle('initial_d'"));

    expect(scriptMatch).toBeDefined();

    let registeredDef: any = null;
    const mockHUDCore = {
      registerStyle: (name: string, def: any) => {
        if (name === 'initial_d') registeredDef = def;
      },
      init: () => {},
    };

    const mockCtx = {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      shadowBlur: 0,
      shadowColor: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: 'alphabetic',
    };

    const mockCanvas = {
      getContext: () => mockCtx,
      width: 420,
      height: 420,
    };

    const mockDocument = {
      getElementById: (id: string) => {
        if (id === 'initialDCanvas') return mockCanvas;
        if (id === 'initialDContainer') return { style: {} };
        return null;
      },
      createElement: (tag: string) => {
        if (tag === 'canvas') return mockCanvas;
        return null;
      },
    };

    const mockWindow = {
      requestAnimationFrame: () => {},
    };

    const mockPerformance = {
      now: () => 1000,
    };

    const runner = new Function(
      'window',
      'document',
      'HUDCore',
      'performance',
      'requestAnimationFrame',
      scriptMatch!
    );
    runner(mockWindow, mockDocument, mockHUDCore, mockPerformance, mockWindow.requestAnimationFrame);

    expect(registeredDef).toBeDefined();
    expect(typeof registeredDef.onFrame).toBe('function');

    // Run onFrame with full sample data
    expect(() => {
      registeredDef.onFrame(
        {
          rpm: 9600,
          maxRpm: 11000,
          speed_kmh: 125,
          gear: 4,
        },
        { isMetric: true }
      );
    }).not.toThrow();
  });
});
