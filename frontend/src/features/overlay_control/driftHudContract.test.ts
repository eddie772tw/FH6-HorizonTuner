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
    expect(html).toContain('<canvas id="driftCanvas" width="1920" height="1080"></canvas>');
    expect(html).toContain('<div id="drift-style-container" aria-hidden="true">');
    expect(html).toContain('./assets/drift_layout.js?v=drift-layout-20260812');
    expect(html).toContain('right: 4vw;');
    expect(html).toContain('top: 28vh;');
    expect(html).toContain('id="drift-style-meter-fill"');
    expect(html).toContain('function renderCenterGearCluster()');
    expect(html).toContain('function renderPrimaryInstrument()');
    expect(html).toContain('getFh6PrimaryAnchor(');
    expect(html).toContain('var primaryAnchor = null;');
    expect(html).toContain('function renderSecondaryInstrument()');
    expect(html).toContain('function drawSecondaryPanelPath(');
    expect(html).toContain('function drawSecondaryArcGauge(');
    expect(html).toContain('var SECONDARY_SOURCE_WIDTH = 520;');
    expect(html).toContain('function renderSecondaryInstrumentAtConventionalAnchor()');
    expect(html).toContain('var SECONDARY_BOX_PADDING = 30;');
    expect(html).toContain('var PRIMARY_SLOT_PREFERRED_WIDTH = 260;');
    expect(html).toContain('var primaryRenderScale = 0.30;');
    expect(html).toContain('renderCenterGearCluster();');
    expect(html).toContain('renderSecondaryInstrument();');
    expect(html).toContain('function triggerDriftSweepAnimation()');
    expect(html).toContain('setTimeout(triggerDriftSweepAnimation, 80);');
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
