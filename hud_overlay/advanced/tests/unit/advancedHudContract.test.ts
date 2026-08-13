import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const advancedHudPath = resolve(process.cwd(), '../hud_overlay/advanced/index.html');

function readAdvancedHud(): string {
  return readFileSync(advancedHudPath, 'utf8');
}

function extractController(html: string): string {
  const controller = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .find((source) => source.includes("HUDCore.registerStyle('advanced'"));
  if (!controller) throw new Error('Advanced HUD controller script not found');
  return controller;
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
    expect(html).toContain('throttlePercent >= 70 && handbrakePercent >= 50');
    expect(html).toContain('ADV_LC_FALLBACK_GO_FRAMES = 45');
    expect(html).toContain("stateLabel = b.launched ? 'LC GO' : (b.armed ? 'LC ARM' : b.label)");
    expect(html).toContain('window.advLCArmed = window.advLCState === \'armed\';');
    expect(html).toContain('window.advLCLaunched = window.advLCState === \'launched\';');
  });

  it('keeps the Advanced HUD inline scripts syntactically valid', () => {
    const scripts = [...readAdvancedHud().matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter((source) => source.trim().length > 0);

    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('drives the fallback from LC ARM to LC GO', () => {
    const window = {} as Record<string, unknown>;
    const document = { getElementById: () => null };
    let registration: AdvancedHudRegistration | undefined;
    const HUDCore = {
      init: () => undefined,
      registerStyle: (_name: string, definition: AdvancedHudRegistration) => {
        registration = definition;
      },
    };

    new Function('window', 'document', 'HUDCore', extractController(readAdvancedHud()))(
      window,
      document,
      HUDCore,
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
