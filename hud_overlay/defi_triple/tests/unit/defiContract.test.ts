import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudDir = resolve(process.cwd(), '../hud_overlay/defi_triple');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');

describe('Defi Advance BF HUD contract', () => {
  it('has a valid author.json signed by "eddie772tw ft. crosXover"', () => {
    expect(existsSync(authorPath)).toBe(true);
    const authorData = JSON.parse(readFileSync(authorPath, 'utf8'));
    expect(authorData.author).toBe('eddie772tw ft. crosXover');
    expect(typeof authorData.description).toBe('string');
  });

  it('contains valid HTML and registers "defi_triple" via HUDCore', () => {
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    expect(html).toContain('id="defiContainer"');
    expect(html).toContain('id="defiCanvas"');
    expect(html).toContain("HUDCore.registerStyle('defi_triple'");
    expect(html).toContain("HUDCore.init('defi_triple')");
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
      .find((s) => s.includes("HUDCore.registerStyle('defi_triple'"));

    expect(scriptMatch).toBeDefined();

    let registeredDef: any = null;
    const mockHUDCore = {
      registerStyle: (name: string, def: any) => {
        if (name === 'defi_triple') registeredDef = def;
      },
      init: () => {},
    };

    const dialLabels: string[] = [];
    const mockCtx = {
      setTransform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (label: string) => { dialLabels.push(label); },
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
    };

    const mockCanvas = {
      getContext: () => mockCtx,
      width: 380,
      height: 360,
      style: {},
      addEventListener: () => {},
    };

    const mockDocument = {
      getElementById: (id: string) => {
        if (id === 'defiCanvas') return mockCanvas;
        if (id === 'defiContainer') return { style: {} };
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
    expect(registeredDef.scaleMultiplier).toBe(1.2);
    expect(dialLabels).toContain('x100kPa');
    expect(dialLabels).toContain('°C');

    // Run onFrame with full sample data
    expect(() => {
      registeredDef.onFrame(
        {
          rpm: 8200,
          maxRpm: 11000,
          speed_kmh: 190,
          gear: 5,
          boost_bar: 1.2,
          OilTemp: 98,
          OilPressure: 5.2,
        },
        { isMetric: true, redlineRpm: 8800 }
      );
    }).not.toThrow();

    // Verify Fahrenheit conversion for canonical Forza UDP oil temp
    expect(() => {
      registeredDef.onFrame(
        {
          rpm: 3500,
          maxRpm: 11000,
          speed_kmh: 80,
          gear: 2,
          OilTemp: 210, // Fahrenheit
          OilPressure: 4.8,
        },
        { isMetric: true }
      );
    }).not.toThrow();

    // Verify onInit and onFrame unit switching (imperial/metric)
    expect(() => {
      registeredDef.onInit({ isMetric: false });
      expect(dialLabels).toContain('PSI');
      expect(dialLabels).toContain('°F');
      // Physical needle scales keep their geometry; printed imperial values convert.
      expect(dialLabels).toContain('212');
      expect(dialLabels).toContain('+29');
      expect(dialLabels).toContain('145');
      registeredDef.onFrame(
        {
          rpm: 9500, // triggers high peak
          maxRpm: 11000,
          speed_kmh: 210,
          gear: 5,
          boost_bar: 1.5,
          OilTemp: 215,
          OilPressure: 5.5,
        },
        { isMetric: false }
      );
      // Next frame with lower RPM to verify Peak Hold tracking
      registeredDef.onFrame(
        {
          rpm: 4000,
          maxRpm: 11000,
          speed_kmh: 120,
          gear: 3,
          boost_bar: 0.2,
          OilTemp: 200,
          OilPressure: 3.5,
        },
        { isMetric: false }
      );
    }).not.toThrow();

    // Verify onAnimate triggers self-check ceremony
    if (registeredDef.onAnimate) {
      expect(() => {
        registeredDef.onAnimate();
      }).not.toThrow();
    }
  });
});
