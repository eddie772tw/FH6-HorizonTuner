import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

const hudDir = resolve(process.cwd(), '../hud_overlay/initial_d');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');
const trdLogoPath = resolve(hudDir, 'assets/trd_logo.svg');
const modelScope: any = {};
runInNewContext(readFileSync(resolve(hudDir, 'initial-d-model.js'), 'utf8'), modelScope);
const tachModel = modelScope.InitialDTachModel;
const speedModel = modelScope.InitialDSpeedModel;

describe('Initial D AE86 TRD HUD contract', () => {
  it('retains the fictional compressed 0–3k scale and the 11k limit on the tachometer', () => {
    const zero = tachModel.getAngle(0);
    const three = tachModel.getAngle(3000);
    const seven = tachModel.getAngle(7000);
    const maximum = tachModel.getAngle(11000);
    expect(zero).toBeCloseTo((140 * Math.PI) / 180);
    expect(maximum - zero).toBeCloseTo((260 * Math.PI) / 180);
    expect((three - zero) / (maximum - zero)).toBeCloseTo(0.18);
    expect((seven - three) / (maximum - zero)).toBeCloseTo(0.38);
    expect((maximum - seven) / (maximum - zero)).toBeCloseTo(0.44);
    expect(tachModel.getAngle(2000) - tachModel.getAngle(1000)).toBeLessThan(
      tachModel.getAngle(6000) - tachModel.getAngle(5000)
    );
    expect(tachModel.getAngle(6000) - tachModel.getAngle(5000)).toBeLessThan(
      tachModel.getAngle(10000) - tachModel.getAngle(9000)
    );
    expect(tachModel.getAngle(-1000)).toBe(zero);
    expect(tachModel.getAngle(15000)).toBe(maximum);
    expect(tachModel.getAngle(NaN)).toBe(zero);
  });

  it('adapts tachometer scale range and redline markings dynamically based on telemetry max RPM', () => {
    // 1. Telemetry Max RPM < 7k (e.g. 6000 RPM)
    expect(tachModel.getDialMaxRpm(6000)).toBe(9000);
    const angle0_6k = tachModel.getAngle(0, 6000);
    const angle2k_6k = tachModel.getAngle(2000, 6000);
    const angle9k_6k = tachModel.getAngle(9000, 6000);
    const totalSpan_6k = angle9k_6k - angle0_6k;
    // 0~2000 RPM occupies compressed 18% segment
    expect((angle2k_6k - angle0_6k) / totalSpan_6k).toBeCloseTo(0.18);
    // 2000~9000 RPM occupies remaining 82%
    expect((angle9k_6k - angle2k_6k) / totalSpan_6k).toBeCloseTo(0.82);

    const ticks6k = tachModel.getTicks(6000);
    const labels6k = ticks6k.filter((t: any) => t.isMajor).map((t: any) => t.label);
    expect(labels6k[labels6k.length - 1]).toBe('9');
    // Redline: {6000 - 1500} = 4500 RPM to 9000 RPM
    const redTicks6k = ticks6k.filter((t: any) => t.isRed);
    expect(redTicks6k[0].rpm).toBe(4500);
    expect(ticks6k.find((t: any) => t.rpm === 4000).isRed).toBe(false);
    expect(ticks6k.find((t: any) => t.rpm === 9000).isRed).toBe(true);

    // 2. Telemetry Max RPM in 7~11k (e.g. 9000 RPM)
    expect(tachModel.getDialMaxRpm(9000)).toBe(11000);
    const ticks9k = tachModel.getTicks(9000);
    const labels9k = ticks9k.filter((t: any) => t.isMajor).map((t: any) => t.label);
    expect(labels9k[labels9k.length - 1]).toBe('11');
    // Redline: {9000 - 1500} = 7500 RPM to 11000 RPM
    expect(ticks9k.find((t: any) => t.rpm === 7000).isRed).toBe(false);
    expect(ticks9k.find((t: any) => t.rpm === 7500).isRed).toBe(true);
    expect(ticks9k.find((t: any) => t.rpm === 11000).isRed).toBe(true);

    // 3. Telemetry Max RPM > 11k (e.g. 13000 RPM)
    expect(tachModel.getDialMaxRpm(13000)).toBe(13000);
    const angle0_13k = tachModel.getAngle(0, 13000);
    const angle3k_13k = tachModel.getAngle(3000, 13000);
    const angle13k_13k = tachModel.getAngle(13000, 13000);
    expect((angle3k_13k - angle0_13k) / (angle13k_13k - angle0_13k)).toBeCloseTo(0.18);

    const ticks13k = tachModel.getTicks(13000);
    const labels13k = ticks13k.filter((t: any) => t.isMajor).map((t: any) => t.label);
    expect(labels13k[labels13k.length - 1]).toBe('13');
    // Redline: {13000 - 1500} = 11500 RPM to 13000 RPM
    expect(ticks13k.find((t: any) => t.rpm === 11000).isRed).toBe(false);
    expect(ticks13k.find((t: any) => t.rpm === 11500).isRed).toBe(true);
    expect(ticks13k.find((t: any) => t.rpm === 13000).isRed).toBe(true);
  });

  it('implements 0-200 km/h speedometer spanning 270 degrees with quadrant anchors', () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;

    // Quadrant anchors: Left = 20, Top = 80, Right = 140, Bottom = 200
    expect(deg(speedModel.getAngle(20, true, 0, false))).toBeCloseTo(180);
    expect(deg(speedModel.getAngle(80, true, 0, false))).toBeCloseTo(270);
    expect(deg(speedModel.getAngle(140, true, 0, false))).toBeCloseTo(360);
    expect(deg(speedModel.getAngle(200, true, 0, false))).toBeCloseTo(450);

    // 20 to 200 spans exactly 270 degrees
    const span20to200 = speedModel.getAngle(200, true, 0, false) - speedModel.getAngle(20, true, 0, false);
    expect(span20to200).toBeCloseTo((270 * Math.PI) / 180);

    // 0 km/h starts at 150 degrees (8 o'clock)
    expect(deg(speedModel.getAngle(0, true, 0, false))).toBeCloseTo(150);
    expect(deg(speedModel.getAngle(-50, true, 0, false))).toBeCloseTo(150);

    // Step consistency: each 20 km/h step spans exactly 30 degrees
    const stepSpan = speedModel.getAngle(40, true, 0, false) - speedModel.getAngle(20, true, 0, false);
    expect(stepSpan).toBeCloseTo((30 * Math.PI) / 180);

    // Ticks list contains major marks at 20 increments up to 200
    const ticks = speedModel.getTicks(true);
    expect(ticks.length).toBe(21); // 0, 10, 20... 200
    const labels = ticks.filter((t: any) => t.isMajor).map((t: any) => t.label);
    expect(labels).toEqual(['0', '20', '40', '60', '80', '100', '120', '140', '160', '180', '200']);
  });

  it('simulates peg limit overtravel and damped jitter when exceeding 200 km/h', () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;

    // Exceeding 200 km/h slightly surpasses the 200 mark (450 deg) to the mechanical peg
    const angleOverWithoutJitter = speedModel.getAngle(220, true, 0, false);
    expect(deg(angleOverWithoutJitter)).toBeGreaterThan(450);
    expect(deg(angleOverWithoutJitter)).toBeLessThanOrEqual(456);

    // With jitter enabled, angle fluctuates with simulated mechanical vibration
    const a1 = speedModel.getAngle(220, true, 100, true);
    const a2 = speedModel.getAngle(220, true, 250, true);
    expect(a1).not.toEqual(a2);
    expect(deg(a1)).toBeGreaterThan(448);
    expect(deg(a1)).toBeLessThan(458);
  });

  it('handles imperial MPH mode with balanced quadrant distribution', () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;

    // 20 mph: 180°, 60 mph: 270°, 100 mph: 360°, 140 mph: 450°
    expect(deg(speedModel.getAngle(20, false, 0, false))).toBeCloseTo(180);
    expect(deg(speedModel.getAngle(60, false, 0, false))).toBeCloseTo(270);
    expect(deg(speedModel.getAngle(100, false, 0, false))).toBeCloseTo(360);
    expect(deg(speedModel.getAngle(140, false, 0, false))).toBeCloseTo(450);
    expect(deg(speedModel.getAngle(0, false, 0, false))).toBeCloseTo(135);

    const mphTicks = speedModel.getTicks(false);
    expect(mphTicks.length).toBe(15); // 0, 10, 20... 140
  });

  it('uses independent staged yellow/red warnings below the engine limit on tachometer', () => {
    expect(tachModel.getWarningLevel(9000, 10000)).toBe(0);
    expect(tachModel.getWarningLevel(9600, 10000)).toBe(1);
    expect(tachModel.getWarningLevel(9900, 10000)).toBe(2);
    expect(tachModel.getWarningLevel(7600, 8000)).toBe(0);
    expect(tachModel.getWarningLevel(7700, 8000)).toBe(1);
    expect(tachModel.getWarningLevel(7950, 8000)).toBe(2);
  });

  it('has a valid author.json signed by "eddie772tw ft. crosXover"', () => {
    expect(existsSync(authorPath)).toBe(true);
    const authorData = JSON.parse(readFileSync(authorPath, 'utf8'));
    expect(authorData.author).toBe('eddie772tw ft. crosXover');
    expect(typeof authorData.description).toBe('string');
  });

  it('provides the dedicated TRD vector logo asset', () => {
    expect(existsSync(trdLogoPath)).toBe(true);
    const svgContent = readFileSync(trdLogoPath, 'utf8');
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('</svg>');
  });

  it('contains valid HTML and registers "initial_d" via HUDCore with dual cluster dimensions', () => {
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    expect(html).toContain('id="initialDContainer"');
    expect(html).toContain('id="initialDCanvas"');
    expect(html).toContain('width: 800px');
    expect(html).toContain('height: 420px');
    expect(html).toContain('width="800"');
    expect(html).toContain('height="420"');
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

  it('invokes onFrame safely with dual gauge canonical telemetry data', () => {
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
    let drawImageCount = 0;
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
      fillText: (text: string) => {
        visibleText.push(text);
      },
      drawImage: () => {
        drawImageCount++;
      },
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
      width: 800,
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

    const mockImage = class {
      src = '';
      onload: any = null;
      complete = true;
      naturalWidth = 178;
      naturalHeight = 38;
    };

    const mockWindow = {
      InitialDTachModel: tachModel,
      InitialDSpeedModel: speedModel,
      Image: mockImage,
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
      'Image',
      scriptMatch!
    );
    runner(mockWindow, mockDocument, mockHUDCore, mockPerformance, mockWindow.requestAnimationFrame, mockImage);

    expect(registeredDef).toBeDefined();
    expect(typeof registeredDef.onFrame).toBe('function');

    // Dial markings should be present
    expect(visibleText).toEqual(expect.arrayContaining(['×1000 RPM', 'km/h', '20', '80', '140', '200']));
    expect(drawImageCount).toBeGreaterThan(0);

    // Convenience digital speed or gear readouts must not be printed as plain text
    expect(() => {
      registeredDef.onFrame({ rpm: 9600, redlineRpm: 10000, speed_kmh: 125, gear: 4, YawRate: 0.6 });
      registeredDef.onFrame({ rpm: 11000, redlineRpm: 10000, speed_kmh: 210 });
      registeredDef.onFrame({ rpm: 0, speed_kmh: 0 });
    }).not.toThrow();

    for (const excludedText of ['125', 'G4', 'DRIFT', 'NIPPONDENSO']) {
      expect(visibleText).not.toContain(excludedText);
    }

    // Backing store sync with DPR
    const logicalWidth = 800;
    const logicalHeight = 420;
    for (const [deviceRatio, expectedRatio] of [
      [2, 2],
      [4, 3],
      [0.75, 1],
    ]) {
      mockWindow.devicePixelRatio = deviceRatio;
      registeredDef.onFrame({ rpm: 0, speed_kmh: 0, gear: 11 }, { isMetric: true });
      expect(mockCanvas.width).toBe(logicalWidth * expectedRatio);
      expect(mockCanvas.height).toBe(logicalHeight * expectedRatio);
    }

    if (registeredDef.onAnimate) {
      expect(() => {
        registeredDef.onAnimate();
      }).not.toThrow();
    }

    if (registeredDef.onElementsChange) {
      expect(() => {
        registeredDef.onElementsChange({ showGauge: false });
        registeredDef.onElementsChange({ showGauge: true });
      }).not.toThrow();
    }
  });
});
