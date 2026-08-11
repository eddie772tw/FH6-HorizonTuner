import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const driftHudPath = resolve(process.cwd(), '../hud_overlay/drift/index.html');

function readDriftHud(): string {
  return readFileSync(driftHudPath, 'utf8');
}

function extractInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim().length > 0);
}

describe('Drift HUD contract', () => {
  it('keeps the inline HUD controller syntactically valid', () => {
    const scripts = extractInlineScripts(readDriftHud());

    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0])).not.toThrow();
  });

  it('keeps the PR#185 primary/secondary and shared-card mounts intact', () => {
    const html = readDriftHud();

    expect(html).toContain('<div id="teleCardsMount"></div>');
    expect(html).toContain('<canvas id="driftCanvas" width="1680" height="640"></canvas>');
    expect(html).toContain('<div id="drift-style-container" aria-hidden="true">');
    expect(html).toContain('id="drift-style-meter-fill"');
    expect(html).toContain('function renderCenterGearCluster()');
    expect(html).toContain('function renderSecondaryInstrument()');
    expect(html).toContain('renderCenterGearCluster();');
    expect(html).toContain('renderSecondaryInstrument();');
  });

  it('preserves the 60 Hz canvas loop and throttled Style Meter DOM paint', () => {
    const html = readDriftHud();

    expect(html).toContain('requestAnimationFrame(renderLoop);');
    expect(html).toContain('driftStyleUi.nextPaintAt = now + 80;');
    expect(html).toContain('The engine advances at RAF cadence');
    expect(html).toContain('refreshed at 12.5 Hz');
    expect(html).toContain('driftStyleEngine.reset()');
  });
});
