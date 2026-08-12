import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type LayoutModule = {
  create: (options: Record<string, unknown>) => {
    render: (theme: string, data: unknown, palette: unknown, redlineRatio: number) => void;
  };
};

function loadLayoutsModule(): LayoutModule {
  const profileSource = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_layout_profiles.js'),
    'utf8',
  );
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_layouts.js'),
    'utf8',
  );
  const window = {} as { S650HmiLayouts?: LayoutModule };
  new Function('window', profileSource)(window);
  new Function('window', source)(window);

  if (!window.S650HmiLayouts) {
    throw new Error('S650 layouts module did not register itself');
  }
  return window.S650HmiLayouts;
}

function createLayouts(
  events: string[],
  foxbodyCalls: unknown[][] = [],
  performanceClusters: Record<string, unknown> | undefined = undefined,
) {
  return loadLayoutsModule().create({
    ctx: {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      fillText: () => undefined,
      clearRect: () => undefined,
      fillRect: () => undefined,
    },
    contract: {},
    view: {
      gauge: { leftCenterX: 256, rightCenterX: 1024, centerY: 250, radius: 180 },
      typography: { speedHero: 64, bodyM: 24, heritageDialAuxLabel: 16, heritageDialAuxLabelOffset: 44 },
      isMetric: true,
      showCenterInfo: true,
      showSpeed: true,
      showRPM: true,
      getSpeed: () => 120,
      roundedSpeed: () => 120,
      unitLabel: () => 'KM/H',
      getRpm: () => 4200,
      getMaxRpm: () => 8000,
      getTelemetryReadout: () => ({ value: '--', unit: '', ratio: 0.5 }),
    },
    primitives: {
      clearAndPaintBackground: () => undefined,
      drawHeader: () => undefined,
      drawCenterDecorations: () => events.push('decorations'),
      drawNormalStatus: () => events.push('status'),
      drawHeritageStatus: () => events.push('status'),
      drawSideGauge: () => events.push('sideGauge'),
      drawNormalEnergyDial: () => events.push('mainDial'),
      drawRetroDial: () => events.push('mainDial'),
      drawHeritageDial: () => events.push('mainDial'),
      drawFoxbodyDial: (...args: unknown[]) => {
        events.push('mainDial');
        foxbodyCalls.push(args);
      },
      drawSportCluster: () => events.push('sportCluster'),
      drawSvtCobraCluster: () => events.push('svtCobraCluster'),
      drawTrackCluster: () => events.push('trackCluster'),
      getHeritageDialScale: () => ({ max: 80 }),
    },
    performanceClusters,
    baseDriving: { draw: () => events.push('baseDriving') },
    centerInfo: { draw: () => events.push('centerInfo') },
    width: 1280,
    height: 480,
  });
}

describe('S650 dual layout pipeline', () => {
  it.each([
    ['normal', ['centerInfo', 'decorations', 'status', 'baseDriving', 'sideGauge', 'sideGauge', 'mainDial', 'mainDial']],
    ['heritage67', ['centerInfo', 'decorations', 'status', 'baseDriving', 'sideGauge', 'sideGauge', 'mainDial', 'mainDial']],
    ['foxbody', ['centerInfo', 'decorations', 'status', 'baseDriving', 'sideGauge', 'sideGauge', 'mainDial', 'mainDial']],
  ])('renders %s center layers before the main rings', (theme, expected) => {
    const events: string[] = [];
    const layouts = createLayouts(events);

    layouts.render(theme, { redlineRpm: 7000 }, { primary: '#C98D5A', secondary: '#98A0A8' }, 0.875);

    expect(events).toEqual(expected);
  });

  it('uses the metric Fox Body speed reminder at 60 km/h', () => {
    const events: string[] = [];
    const foxbodyCalls: unknown[][] = [];
    const layouts = createLayouts(events, foxbodyCalls);

    layouts.render('foxbody', { redlineRpm: 7000 }, { primary: '#C98D5A', secondary: '#98A0A8' }, 0.875);

    expect((foxbodyCalls[1][6] as { specialMark: number }).specialMark).toBe(60);
  });

  it('routes Track through its dedicated cluster without rendering dual-ring layers', () => {
    const events: string[] = [];
    const layouts = createLayouts(events);

    layouts.render('track', { redlineRpm: 7000 }, { primary: '#F04A3E', secondary: '#9AA3AD' }, 0.875);

    expect(events).toEqual(['trackCluster']);
  });

  it('routes Sport through its dedicated cluster without rendering dual-ring layers', () => {
    const events: string[] = [];
    const layouts = createLayouts(events);

    layouts.render('sport', { redlineRpm: 7000 }, { primary: '#E78B3F', secondary: '#B8AAA0' }, 0.875);

    expect(events).toEqual(['sportCluster']);
  });

  it('routes SVT Cobra through its dedicated cluster without rendering dual-ring layers', () => {
    const events: string[] = [];
    const layouts = createLayouts(events);

    layouts.render('svt_cobra', { redlineRpm: 7000 }, { primary: '#E8ECE7', secondary: '#A7AFA7' }, 0.875);

    expect(events).toEqual(['svtCobraCluster']);
  });

  it('prefers the transparent Track and SVT Cobra renderers when they are available', () => {
    const events: string[] = [];
    const layouts = createLayouts(events, [], {
      drawTrack: () => events.push('trackPerformance'),
      drawSvtCobra: () => events.push('svtPerformance'),
    });

    layouts.render('track', { redlineRpm: 7000 }, { primary: '#F04A3E', secondary: '#9AA3AD' }, 0.875);
    layouts.render('svt_cobra', { redlineRpm: 7000 }, { primary: '#E8ECE7', secondary: '#A7AFA7' }, 0.875);

    expect(events).toEqual(['trackPerformance', 'svtPerformance']);
  });
});
