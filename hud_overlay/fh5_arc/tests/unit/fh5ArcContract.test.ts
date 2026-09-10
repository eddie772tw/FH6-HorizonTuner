import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudDir = resolve(process.cwd(), '../hud_overlay/fh5_arc');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');

describe('Forza Horizon 5 Arc HUD contract', () => {
  it('has a valid author.json signed by "eddie772tw ft. crosXover"', () => {
    expect(existsSync(authorPath)).toBe(true);
    const authorData = JSON.parse(readFileSync(authorPath, 'utf8'));
    expect(authorData.author).toBe('eddie772tw ft. crosXover');
    expect(typeof authorData.description).toBe('string');
  });

  it('contains valid HTML and registers "fh5_arc" via HUDCore', () => {
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    expect(html).toContain('id="fh5ArcContainer"');
    expect(html).toContain('id="fh5ArcCanvas"');
    expect(html).toContain("HUDCore.registerStyle('fh5_arc'");
    expect(html).toContain("HUDCore.init('fh5_arc')");
    expect(html).toContain('scaleMultiplier: 1.0');
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
      .find((s) => s.includes("HUDCore.registerStyle('fh5_arc'"));

    expect(scriptMatch).toBeDefined();

    let registeredDef: any = null;
    const mockHUDCore = {
      registerStyle: (name: string, def: any) => {
        if (name === 'fh5_arc') registeredDef = def;
      },
      init: () => {},
    };

    const mockCtx = {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      rect: () => {},
      roundRect: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      shadowBlur: 0,
      shadowColor: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      font: '',
      textAlign: '',
    };

    const mockCanvas = {
      getContext: () => mockCtx,
      width: 380,
      height: 380,
    };

    const mockDocument = {
      getElementById: (id: string) => {
        if (id === 'fh5ArcCanvas') return mockCanvas;
        if (id === 'fh5ArcContainer') return { style: {} };
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
          rpm: 6500,
          maxRpm: 8500,
          speed_kmh: 195,
          gear: 4,
          accel: 240,
          brake: 20,
        },
        { isMetric: true, redlineRpm: 7800 }
      );
    }).not.toThrow();

    // Verify reverse gear, handbrake and onMedia
    expect(() => {
      registeredDef.onFrame({ rpm: 900, max_rpm: 8500, speed_kmh: -10, gear: 0, handbrake: 1 }, { isMetric: true });
    }).not.toThrow();

    if (registeredDef.onMedia) {
      expect(() => {
        registeredDef.onMedia({ success: true, has_media: true, title: 'Horizon Pulse', artist: 'CHVRCHES' });
        registeredDef.onMedia({ success: false });
      }).not.toThrow();
    }

    if (registeredDef.onAnimate) {
      expect(() => {
        registeredDef.onAnimate();
      }).not.toThrow();
    }
  });
});
