import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const advancedHudPath = resolve(process.cwd(), '../hud_overlay/advanced/index.html');

function readAdvancedHud(): string {
  return readFileSync(advancedHudPath, 'utf8');
}

function extractController(html: string): string {
  const controller = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi)]
    .map((match) => match[1])
    .find((source) => source.includes("HUDCore.registerStyle('advanced'"));
  if (!controller) throw new Error('Advanced HUD controller script not found');
  return controller;
}

function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${functionName} not found`);
  const nextFunction = source.indexOf('\n        function ', start + 1);
  return source.slice(start, nextFunction < 0 ? source.length : nextFunction);
}

type AdvancedHudRegistration = {
  onFrame: (data: Record<string, unknown>, payload: Record<string, unknown>) => void;
};

describe('Advanced HUD contract', () => {
  it('resolves and renders the same LC states as the Drift HUD', () => {
    const html = readAdvancedHud();

    expect(html).toContain('function resolveAdvancedLaunchControlState(');
    expect(html).toContain("payloadState = payload && payload.lcState");
    expect(html).toContain("dataState = data && (data.lcState || data.launchControlState)");
    expect(html).toContain('rawGear === 1 && rawSpeed < 8');
    expect(html).toContain("_advValidGear === 11 ? 'N'");
    expect(html).toContain('throttlePercent >= 70 && handbrakePercent >= 50');
    expect(html).toContain('ADV_LC_FALLBACK_GO_FRAMES = 45');
    expect(html).toContain("stateLabel = b.launched ? 'LC GO' : (b.armed ? 'LC ARM' : b.label)");
    expect(html).toContain('window.advLCArmed = window.advLCState === \'armed\';');
    expect(html).toContain('window.advLCLaunched = window.advLCState === \'launched\';');
  });

  it('keeps the Advanced HUD inline scripts syntactically valid', () => {
    const scripts = [...readAdvancedHud().matchAll(/<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi)]
      .map((match) => match[1])
      .filter((source) => source.trim().length > 0);

    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('keeps the render path on cached DOM references', () => {
    const html = readAdvancedHud();
    const controller = extractController(html);
    const frameStart = controller.indexOf('onFrame: function');
    const animateStart = controller.indexOf('onAnimate: function', frameStart);
    const frameBody = controller.slice(frameStart, animateStart);
    const drawBody = extractFunctionBody(html, 'drawAdvancedHUD');

    expect(frameStart).toBeGreaterThanOrEqual(0);
    expect(animateStart).toBeGreaterThan(frameStart);
    expect(frameBody).not.toContain('document.getElementById');
    expect(drawBody).toContain('var advContainer = domCache.advContainer;');
    expect(drawBody).not.toContain('document.getElementById');

    for (const [key, id] of [
      ['advContainer', 'advContainer'],
      ['advSpeed', 'adv-speed'],
      ['advSpeedUnit', 'adv-speed-unit'],
      ['advRpmValue', 'adv-rpm-value'],
      ['advGear', 'adv-gear'],
      ['advGauges', 'advGauges'],
      ['dotsLeft', 'dots-left'],
      ['dotsRight', 'dots-right'],
    ]) {
      expect(html).toContain(`${key}: document.getElementById('${id}')`);
    }
  });

  it('drives the fallback from LC ARM to LC GO', () => {
    const window = {} as Record<string, unknown>;
    const document = { getElementById: () => null };
    const domCache = {
      advCanvas: null,
      advCanvasStatic: null,
      advContainer: null,
      advSpeed: null,
      advSpeedUnit: null,
      advRpmValue: null,
      advGear: null,
      advGauges: null,
      dotsLeft: null,
      dotsRight: null,
      dots: {}
    };
    let registration: AdvancedHudRegistration | undefined;
    const HUDCore = {
      init: () => undefined,
      registerStyle: (_name: string, definition: AdvancedHudRegistration) => {
        registration = definition;
      },
    };

    new Function('window', 'document', 'HUDCore', 'domCache', extractController(readAdvancedHud()))(
      window,
      document,
      HUDCore,
      domCache
    );

    expect(registration).toBeDefined();
    registration?.onFrame(
      { gear: 1, speed_kmh: 0, throttle: 0.9, hand_brake: 0.82 },
      { lcState: 'inactive' },
    );
    expect(window.advLCState).toBe('armed');
    expect(window.advLCArmed).toBe(true);

    registration?.onFrame(
      { gear: 1, speed_kmh: 12, throttle: 0.9, hand_brake: 0 },
      { lcState: 'inactive' },
    );
    expect(window.advLCState).toBe('launched');
    expect(window.advLCLaunched).toBe(true);
  });
});
