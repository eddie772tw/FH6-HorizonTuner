import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudDir = resolve(process.cwd(), '../hud_overlay/cyberpunk_hud');
const indexPath = resolve(hudDir, 'index.html');
const authorPath = resolve(hudDir, 'author.json');

describe('Cyberpunk 2077 Quadra HUD contract', () => {
  it('has a valid author.json signed by "eddie772tw ft. crosXover"', () => {
    expect(existsSync(authorPath)).toBe(true);
    const authorData = JSON.parse(readFileSync(authorPath, 'utf8'));
    expect(authorData.author).toBe('eddie772tw ft. crosXover');
    expect(typeof authorData.description).toBe('string');
  });

  it('contains valid HTML and registers "cyberpunk_hud" via HUDCore', () => {
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    expect(html).toContain('id="cyberpunkContainer"');
    expect(html).toContain('id="cyberpunkCanvas"');
    expect(html).toContain("HUDCore.registerStyle('cyberpunk_hud'");
    expect(html).toContain("HUDCore.init('cyberpunk_hud')");
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
      .find((s) => s.includes("HUDCore.registerStyle('cyberpunk_hud'"));

    expect(scriptMatch).toBeDefined();

    let registeredDef: any = null;
    const mockHUDCore = {
      registerStyle: (name: string, def: any) => {
        if (name === 'cyberpunk_hud') registeredDef = def;
      },
      init: () => {},
    };

    const labels: string[] = [];
    const mockCtx = {
      setTransform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (label: string) => { labels.push(label); },
      drawImage: () => {},
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
      width: 520,
      height: 220,
    };

    const mockDocument = {
      createElement: () => mockCanvas,
      getElementById: (id: string) => {
        if (id === 'cyberpunkCanvas') return mockCanvas;
        if (id === 'cyberpunkContainer') return { style: {} };
        return null;
      },
    };

    const mockWindow = {
      devicePixelRatio: 1,
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
    expect(registeredDef.scaleMultiplier).toBe(1);

    // Run onFrame with full sample data
    expect(() => {
      registeredDef.onFrame(
        {
          rpm: 7800,
          maxRpm: 8500,
          speed_kmh: 215,
          gear: 5,
          accel: 250,
          brake: 0,
          boost_bar: 1.45,
        },
        { isMetric: true, redlineRpm: 7800 }
      );
    }).not.toThrow();
    expect(labels).toContain('TURBO-R  V-TECH');
    expect(labels).toContain('215');
    expect(labels).toContain('5');
    expect(labels).toContain('+1.45');
    expect(labels.some(label => label.includes('TYPE-66') || label.includes('SYS.LINK'))).toBe(false);

    // Verify reverse gear and onAnimate sweep
    expect(() => {
      registeredDef.onFrame({ rpm: 1100, max_rpm: 8500, speed_kmh: -8, gear: 0 }, { isMetric: true });
    }).not.toThrow();
    expect(labels).toContain('R');
    expect(labels).toContain('—');
    registeredDef.onFrame({ rpm: 0, speed_mph: 62, gear: 11 }, { isMetric: false });
    expect(labels).toContain('MPH');
    expect(labels).toContain('62');
    expect(labels).toContain('N');
    const initialWidth = mockCanvas.width;
    const initialHeight = mockCanvas.height;
    mockWindow.devicePixelRatio = 2;
    registeredDef.onFrame({ rpm: 1000, speed_mph: 20, gear: 1 }, { isMetric: false });
    expect(mockCanvas.width).toBe(initialWidth * 2);
    expect(mockCanvas.height).toBe(initialHeight * 2);
    mockWindow.devicePixelRatio = 9;
    registeredDef.onFrame({ rpm: 1000, speed_mph: 20, gear: 1 }, { isMetric: false });
    expect(mockCanvas.width).toBe(initialWidth * 3);
    mockWindow.devicePixelRatio = 0.5;
    registeredDef.onFrame({ rpm: 1000, speed_mph: 20, gear: 1 }, { isMetric: false });
    expect(mockCanvas.width).toBe(initialWidth);

    if (registeredDef.onAnimate) {
      expect(() => {
        registeredDef.onAnimate();
      }).not.toThrow();
    }

    if (registeredDef.onAudio) {
      expect(() => {
        registeredDef.onAudio({ spectrum: [0.8, 0.6, 0.5, 0.3, 0.2, 0.1, 0, 0, 0, 0] });
        registeredDef.onAudio({ volume: 0.75 });
        registeredDef.onAudio(null);
      }).not.toThrow();
    }

    if (registeredDef.onMedia) {
      expect(() => {
        registeredDef.onMedia({ has_media: true, title: 'I Really Want to Stay At Your House', artist: 'Rosa Walton' });
        registeredDef.onMedia(null);
      }).not.toThrow();
    }
  });
});
