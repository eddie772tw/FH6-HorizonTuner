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

    const visibleText: string[] = [];
    const mockGradient = { addColorStop: () => {} };
    const mockCtx = {
      setTransform: () => {},
      createLinearGradient: () => mockGradient,
      createRadialGradient: () => mockGradient,
      clip: () => {},
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (text: string) => { visibleText.push(text); },
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
        if (tag === 'canvas') return { ...mockCanvas };
        return null;
      },
    };

    const mockWindow = {
      devicePixelRatio: 1,
      requestAnimationFrame: () => {},
      addEventListener: () => {},
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
    expect(visibleText).toContain('125');
    expect(visibleText).toContain('KM/H');
    expect(visibleText).toContain('G4');

    visibleText.length = 0;
    registeredDef.onFrame({ rpm: 3000, speed_kmh: 100, speed_mph: 62, gear: 11 }, { isMetric: false });
    expect(visibleText).toEqual(expect.arrayContaining(['62', 'MPH', 'N']));

    // Verify reverse gear, drift telemetry, and onAnimate sweep
    expect(() => {
      registeredDef.onFrame({ rpm: 1000, max_rpm: 11000, speed_kmh: -5, gear: 0 }, { isMetric: true });
      registeredDef.onFrame(
        {
          rpm: 8500,
          max_rpm: 11000,
          speed_kmh: 88,
          gear: 3,
          YawRate: 0.45,
          slip_rl: 0.55,
          slip_rr: 0.52,
          slip_fl: 0.12,
          slip_fr: 0.14,
        },
        { isMetric: true }
      );
    }).not.toThrow();
    expect(visibleText).toContain('R');
    expect(visibleText).toContain('DRIFT');

    visibleText.length = 0;
    registeredDef.onFrame({ rpm: 0, speed_kmh: 0, gear: 11 }, { isMetric: true });
    expect(visibleText).toEqual(expect.arrayContaining(['0', 'KM/H', 'N']));
    expect(visibleText).not.toContain('DRIFT');

    const logicalWidth = mockCanvas.width;
    for (const [deviceRatio, expectedRatio] of [[2, 2], [4, 3], [0.75, 1]]) {
      mockWindow.devicePixelRatio = deviceRatio;
      registeredDef.onFrame({ rpm: 0, speed_kmh: 0, gear: 11 }, { isMetric: true });
      expect(mockCanvas.width).toBe(logicalWidth * expectedRatio);
      expect(mockCanvas.height).toBe(mockCanvas.width);
    }

    if (registeredDef.onAnimate) {
      expect(() => {
        registeredDef.onAnimate();
      }).not.toThrow();
    }

    // Verify onElementsChange handles hiding gauge and chime
    if (registeredDef.onElementsChange) {
      expect(() => {
        registeredDef.onElementsChange({ showGauge: false, showAudioChime: false });
        registeredDef.onElementsChange({ showGauge: true, showAudioChime: true });
      }).not.toThrow();
    }
  });
});
