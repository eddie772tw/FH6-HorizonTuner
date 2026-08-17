import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const driftHudPath = resolve(process.cwd(), '../hud_overlay/drift/index.html');

function readDriftHud(): string {
  return readFileSync(driftHudPath, 'utf8');
}

function extractInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim().length > 0);
}

function extractSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return '';
  return source.slice(start, end);
}

type DriftHudRegistration = {
  onFrame: (data: Record<string, unknown>, payload: Record<string, unknown>) => void;
};

function createSecondaryRendererHarness() {
  const drawnText: string[] = [];
  const drawCalls: Array<{ type: string; args: unknown[] }> = [];
  const rendererErrors: unknown[][] = [];
  const animationFrames: Array<() => void> = [];
  const gradient = { addColorStop: () => undefined };
  const record = (type: string, ...args: unknown[]) => {
    drawCalls.push({ type, args });
  };
  const context = new Proxy(
    {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      fillText: (text: unknown, ...args: unknown[]) => {
        drawnText.push(String(text));
        record('fillText', text, ...args);
      },
      beginPath: (...args: unknown[]) => record('beginPath', ...args),
      fill: (...args: unknown[]) => record('fill', ...args),
      stroke: (...args: unknown[]) => record('stroke', ...args),
    },
    {
      get(target, property) {
        return property in target
          ? target[property as keyof typeof target]
          : (...args: unknown[]) => record(String(property), ...args);
      },
    },
  );
  const canvas = {
    width: 1920,
    height: 1080,
    style: {},
    getContext: () => context,
  };
  const document = {
    addEventListener: () => undefined,
    getElementById: (id: string) => (id === 'driftCanvas' ? canvas : null),
  };
  const window = {
    DriftLayout: {
      getViewportTransform: () => ({ scale: 1, offsetX: 0, offsetY: 0 }),
      getFh6PrimaryAnchor: () => ({ centerX: 500, centerY: 400, width: 500, height: 240 }),
      getBottomRightAnchor: () => ({ centerX: 1600, centerY: 900, width: 590, height: 288 }),
      ellipsePoint: (_t: number, centerX: number, centerY: number) => ({ x: centerX, y: centerY }),
      fillSweepState: () => undefined,
    },
    addEventListener: () => undefined,
    devicePixelRatio: 1,
    innerHeight: 1080,
    innerWidth: 1920,
  };
  let registration: DriftHudRegistration | undefined;
  const HUDCore = {
    init: () => undefined,
    registerStyle: (_name: string, style: DriftHudRegistration) => {
      registration = style;
    },
  };

  return {
    animationFrames,
    document,
    drawnText,
    drawCalls,
    HUDCore,
    registration: () => registration,
    rendererErrors,
    requestAnimationFrame: (callback: () => void) => {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    setTimeout: () => 0,
    window,
  };
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
    expect(html).toContain('id="drift-style-special"');
    expect(html).not.toContain('drift-popup-hero');
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
    expect(html).toContain('function drawSecondaryLinearRail(');
    expect(html).toContain('function secondaryRailPointX(');
    expect(html).toContain('function secondaryRailPointY(');
    expect(html).toContain('function drawSecondaryAttitudeIndicator(');
    expect(html).toContain('function drawSecondaryGripLights(');
    expect(html).toContain("accelPct / 100, C_ICE, 'THROTTLE'");
    expect(html).toContain("brakePct / 100, C_BRAKE, 'BRAKE'");
    expect(html).toContain("clutchPct / 100, C_WHITE_DIM, 'CLUTCH'");
    expect(html).toContain("handbrakePct / 100, C_AMBER, 'HANDBRAKE'");
    expect(html).toContain('var slipAnglesDeg = [0, 0, 0, 0];');
    expect(html).toContain('var travelAngleDeg = 0;');
    expect(html).toContain("lcState === 'armed' || lcState === 'launched'");
    expect(html).toContain('function resolveLaunchControlState(');
    expect(html).toContain('rawGear === 1 && rawSpeed < 8');
    expect(html).toContain("rawGear === 0 ? 'R' : (rawGear === 11 ? 'N'");
    expect(html).not.toContain("rawGear === 11 || rawGear === 10 ? 'N'");
    expect(html).toContain('TireSlipAngle');
    expect(html).toContain('DRIFT CONTROL');
    expect(html).toContain('function traceSecondarySuperArc(');
    expect(html).toContain('var SECONDARY_SOURCE_WIDTH = 520;');
    expect(html).toContain('function renderSecondaryInstrumentAtConventionalAnchor()');
    expect(html).toContain('var SECONDARY_BOX_PADDING = 30;');
    expect(html).toContain('var PRIMARY_SLOT_PREFERRED_WIDTH = 260;');
    expect(html).toContain('var primaryRenderScale = 0.30;');
    expect(html).toContain('renderCenterGearCluster();');
    expect(html).toContain('renderSecondaryInstrument();');
    expect(html).toContain('function triggerDriftSweepAnimation()');
    expect(html).toContain('function renderDriftStyleSpecial(');
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

  it('renders one active secondary frame with input, attitude, and grip-light telemetry', () => {
    const html = readDriftHud();
    const [controller] = extractInlineScripts(html);
    const primaryCluster = extractSection(
      controller,
      'function renderCenterGearCluster()',
      'function renderRightRatingCluster()',
    );
    const activeSecondary = extractSection(
      controller,
      'function renderSecondaryInstrument()',
      'function renderSecondaryInstrumentAtConventionalAnchor()',
    );
    const secondarySource = extractSection(
      controller,
      'function secondaryRailPointX',
      'function renderSecondaryInstrumentAtConventionalAnchor()',
    );

    expect(primaryCluster).toContain('displaySpeed');
    expect(primaryCluster).toContain('gear');
    expect(primaryCluster).toContain("isMetricUnit ? 'KM/H' : 'MPH'");
    expect(activeSecondary).not.toContain('displaySpeed');
    expect(activeSecondary).not.toContain('String(gear)');
    expect(activeSecondary).not.toContain("'KM/H'");
    expect(activeSecondary).not.toContain("'MPH'");
    expect(activeSecondary).toContain('drawSecondaryLcBadge(top, right);');
    expect(html).toContain('var DRIFT_STYLE_TOKENS');
    expect(secondarySource).toContain('DRIFT_STYLE_TOKENS.edgeAlpha');
    expect(secondarySource).toContain('DRIFT_STYLE_TOKENS.trackAlpha');
    expect(secondarySource).toContain('quadraticCurveTo(controlX, controlY, endX, endY)');
    expect(secondarySource).toContain('quadraticCurveTo(q0X, q0Y, activeX, activeY)');
    expect(secondarySource).toContain('inputLeft + 2, bottom - 26, inputCenter - 14, top + 168');
    expect(secondarySource).toContain('inputRight - 2, bottom - 26, inputCenter + 14, top + 168');
    expect(secondarySource).not.toContain('secondarySuperPoint');
    expect(secondarySource).not.toContain('drawSecondaryAdvancedArcBand');
    expect(secondarySource).not.toContain("ctx.fillText('HEAD'");
    expect(secondarySource).not.toContain("ctx.fillText('TRAVEL'");
    expect(secondarySource).not.toContain("ctx.fillText('SLIP VECTOR'");
    expect(secondarySource).toContain('ctx.rotate(-travelAngleDeg * Math.PI / 180)');
    expect(html).toContain('travelAngleDeg = displayAngle;');
    expect(html).not.toContain('worldTravelDegrees - yawDegrees');
    expect(html).toContain("stateLabel = launched ? 'LC GO' : (active ? 'LC ARM' : 'LC')");
    expect(html).toContain('var LC_FALLBACK_GO_FRAMES = 45;');
    expect(html).toContain('handbrakePct >= 78 && prevInputs.H <= 20');
    expect(html).toContain('speedKmh >= 25 && accelPct >= 35 && brakePct <= 20');
    expect(html).toContain('absA >= 12 && Math.abs(steerPct) >= 30');
    expect(html).toContain("triggerDriftStyleSpecial('brake_rotation'");
    expect(html).toContain("triggerDriftStyleSpecial('throttle_punch'");
    expect(html).toContain("triggerDriftStyleSpecial('counter_snap'");
    expect(html).toContain("triggerDriftStyleSpecial('direction_switch'");
    expect(html).toContain("triggerDriftStyleSpecial('angle_lock'");
    expect(html).toContain("triggerDriftStyleSpecial('grip_save'");
    expect(html).toContain("compactPrimary ? 'bold 48px Bahnschrift'");
    expect(html).toContain('--drift-label-font');
    expect(html).toContain('--drift-warning-font');
    expect(html).toContain('--drift-track-color: rgba(255, 255, 255, 0.18)');
    expect(html).toContain('surface: [');
    expect(html).toContain("'rgba(13, 28, 43, 0.68)'");
    expect(html).toContain("'rgba(7, 15, 27, 0.56)'");
    expect(html).toContain("'rgba(7, 14, 24, 0.42)'");
    expect(html).toContain('background: rgba(6, 14, 26, 0.58);');
    expect(html).toContain('border: 0;');
    expect(html).toContain('box-shadow: 0 8px 26px rgba(0, 0, 0, 0.42)');
    expect(html).toContain("var C_BRAKE = 'rgba(255, 92, 164, 0.92)'");
    expect(html).toContain('var C_REDLINE = \'rgb(255, 0, 102)\'');
    const harness = createSecondaryRendererHarness();
    const executeController = new Function(
      'window',
      'document',
      'HUDCore',
      'requestAnimationFrame',
      'setTimeout',
      'performance',
      'console',
      controller,
    );

    executeController(
      harness.window,
      harness.document,
      harness.HUDCore,
      harness.requestAnimationFrame,
      harness.setTimeout,
      { now: () => 1_000 },
      { error: (...args: unknown[]) => harness.rendererErrors.push(args) },
    );

    const registration = harness.registration();
    expect(registration).toBeDefined();
    registration?.onFrame(
      {
        TireSlipAngle: [0.12, -0.18, 0.24, -0.3],
        TireSlipRatio: [0.1, 0.28, 0.4, 0.5],
        Yaw: 0.18,
        brake: 0.58,
        clutch: 0.66,
        gear: 4,
        hand_brake: 0.82,
        maxRpm: 8_500,
        rpm: 6_400,
        speed_kmh: 96,
        steer: 0.55,
        throttle: 0.87,
        vel_x: 24,
        vel_z: 36,
      },
      { isMetric: true, lcState: 'armed', lockup: { fl: false, fr: true, rl: false, rr: true } },
    );

    const firstFrame = harness.animationFrames.shift();
    expect(firstFrame).toBeDefined();
    firstFrame?.();

    expect(harness.rendererErrors).toEqual([]);
    expect(harness.drawCalls.filter(({ type }) => type === 'rotate').length).toBeGreaterThan(0);
    expect(harness.drawCalls.filter(({ type }) => type === 'fillText').length).toBeGreaterThan(20);
    expect(harness.drawnText).toEqual(
      expect.arrayContaining([
        '96',
        '4',
        'KM/H',
        'LC ARM',
        'THROTTLE',
        '87%',
        'BRAKE',
        '58%',
        'CLUTCH',
        '66%',
        'HANDBRAKE',
        '82%',
        'DRIVER INPUTS',
        'VEHICLE DYNAMICS',
        'HD',
        'TRV',
        'SLIP',
        'FL',
        'FR',
        'RL',
        'RR',
      ]),
    );

    harness.drawnText.length = 0;
    registration?.onFrame(
      {
        gear: 1,
        hand_brake: 0.82,
        speed_kmh: 0,
        throttle: 0.90,
      },
      { isMetric: true, lcState: 'inactive' },
    );
    const fallbackFrame = harness.animationFrames.shift();
    expect(fallbackFrame).toBeDefined();
    fallbackFrame?.();
    expect(harness.drawnText).toContain('LC ARM');

    harness.drawnText.length = 0;
    registration?.onFrame(
      {
        gear: 1,
        hand_brake: 0,
        speed_kmh: 12,
        throttle: 0.90,
      },
      { isMetric: true, lcState: 'inactive' },
    );
    const goFrame = harness.animationFrames.shift();
    expect(goFrame).toBeDefined();
    goFrame?.();
    expect(harness.drawnText).toContain('LC GO');
  });
});
