import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type CanonicalFrame = {
  rpm: number;
  maxRpm: number;
  redlineRpm: number;
  speed_kmh: number;
  speed_mph: number;
  gear: number;
  throttle: number;
  brake: number;
  distance_m: number;
  heading_deg: number;
  tire_temp_f: readonly (number | null)[];
  power_hp: number;
  power_kw: number;
  torque_nm: number;
  torque_ftlbs: number;
  boost_psi: number;
  boost_bar: number;
  fuel_ratio: number | null;
  lap: number | null;
  race_position: number | null;
};

type S650Contract = {
  version: string;
  defaultFrame: CanonicalFrame;
  normalizeFrame: (data: unknown) => CanonicalFrame;
  defaultMedia: Record<string, unknown>;
  normalizeMedia: (data: unknown) => Record<string, unknown>;
  reservedGsmTcIntegration: { events: string[]; methods: string[] };
  normalizeConfig: (payload: unknown) => Record<string, unknown>;
};

function loadContract(): S650Contract {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_contract.js'),
    'utf8',
  );
  const window = {} as { S650HmiContract?: S650Contract };
  new Function('window', source)(window);

  if (!window.S650HmiContract) {
    throw new Error('S650 contract module did not register itself');
  }
  return window.S650HmiContract;
}

describe('S650 frame defaults', () => {
  it('uses first gear as the default game output when telemetry is empty', () => {
    const contract = loadContract();

    expect(contract.defaultFrame.gear).toBe(1);
    expect(contract.normalizeFrame({}).gear).toBe(1);
  });

  it('preserves explicit reverse and neutral gear values', () => {
    const contract = loadContract();

    expect(contract.normalizeFrame({ gear: 0 }).gear).toBe(0);
    expect(contract.normalizeFrame({ gear: 11 }).gear).toBe(11);
  });

  it('accepts only the v2 canonical telemetry shape and retains its fixed units', () => {
    const contract = loadContract();
    const frame = contract.normalizeFrame({
      rpm: 6123,
      maxRpm: 7500,
      redlineRpm: 6800,
      speed_kmh: 123.4,
      speed_mph: 76.7,
      gear: 4,
      throttle: 0.8,
      brake: 0.2,
      distance_m: 1532,
      heading_deg: 90,
      tire_temp_f: [200, 201, 198, 199],
      power_hp: 452,
      power_kw: 337,
      torque_nm: 610,
      torque_ftlbs: 450,
      boost_psi: 15.2,
      boost_bar: 1.05,
      fuel_ratio: 0.85,
      lap: 3,
      race_position: 2,
    });

    expect(contract.version).toBe('s650-hmi/v2');
    expect(frame).toMatchObject({
      rpm: 6123,
      maxRpm: 7500,
      redlineRpm: 6800,
      speed_kmh: 123.4,
      speed_mph: 76.7,
      gear: 4,
      throttle: 0.8,
      brake: 0.2,
      distance_m: 1532,
      heading_deg: 90,
      tire_temp_f: [200, 201, 198, 199],
      power_hp: 452,
      power_kw: 337,
      torque_nm: 610,
      torque_ftlbs: 450,
      boost_psi: 15.2,
      boost_bar: 1.05,
      fuel_ratio: 0.85,
      lap: 3,
      race_position: 2,
    });
  });

  it('does not translate raw telemetry aliases or raw input units inside the renderer contract', () => {
    const contract = loadContract();
    const frame = contract.normalizeFrame({
      CurrentEngineRpm: 6123,
      EngineMaxRpm: 7500,
      SpeedMetersPerSecond: 34.28,
      Gear: 4,
      AccelInput: 204,
      BrakeInput: 51,
      DistanceTraveled: 1532,
      Yaw: Math.PI / 2,
      TireTemp: [200, 201, 198, 199],
      PowerWatts: 337000,
      TorqueNewtons: 610,
      Boost: 15.2,
      Fuel: 0.85,
      LapNumber: 3,
      RacePosition: 2,
    });

    expect(frame).toEqual(contract.defaultFrame);
    expect(frame).not.toHaveProperty('SpeedMetersPerSecond');
    expect(frame).not.toHaveProperty('AccelInput');
    expect(frame).not.toHaveProperty('TireTemp');
  });

  it('ignores obsolete drive-mode settings at the S650 renderer boundary', () => {
    const contract = loadContract();
    const config = contract.normalizeConfig({
      s650Theme: 'foxbody',
      driveMode: 'track',
      drive_mode: 'sport',
      matchDriveMode: true,
    });

    expect(config.theme).toBe('foxbody');
    expect(config).not.toHaveProperty('driveMode');
    expect(config).not.toHaveProperty('matchDriveMode');
  });

  it('declares the complete media-properties projection and normalizes rich metadata', () => {
    const contract = loadContract();
    const media = contract.normalizeMedia({
      title: 'Night Drive',
      artist: 'The Horizon Set',
      album_title: 'Road Lines',
      album_artist: 'The Horizon Set',
      album_track_count: '12',
      track_number: '3',
      genres: ['Electronic', 42, 'Synthwave'],
      playback_type: 'music',
      subtitle: 'Radio edit',
      thumbnail_available: true,
      status: 'playing',
      position_seconds: '75',
      duration_seconds: '210',
      can_seek: true,
      is_shuffle_active: true,
      repeat_mode: 'list',
      playback_rate: '1.25',
      playback_controls: { is_next_enabled: true },
      has_media: true,
    });

    expect(Object.keys(contract.defaultMedia)).toEqual([
      'title', 'artist', 'album_title', 'album_artist', 'album_track_count',
      'track_number', 'genres', 'playback_type', 'subtitle', 'thumbnail',
      'thumbnail_available', 'status', 'position_seconds', 'start_seconds',
      'duration_seconds', 'min_seek_seconds', 'max_seek_seconds',
      'timeline_last_updated_ms', 'can_seek', 'is_shuffle_active', 'repeat_mode',
      'playback_rate', 'playback_controls', 'source_app_user_model_id',
      'has_media', 'state', 'source', 'success',
    ]);
    expect(media).toMatchObject({
      title: 'Night Drive',
      album_title: 'Road Lines',
      album_track_count: 12,
      track_number: 3,
      genres: ['Electronic', 'Synthwave'],
      position_seconds: 75,
      duration_seconds: 210,
      has_media: true,
      thumbnail_available: true,
    });
    expect(contract.reservedGsmTcIntegration).toEqual({
      events: [
        'CurrentSessionChanged',
        'MediaPropertiesChanged',
        'PlaybackInfoChanged',
        'TimelinePropertiesChanged',
      ],
      methods: expect.arrayContaining([
        'TryTogglePlayPauseAsync',
        'TryChangePlaybackPositionAsync',
        'TrySkipNextAsync',
      ]),
    });
  });
});
