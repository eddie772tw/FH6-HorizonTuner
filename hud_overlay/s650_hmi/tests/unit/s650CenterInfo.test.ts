import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Widget = 'disable' | 'drive' | 'tire_temp' | 'performance' | 'music';
type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX?: number;
  speedY?: number;
  gearY?: number;
  speedSize?: number;
  gearSize?: number;
  variant?: string;
  layoutStyle?: string;
};

type CenterInfoModule = {
  register: (definition: { id: string; render: (context: unknown) => void }) => void;
  list: () => Widget[];
  create: (options: {
    primitives: Record<string, (...args: unknown[]) => void>;
    contract: { centerWidgets: Widget[] };
    ctx?: Record<string, unknown>;
  }) => {
    draw: (view: { centerWidget?: string }, data: unknown, palette: unknown, regionOrX: Region | number, y?: number, width?: number, height?: number) => void;
    normalizeWidget: (view: { centerWidget?: string }) => Widget;
    widgets: Widget[];
  };
};

function createCanvasSpy() {
  const text: string[] = [];
  const ctx = {
    text,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    strokeRect: () => undefined,
    fillRect: () => undefined,
    fillText: (value: string) => text.push(value),
  } as unknown as Record<string, unknown>;
  return ctx;
}

type MusicLayoutSpec = {
  id: string;
  padX: number;
  padY: number;
  coverSize: number;
  coverOffsetY: number;
  textOffsetX: number;
  titleOffsetY: number;
  artistOffsetY: number;
  albumOffsetY: number;
  titleSize: number;
  artistSize: number;
  albumSize: number;
  symbolSize: number;
  symbolOffsetY: number;
  maxTitleLength: number;
  maxArtistLength: number;
  maxAlbumLength: number;
  progressOffsetY: number;
  progressHeight: number;
  timeOffsetY: number;
  timeSize: number;
};

type MusicContracts = {
  dualRing: MusicLayoutSpec;
  trackSidebar: MusicLayoutSpec;
};

function loadCenterInfoEnvironment(): {
  centerInfo: CenterInfoModule;
  musicContracts: MusicContracts;
} {
  const sourceFiles = [
    's650_center_info.js',
    's650_center_info_common.js',
    's650_center_info_disable.js',
    's650_center_info_drive.js',
    's650_center_info_tire_temp.js',
    's650_center_info_performance.js',
    's650_center_info_music.js',
  ];
  const source = sourceFiles
    .map((fileName) => readFileSync(resolve(process.cwd(), `../hud_overlay/s650_hmi/assets/${fileName}`), 'utf8'))
    .join('\n');
  const window = {} as {
    S650HmiCenterInfo?: CenterInfoModule;
    S650HmiCenterInfoMusicContracts?: MusicContracts;
  };
  new Function('window', source)(window);

  if (!window.S650HmiCenterInfo || !window.S650HmiCenterInfoMusicContracts) {
    throw new Error('S650 center-info module or music contracts did not register itself');
  }
  return {
    centerInfo: window.S650HmiCenterInfo,
    musicContracts: window.S650HmiCenterInfoMusicContracts,
  };
}

function loadCenterInfoModule(): CenterInfoModule {
  return loadCenterInfoEnvironment().centerInfo;
}

describe('S650 center-information registry contract', () => {
  it('keeps Disable as an explicit blank page', () => {
    const calls: string[] = [];
    const primitives = {
      drawGearAndSpeed: () => calls.push('drawGearAndSpeed'),
    };
    const centerInfo = loadCenterInfoModule().create({
      primitives,
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({ centerWidget: 'disable' }, {}, {}, 425, 126, 430, 230);

    expect(calls).toEqual([]);
  });

  it('renders tire temperature as an isolated page on the shared Canvas', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'tire_temp',
      getTireTemperatures: () => [80, 81, 82, 83],
      tireTemperatureUnit: () => '°C',
      formatTireTemperature: (value) => `${value}°`,
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, 100, 50, 200, 100);

    expect((ctx.text as string[])[0]).toBe('TIRE TEMPERATURE');
  });

  it('renders performance as an isolated page on the shared Canvas', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'performance',
      isMetric: true,
      getRpm: () => 4200,
      getMaxRpm: () => 8000,
      getPedalValue: (_data, pedal) => pedal === 'throttle' ? 0.75 : 0.2,
      getGearLabel: () => '4',
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, 100, 50, 200, 100);

    expect((ctx.text as string[])).toContain('POWERTRAIN');
    expect((ctx.text as string[])).toContain('4200 / 8000');
    expect((ctx.text as string[])).not.toContain('4');
  });

  it('renders the available GSMTC song metadata without requiring telemetry aliases', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'music',
      getMediaInfo: () => ({
        has_media: true,
        title: 'Night Drive',
        artist: 'The Horizon Set',
        album_title: 'Road Lines',
        track_number: 3,
        album_track_count: 12,
        genres: ['Electronic'],
        playback_type: 'music',
        status: 'playing',
        position_seconds: 75,
        start_seconds: 0,
        duration_seconds: 210,
      }),
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, 100, 50, 200, 220);

    expect((ctx.text as string[])).toContain('ND');
    expect((ctx.text as string[])).toContain('Night Drive');
    expect((ctx.text as string[])).toContain('The Horizon Set');
    expect((ctx.text as string[])).toContain('Road Lines');
    expect((ctx.text as string[])).toContain('▶');
    expect((ctx.text as string[])).toContain('1:15 / 3:30');
    expect((ctx.text as string[])).not.toContain('MUSIC PLAYER');
    expect((ctx.text as string[])).not.toContain('3 / 12');
    expect((ctx.text as string[])).not.toContain('Electronic');
    expect((ctx.text as string[])).not.toContain('playing');
    expect((ctx.text as string[])).not.toContain('music');
  });

  it('keeps absent media metadata visibly unavailable', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({ centerWidget: 'music', getMediaInfo: () => ({ has_media: false }) }, {}, {
      text: '#fff', secondary: '#aaa', primary: '#0ff',
    }, 100, 50, 200, 220);

    expect((ctx.text as string[])).toContain('NO ACTIVE MEDIA');
    expect((ctx.text as string[])).toContain('SYSTEM MEDIA SESSION NOT FOUND');
    expect((ctx.text as string[])).toContain('Metadata unavailable');
    expect((ctx.text as string[])).toContain('·');
    expect((ctx.text as string[])).toContain('--:-- / --:--');
  });

  it('uses the compact page renderer for a Track recipe region', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'performance',
      isMetric: true,
      getRpm: () => 4200,
      getMaxRpm: () => 8000,
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, {
      x: 782,
      y: 298,
      width: 286,
      height: 88,
      layoutStyle: 'trackSidebar',
    });

    expect((ctx.text as string[])).toContain('POWERTRAIN');
    expect((ctx.text as string[])).toContain('BOOST');
    expect((ctx.text as string[])).not.toContain('4200 / 8000');
  });

  it('does not inject pedal bars into every page', () => {
    const pedalCalls: unknown[][] = [];
    const centerInfo = loadCenterInfoModule().create({
      ctx: createCanvasSpy(),
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
        drawPedalBars: (...args) => pedalCalls.push(args),
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({ centerWidget: 'disable' }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, {
      x: 425,
      y: 132,
      width: 430,
      height: 224,
    });

    expect(pedalCalls).toHaveLength(0);
  });

  it('keeps pedal bars local to the driving page', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'drive',
      roundedSpeed: () => 120,
      unitLabel: () => 'KM/H',
      getGearLabel: () => '4',
      getTelemetryReadout: () => ({ value: '--', unit: '' }),
      getPedalValue: (_data, pedal) => pedal === 'throttle' ? 0.75 : 0.2,
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff', warning: '#ff0' }, {
      x: 425,
      y: 126,
      width: 430,
      height: 230,
    });

    expect((ctx.text as string[])).toContain('THR');
    expect((ctx.text as string[])).toContain('BRK');
  });

  it('uses the contract widget list and falls back to drive', () => {
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: () => undefined,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    expect(centerInfo.widgets).toEqual(['disable', 'drive', 'tire_temp', 'performance', 'music']);
    expect(centerInfo.normalizeWidget({ centerWidget: 'unknown' })).toBe('drive');
  });

  it('does not use a layout region to render core drive values', () => {
    let driveArgs: unknown[] = [];
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => { driveArgs = args; },
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({ centerWidget: 'drive' }, {}, {}, 100, 50, 200, 100);

    expect(driveArgs).toEqual([]);
  });

  it('does not use explicit drive anchors to render core values', () => {
    let driveArgs: unknown[] = [];
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => { driveArgs = args; },
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({ centerWidget: 'drive' }, {}, {}, {
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      centerX: 170,
      speedY: 64,
      gearY: 106,
      speedSize: 46,
      gearSize: 68,
    });

    expect(driveArgs).toEqual([]);
  });

  it('rejects duplicate page registration', () => {
    const module = loadCenterInfoModule();

    expect(() => module.register({ id: 'drive', render: () => undefined })).toThrow('Duplicate page id: drive');
  });

  it('exposes dual size contracts for music player with safe clearance for dual-ring layout', () => {
    const { musicContracts } = loadCenterInfoEnvironment();

    expect(musicContracts.dualRing).toBeDefined();
    expect(musicContracts.trackSidebar).toBeDefined();

    // Dual-ring geometric clearance against gauge circle tangency (X=460 left, X=820 right)
    const dualRingRegion = { x: 425, width: 430 };
    const contentLeft = dualRingRegion.x + musicContracts.dualRing.padX;
    const contentRight = dualRingRegion.x + dualRingRegion.width - musicContracts.dualRing.padX;

    expect(contentLeft - 460).toBeGreaterThanOrEqual(15);
    expect(820 - contentRight).toBeGreaterThanOrEqual(15);
    expect(musicContracts.dualRing.coverSize).toBeLessThanOrEqual(96);
    expect(musicContracts.dualRing.progressHeight).toBe(6);

    // Track sidebar compactness constraints
    expect(musicContracts.trackSidebar.coverSize).toBeLessThanOrEqual(48);
    expect(musicContracts.trackSidebar.progressHeight).toBe(4);
    expect(musicContracts.trackSidebar.maxTitleLength).toBeLessThan(musicContracts.dualRing.maxTitleLength);
  });

  it('renders music player in trackSidebar compact mode with appropriate truncation and progress', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance', 'music'] },
    });

    centerInfo.draw({
      centerWidget: 'music',
      getMediaInfo: () => ({
        has_media: true,
        title: 'Extremely Long Song Title Beyond Bounds',
        artist: 'Producer With Very Long Name',
        album_title: 'Unreleased Track Collection',
        status: 'playing',
        position_seconds: 45,
        start_seconds: 0,
        duration_seconds: 180,
      }),
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, {
      x: 840,
      y: 184,
      width: 220,
      height: 88,
      layoutStyle: 'trackSidebar',
    });

    // In trackSidebar, maxTitleLength is 16, so 15 chars + '…'
    expect((ctx.text as string[])).toContain('Extremely Long …');
    expect((ctx.text as string[])).toContain('Producer With Ver…');
    expect((ctx.text as string[])).toContain('▶');
    expect((ctx.text as string[])).toContain('0:45 / 3:00');
  });
});
