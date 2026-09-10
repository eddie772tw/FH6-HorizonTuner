import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

const hudDir = resolve(process.cwd(), '../hud_overlay/initial_d');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');
const modelScope: any = {};
runInNewContext(readFileSync(resolve(hudDir, 'initial-d-model.js'), 'utf8'), modelScope);
const model = modelScope.InitialDTachModel;

describe('Initial D AE86 TRD HUD contract', () => {
  it('retains the fictional compressed 0–3k scale and the 11k limit', () => {
    const zero = model.getAngle(0);
    const three = model.getAngle(3000);
    const seven = model.getAngle(7000);
    const maximum = model.getAngle(11000);
    expect(zero).toBeCloseTo(140 * Math.PI / 180);
    expect(maximum - zero).toBeCloseTo(260 * Math.PI / 180);
    expect((three - zero) / (maximum - zero)).toBeCloseTo(0.18);
    expect((seven - three) / (maximum - zero)).toBeCloseTo(0.38);
    expect((maximum - seven) / (maximum - zero)).toBeCloseTo(0.44);
    expect(model.getAngle(2000) - model.getAngle(1000)).toBeLessThan(model.getAngle(6000) - model.getAngle(5000));
    expect(model.getAngle(6000) - model.getAngle(5000)).toBeLessThan(model.getAngle(10000) - model.getAngle(9000));
    expect(model.getAngle(-1000)).toBe(zero);
    expect(model.getAngle(15000)).toBe(maximum);
    expect(model.getAngle(NaN)).toBe(zero);
  });
  it('uses independent staged yellow/red warnings below the engine limit', () => {
    expect(model.getWarningLevel(9000, 10000)).toBe(0);
    expect(model.getWarningLevel(9600, 10000)).toBe(1);
    expect(model.getWarningLevel(9900, 10000)).toBe(2);
    expect(model.getWarningLevel(7600, 8000)).toBe(0);
    expect(model.getWarningLevel(7700, 8000)).toBe(1);
    expect(model.getWarningLevel(7950, 8000)).toBe(2);
  });
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
      InitialDTachModel: model,
      devicePixelRatio: 1,
      requestAnimationFrame: () => {},
      cancelAnimationFrame: () => {},
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

    expect(visibleText).toEqual(expect.arrayContaining(['TRD', '×1000 RPM']));
    // Extra incoming speed/gear/drift data must not add convenience displays to this tach.
    expect(() => {
      registeredDef.onFrame({ rpm: 9600, redlineRpm: 10000, speed_kmh: 125, gear: 4, YawRate: 0.6 });
      registeredDef.onFrame({ rpm: 11000, redlineRpm: 10000 });
      registeredDef.onFrame({ rpm: 0 });
    }).not.toThrow();
    for (const excludedText of ['125', 'KM/H', 'MPH', 'G4', 'DRIFT', 'NIPPONDENSO']) {
      expect(visibleText).not.toContain(excludedText);
    }
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

    // Verify the visibility hook remains available.
    if (registeredDef.onElementsChange) {
      expect(() => {
        registeredDef.onElementsChange({ showGauge: false });
        registeredDef.onElementsChange({ showGauge: true });
      }).not.toThrow();
    }
  });
});
