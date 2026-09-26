import { describe, expect, it } from 'vitest';
import { dataOutDestinations } from './dataOutAddresses';
import type { RuntimeInfo } from '../../services/runtimeCapabilities';

describe('LAN Data Out destinations', () => {
  const info: RuntimeInfo = { platform: 'linux',
    capabilities: { hudOverlay: false, audioSpectrum: false, systemMedia: false, localMotecLaunch: false },
    telemetry: { port: 9234, listenAddresses: ['127.0.0.1', '192.168.1.2', '10.0.0.2'], error: null } };
  it('uses actual bound addresses and a changed receiver port', () => {
    expect(dataOutDestinations(info)).toEqual(['192.168.1.2:9234', '10.0.0.2:9234']);
  });
  it('does not invent destinations when discovery or binding failed', () => {
    expect(dataOutDestinations(null)).toEqual([]);
    expect(dataOutDestinations({ ...info, telemetry: { ...info.telemetry, port: null } })).toEqual([]);
    expect(dataOutDestinations({ ...info, telemetry: { ...info.telemetry,
      listenAddresses: ['127.0.0.1', '169.254.1.2', '0.0.0.0'] } })).toEqual([]);
  });
});
